import { db, FieldVal, Timestamp } from "../firebase.js";
import { selWeightedTrack } from "./selection.js";
import { cleanPlayed } from "../audio/cleanup.js";

const STATION_ID = 'global';
const TRACK_Lim = 20;

const stationRef = db.collection('stations').doc(STATION_ID);

function tsMillis(val) {
    return val?.toMillis?.() ?? null;
}

function serializeStation(data, serverTime = Date.now()) {
    if (!data || data.status !== 'playing') {
        return {
            status: 'waiting',
            songNum: data?.songNum ?? null,
            serverTime,
            song: null,
            position: null,
            remaining: null,
        };
    }
    const startedAt = tsMillis(data.startedAt);
    const endsAt = tsMillis(data.endsAt);

    if (startedAt === null || endsAt === null) {
        throw new Error('Invalid station data: missing timestamps');
    }
    return {
        status: 'playing',
        songNum: data.songNum,
        serverTime,
        song: {
            canonicalTrackId: data.canonicalTrackId,
            title: data.title,
            artist: data.artist,
            duration: data.duration,
            audUrl: `/api/audio/${data.canonicalTrackId}`,
        },
        startedAt,
        endsAt,
        position: Math.max(0, (serverTime - startedAt) / 1000),
        remaining: Math.max(0, (endsAt - serverTime) / 1000 ),
    };
}

async function triggerAutoAcquisition() {
    try {
        const snap = await db.collection('canonical_tracks').where('published', '==', true).limit(5).get();
        for (const doc of snap.docs) {
            const cacheDoc = await db.collection('audio_cache').doc(doc.id).get();
            if (!cacheDoc.exists || (cacheDoc.data().status !== 'downloading' && cacheDoc.data().status !== 'ready')) {
                const { acquireTrackAudio } = await import('../audio/acquisition.js');
                await acquireTrackAudio(doc.id);
                advanceStation({ force: true }).catch(() => {});
                break;
            }
        }
    } catch (err) {
        console.warn('Auto-acquisition notice:', err.message);
    }
}

let inflightAdvance = null;

