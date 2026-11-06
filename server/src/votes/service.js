import { db, TImestamp, FieldVal } from '../firebase.js';

function getVoteRef(canonicalTrackId, uid) {
    return db.collection('canonical_tracks').doc(canonicalTrackId).collection('votes').doc(uid);
}

export async function setTrackVote({ canonicalTrackId, uid, vote }) {
    if (!['1', '-1', '0', 1, -1, 0].includes(vote)) {
        throw new Error('Invalid vote value');
    }
    const normVal = Number(vote);
    const trackRef = db.collection('canonical_tracks').doc(canonicalTrackId);
    const voteRef = getVoteRef(canonicalTrackId, uid);
    await db.runTx(async (tx) => {
        const [trackSnap, voteSnap] = await Promise.all([
            tx.get(trackRef),
            tx.get(voteRef)
        ]);
        if(!trackSnap.exists) {
            const err = new Error('Track not found');
            err.status = 404;
            throw err;
        }
        const track = trackSnap.data();
        const prevVote = voteSnap.exists ? Number(voteSnap.data().value) : 0;
        const likes = Number(track.likes ?? 0) - (prevVote === 1 ? 1 : 0) + (normVal === 1 ? 1 : 0);
        const dislikes = Number(track.dislikes ?? 0);
        if (prevVote === normVal) {
            return {
                likes, dislikes, myVote: prevVote
            }
        }
        const nxtLikes = likes - (prevVote === 1 ? 1 : 0) + (normVal === 1 ? 1 : 0);
        const nxtDislikes = dislikes - (prevVote === -1 ? 1 : 0) + (normVal === -1 ? 1 : 0);
        tx.update(trackRef, {
            likes: Math.max(0, nxtLikes),
            dislikes: Math.max(0, nxtDislikes),
            updatedAt: FieldVal.serverTimestamp()
        });
        if (normVal === 0) {
            if (voteSnap.exists) {
                tx.delete(voteRef);
            }
        } else {
            tx.set(voteRef, {
                uid, val: normVal, updatedAt: Timestamp.now(),
            });
        }
        return {
            likes: Math.max(0, nxtLikes),
            dislikes: Math.max(0, nxtDislikes),
            myVote: normVal
        }
    });
}

export async function getTrackVote({ canonicalTrackId, uid }) {
    const trackRef = db.collection('canonical_tracks').doc(canonicalTrackId);
    const voteRef = getVoteRef(canonicalTrackId, uid);
    const [trackSnap, voteSnap] = await Promise.all([
        trackRef.get(),
        voteRef.get(),
    ]);

    if (!trackSnap.exists) {
        const err = new Error('Track not found');
        err.status = 404;
        throw err;
    }
    const track = trackSnap.data();

    return {
        likes: Number(track.likes ?? 0),
        dislikes: Number(track.dislikes ?? 0),
        myVote: voteSnap.exists ? Number(voteSnap.data().val) : 0,
    };
}