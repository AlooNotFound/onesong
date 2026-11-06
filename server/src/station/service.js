import { db, FieldVal, Timestamp } from "../firebase.js";
import { selWeightedTrack } from "./selection.js";

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

export async function advanceStation({
    force = false,
    expectedSongNumber = null,
    endReason = 'completed',
} = {}) {
    const now = Date.now();
    return db.runTx(async (tx) => {
        const currSnap = await tx.get(stationRef);
        const curr = currSnap.exists ? currSnap.data() : null;
        const currentSongNumber = curr?.songNumber ?? curr?.songNum;
        if (
            expectedSongNumber !== null &&
            Number(currentSongNumber) !== Number(expectedSongNumber)
        ) {
            return serializeStation(curr, now);
        }
        const previousSongNumber = currentSongNumber;
        const previousHistoryRef = previousSongNumber
            ? db.collection('play_history').doc(String(previousSongNumber))
            : null;
        const previousHistorySnapshot = previousHistoryRef
            ? await tx.get(previousHistoryRef)
            : null;
        if (
            !force &&
            curr?.status === 'playing' &&
            tsMillis(curr.endsAt) > now
        ) {
            return serializeStation(curr, now);
        }
        let prevCache = null;
        if (curr?.canonicalTrackId) {
            const prevRef = db.collection('audio_cache').doc(curr.canonicalTrackId);
            prevCache = await tx.get(prevRef);
        }
        const ready = db.collection('audio_cache').where('status', '==', 'ready').orderBy('addedAt', 'desc').limit(TRACK_Lim);
        const readySnap = await tx.get(ready);
        
        const candidates = readySnap.docs.filter((doc) => {
            const duration = doc.data().duration;
            return Number.isFinite(duration) && duration > 0;
        });
        const canonicalRefs = candidates.map((doc) => db.collection('canonical_tracks').doc(doc.id));
        const canonicalSnaps = canonicalRefs.length ? await tx.getAll(...canonicalRefs) : [];
        const candies = candidates.map((cacheDoc, idx) => {
            const canonicalSnap = canonicalSnaps[idx];
            return {
                cacheDoc, track: canonicalSnap.exists ? canonicalSnap.data() : null
            };
        }).filter(({ track }) => track);

        const recentArtists = Array.isArray(curr?.recentArtists) ? curr.recentArtists.map((artist) => String(artist).toLowerCase()) : [];
        const selected = selWeightedTrack(candies, new Set(recentArtists));
        const candidate = selected?.cacheDoc ?? null;
        for (const doc of readySnap.docs) {
            const duration = doc.data().duration;
            if (!Number.isFinite(duration) || duration <= 0) {
                tx.update(doc.ref, { status: 'failed', updatedAt: FieldVal.serverTimestamp() });
            }
        }
        if ( prevCache?.exists && prevCache.data().status === 'playing') {
            tx.update(prevCache.ref, { status: 'deleting', playedAt: FieldVal.serverTimestamp(), updatedAt: FieldVal.serverTimestamp() });
            if (previousHistoryRef && previousHistorySnapshot?.exists) {
                tx.update(previousHistoryRef, {
                    endedAt: Timestamp.fromMillis(now),
                    endReason,
                });
            }
        }
        const nextSongNum = (curr?.songNum ?? 0) + 1;
        if (!candidate) {
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
                now + Number(candidate.data().durationSeconds) * 1000
            ),
            likes: Number(selected.track.likes ?? 0),
            dislikes: Number(selected.track.dislikes ?? 0),
        });
        return serializeStation(next, now);
    })
}

export async function getStation() {
    return advanceStation();
}

export const advStation = advanceStation;