export async function advanceStation({
    force = false,
    expSongNum = null,
    endReason = 'completed',
} = {}) {
    if (!force && inflightAdvance) {
        return inflightAdvance;
    }

    const run = async () => {
        const now = Date.now();
        try {
            const res = await db.runTransaction(async (tx) => {
                const currSnap = await tx.get(stationRef);
                const curr = currSnap.exists ? currSnap.data() : null;
                const currSongNum = curr?.songNumber ?? curr?.songNum;
                if (
                    expSongNum !== null &&
                    Number(currSongNum) !== Number(expSongNum)
                ) {
                    return serializeStation(curr, now);
                }
                const previousSongNumber = currSongNum;
                const previousHistoryRef = previousSongNumber ? db.collection('play_history').doc(String(previousSongNumber)) : null;
                const previousHistorySnapshot = previousHistoryRef ? await tx.get(previousHistoryRef) : null;
                if ( !force && curr?.status === 'playing' && tsMillis(curr.endsAt) > now ) return serializeStation(curr, now);
                let prevCache = null;
                if (curr?.canonicalTrackId) {
                    const prevRef = db.collection('audio_cache').doc(curr.canonicalTrackId);
                    prevCache = await tx.get(prevRef);
                }
                const ready = db.collection('audio_cache').where('status', '==', 'ready').limit(TRACK_Lim);
                const readySnap = await tx.get(ready);
                let candidates = readySnap.docs.filter((doc) => {
                    const duration = doc.data().duration;
                    return Number.isFinite(duration) && duration > 0;
                });
                const docsToRecycle = [];
                if (candidates.length === 0) {
                    const allCacheSnap = await tx.get(db.collection('audio_cache').limit(TRACK_Lim));
                    for (const doc of allCacheSnap.docs) {
                        const d = doc.data();
                        if (d.duration > 0 && d.status !== 'downloading' && d.status !== 'failed') {
                            docsToRecycle.push(doc);
                            candidates.push(doc);
                        }
                    }
                }
                const canonicalRefs = candidates.map((doc) => db.collection('canonical_tracks').doc(doc.id));
                const canonicalSnaps = canonicalRefs.length ? await tx.getAll(...canonicalRefs) : [];
                const candies = candidates.map((cacheDoc, idx) => {
                    const canonicalSnap = canonicalSnaps[idx];
                    return {
                        cacheDoc, track: canonicalSnap.exists ? canonicalSnap.data() : null
                    };
                }).filter(({ track }) => track);
                const recentArtists = Array.isArray(curr?.recentArtists) ? curr.recentArtists.map((artist) => String(artist).toLowerCase()) : [];
                const otherCandies = candies.filter((c) => c.cacheDoc.id !== curr?.canonicalTrackId);
                const pool = otherCandies.length > 0 ? otherCandies : candies;
                const selected = selWeightedTrack(pool, new Set(recentArtists));
                const candidate = selected?.cacheDoc ?? null;
                for (const doc of docsToRecycle) {
                    tx.update(doc.ref, { status: 'ready', updatedAt: FieldVal.serverTimestamp() });
                }
                for (const doc of readySnap.docs) {
                    const duration = doc.data().duration;
                    if (!Number.isFinite(duration) || duration <= 0) {
                        tx.update(doc.ref, { status: 'failed', updatedAt: FieldVal.serverTimestamp() });
                    }
                }
                if (prevCache?.exists && prevCache.data().status === 'playing') {
                    tx.update(prevCache.ref, { 
                        status: 'ready', 
                        playedAt: FieldVal.serverTimestamp(), 
                        updatedAt: FieldVal.serverTimestamp() 
                    });
                    if (previousHistoryRef && previousHistorySnapshot?.exists) {
                        tx.update(previousHistoryRef, {
                            endedAt: Timestamp.fromMillis(now),
                            endReason,
                        });
                    }
                }
                const nextSongNum = (curr?.songNum ?? 0) + 1;
                if (!candidate) {
                    triggerAutoAcquisition().catch(() => {});
                    const waiting = {
                        status: 'waiting',
                        songNum: nextSongNum,
                        canonicalTrackId: null,
                        title: null,
                        artist: null,
                        duration: null,
                        startedAt: null,
                        endsAt: null,
                        updatedAt: FieldVal.serverTimestamp(),
                    };
                    tx.set(stationRef, waiting, { merge: true });
                    return serializeStation(waiting, now);
                }
                const track = candidate.data();
                const duration = track.duration;
                const startedAt = Timestamp.fromMillis(now);
                const endsAt = Timestamp.fromMillis(now + duration * 1000);
                tx.update(candidate.ref, { status: 'playing', startedAt, endsAt, updatedAt: FieldVal.serverTimestamp() });
                const selectedArtist = String( selected.track.artist ?? '').trim().toLowerCase();
                const nextRecentArtists = selectedArtist ? [ selectedArtist, ...recentArtists.filter((artist) => artist !== selectedArtist), ].slice(0, 5) : recentArtists;
                const next = {
                    status: 'playing',
                    songNum: nextSongNum,
                    canonicalTrackId: track.canonicalTrackId,
                    title: track.title,
                    artist: track.artist,
                    duration: track.duration,
                    startedAt,
                    endsAt,
                    recentArtists: nextRecentArtists,
                    updatedAt: FieldVal.serverTimestamp(),
                };
                tx.set(stationRef, next, { merge: true });
                const historyRef = db
                    .collection('play_history')
                    .doc(String(nextSongNum));
                tx.set(historyRef, {
                    songNumber: nextSongNum,
                    canonicalTrackId: candidate.id,
                    title: selected.track.title ?? candidate.data().title ?? 'Unknown',
                    artist: selected.track.artist ?? candidate.data().artist ?? 'Unknown',
                    startedAt: Timestamp.fromMillis(now),
                    endedAt: Timestamp.fromMillis(
                        now + Number(track.duration ?? 0) * 1000
                    ),
                    likes: Number(selected.track.likes ?? 0),
                    dislikes: Number(selected.track.dislikes ?? 0),
                });
                return serializeStation(next, now);
            });
            cleanPlayed().catch(() => {});
            return res;
        } catch (err) {
            if (err.code === 10 || err.message?.includes('contention') || err.message?.includes('Aborted')) {
                const snap = await stationRef.get();
                if (snap.exists) {
                    return serializeStation(snap.data(), Date.now());
                }
            }
            throw err;
        }
    };

    if (!force) {
        inflightAdvance = run().finally(() => {
            inflightAdvance = null;
        });
        return inflightAdvance;
    }

    return run();
}

export async function getStation({ advanceIfEnding = false } = {}) {
    const now = Date.now();
    try {
        const snap = await stationRef.get();
        if (snap.exists) {
            const data = snap.data();
            const endsAt = tsMillis(data.endsAt);
            const remaining = endsAt ? (endsAt - now) : 0;
            const threshold = advanceIfEnding ? 1000 : 0;
            if (data.status === 'playing' && remaining > threshold) {
                return serializeStation(data, now);
            }
            const updatedAt = tsMillis(data.updatedAt) || 0;
            if (data.status === 'waiting' && (now - updatedAt < 5000)) {
                return serializeStation(data, now);
            }
        }
    } catch {}
    return advanceStation();
}

export async function getStationSnap() {
    const snapshot = await stationRef.get();
    return serializeStation(snapshot.exists ? snapshot.data() : null);
}

export const advStation = advanceStation;