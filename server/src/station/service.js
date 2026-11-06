import { db, FieldVal, Timestamp } from "../firebase.js";

const STATION_ID = 'global';
const TRACK_Lim = 20;

const stationRef = db.collection('stations').doc(STATION_ID);

function tsMillis(val) {
    return val?.toMillis?.() ?? null;
}

function serialize(data, serverTime = Date.now()) {
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

export async function advStation() {
    const now = Date.now();
    return db.runTx( async (tx) => {
        const currSnap = await tx.get(stationRef);
        const curr = currSnap.exists ? currSnap.data() : null;
        if (curr?.status !== 'playing' || tsMillis(curr.endsAt) <= now) {
            return serialize(curr, now);
        }
        let prevCache = null;
        if (curr?.canonicalTrackId) {
            const prevRef = db.collection('audio_cache').doc(curr.canonicalTrackId);
            prevCache = await tx.get(prevRef);
        }
        const ready = db.collection('audio_cache').where('status', '==', 'ready').orderBy('addedAt', 'desc').limit(TRACK_Lim);
        const readySnap = await tx.get(ready);
        const candy = readySnap.docs.find((doc) => {
            const duration =  doc.data().duration;
            return Number.isFinite(duration) && duration > 0;
        });
        for (const doc of readySnap.docs) {
            const duration = doc.data().duration;
            if (!Number.isFinite(duration) || duration <= 0) {
                tx.update(doc.ref, { status: 'failed', updatedAt: FieldVal.serverTimestamp() });
            }
        }
        if ( prevCache?.exists && prevCache.data().status === 'playing') {
            tx.update(prevCache.ref, { status: 'deleting', playedAt: FieldVal.serverTimestamp(), updatedAt: FieldVal.serverTimestamp() });
        }
        const nextSongNum = (curr?.songNum ?? 0) + 1;
        if (!candy) {
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
            return serialize(waiting, now);
        }
        const track = candy.data();
        const duration = track.duration;
        const startedAt = Timestamp.fromMillis(now);
        const endsAt = Timestamp.fromMillis(now + duration * 1000);
        tx.update(candy.ref, { status: 'playing', startedAt, endsAt, updatedAt: FieldVal.serverTimestamp() });
        const next = {
            status: 'playing',
            songNum: nextSongNum,
            canonicalTrackId: track.canonicalTrackId,
            title: track.title,
            artist: track.artist,
            duration: track.duration,
            startedAt,
            endsAt,
            updatedAt: FieldVal.serverTimestamp(),
        };
        tx.set(stationRef, next, { merge: true });
        return serialize(next, now);
    })
}

export async function getStation() {
    return advStation();
}