import { db, Timestamp, FieldVal } from '../firebase.js';
import { advStation } from '../station/service';
import { publishEvent } from '../events/service.js';

const SKIP_THRESHOLD = 2;

export async function castSkipVote(uid) {
    const stationRef = db.collection('stations').doc('global');
    return db.runTx(async (tx) => {
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
            return {
                songNum,
                votes: existingVoters.length,
                req: SKIP_THRESHOLD,
                voted: true,
                skipped: false,
            };
        }
        const voters = [...existingVoters, uid];
        tx.set(voteRef, {
            songNum,
            voters,
            voteCount: voters.length,
            req: SKIP_THRESHOLD,
            updatedAt: Timestamp.now(),
        }, { merge: true });
        return {
            songNum,
            votes: voters.length,
            req: SKIP_THRESHOLD,
            voted: true,
            skipped: voters.length >= SKIP_THRESHOLD,
        };
    }).then(async (res) => {
        if (res.skipped) {
            return res;
        }
        const station = await advStation({force:true, expectedSongNum: res.songNum, endReason: 'skip'});
        return {
            ...res,
            advanced: station.songNum !== res.songNum,
            station,
        }
    })
}