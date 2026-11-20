import { db, Timestamp, FieldVal } from '../firebase.js';
import { advStation } from '../station/service.js';
import { publishEvent } from '../realtime/events.js';
import { listenerRegistry } from '../listeners.js';

export function getSkipThreshold() {
    const count = listenerRegistry.count();
    if (count <= 1) {
        return 1;
    }
    return Math.max(2, Math.ceil(count / 2));
}

export async function getSkipStatus(uid) {
    const threshold = getSkipThreshold();
    const stationSnap = await db.collection('stations').doc('global').get();
    if (!stationSnap.exists) {
        return { votes: 0, required: threshold, req: threshold, voted: false, advanced: false };
    }
    const data = stationSnap.data();
    if (data.status !== 'playing') {
        return { votes: 0, required: threshold, req: threshold, voted: false, advanced: false };
    }
    const songNum = data.songNum;
    const voteSnap = await db.collection('skip_votes').doc(String(songNum)).get();
    const voters = voteSnap.exists ? voteSnap.data().voters || [] : [];
    if (voters.length >= threshold && voters.length > 0) {
        try {
            const station = await advStation({ force: true, expectedSongNum: songNum, endReason: 'skip' });
            const out = {
                songNum,
                votes: voters.length,
                required: threshold,
                req: threshold,
                voted: uid ? voters.includes(uid) : false,
                advanced: station.songNum !== songNum,
                station,
            };
            publishEvent('skip-vote', out);
            return out;
        } catch {}
    }
    return {
        songNum,
        votes: voters.length,
        required: threshold,
        req: threshold,
        voted: uid ? voters.includes(uid) : false,
        advanced: false,
    };
}

export async function castSkipVote(uid) {
    const threshold = getSkipThreshold();
    const stationRef = db.collection('stations').doc('global');
    return db.runTransaction(async (tx) => {
        const stationSnap = await tx.get(stationRef);
        if (!stationSnap.exists) {
            const err = new Error('Station not found');
            err.status = 404;
            throw err;
        }
        const data = stationSnap.data();
        if (data.status !== 'playing') {
            const err = new Error('No song is currently playing');
            err.status = 400;
            throw err;
        }
        const songNum = data.songNum;
        const voteRef = db.collection('skip_votes').doc(String(songNum));
        const voteSnap = await tx.get(voteRef);
        const existingVoters = voteSnap.exists ? voteSnap.data().voters || [] : [];
        if (existingVoters.includes(uid)) {
            const skipped = existingVoters.length >= threshold;
            return {
                songNum,
                votes: existingVoters.length,
                req: threshold,
                required: threshold,
                voted: true,
                skipped,
            };
        }
        const voters = [...existingVoters, uid];
        tx.set(voteRef, {
            songNum,
            voters,
            voteCount: voters.length,
            req: threshold,
            required: threshold,
            updatedAt: Timestamp.now(),
        }, { merge: true });
        return {
            songNum,
            votes: voters.length,
            req: threshold,
            required: threshold,
            voted: true,
            skipped: voters.length >= threshold,
        };
    }).then(async (res) => {
        if (!res.skipped) {
            publishEvent('skip-vote', res);
            return res;
        }
        const station = await advStation({force:true, expectedSongNum: res.songNum, endReason: 'skip'});
        const out = {
            ...res,
            advanced: station.songNum !== res.songNum,
            station,
        };
        publishEvent('skip-vote', out);
        return out;
    })
}