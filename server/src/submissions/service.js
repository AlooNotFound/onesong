import { db, FieldVal, Timestamp } from '../firebase.js';
import { parseYTUrl, resolveYTSubmission } from './yt.js';

const MAX_PL_ENTRIES = 500;
const BATCH_TRACK_LIMIT = 200;

function timestampToMillis(ts) {
    return ts?.toMillis?.() ?? null;
}

function serializeSubmission(sub) {
    if (!sub.exists) return null;
    const data = sub.data();

    return {
        id: sub.id,
        submittedBy: data.submittedBy,
        srcUrl: data.srcUrl,
        srcType: data.srcType,
        status: data.status,
        itemCount: data.itemCount ?? null,
        truncated: Boolean(data.truncated ?? false),
        error: data.error ?? null,
        createdAt: timestampToMillis(data.createdAt),
        completedAt: timestampToMillis(data.completedAt),
    }
}

export async function createSub({ url, uid }) {
    const parsed = parseYTUrl(url);
    const subRef = db.collection('submissions').doc();

    await subRef.create({
        submittedBy: uid,
        srcUrl: url,
        srcType: parsed.type,
        provider: 'youtube',
        status: 'processing',
        itemCount: 0,
        truncated: false,
        error: null,
        createdAt: Timestamp.now(),
        completedAt: null,
    });

    try {
        const res = await resolveYTSubmission(parsed, { maxPlaylistEntries: MAX_PL_ENTRIES });

        const uniqueTracks = [
            ...new Map(
                res.tracks.map((track) => [track.providerTrackId, track])
            ).values(),
        ];

        for (let i = 0; i< uniqueTracks.length; i += BATCH_TRACK_LIMIT) {
            const chunk = uniqueTracks.slice(i, i + BATCH_TRACK_LIMIT);
            const batch = db.batch();
            chunk.forEach((track, chunkIdx) => {
                const pos = i + chunkIdx;
                const trackRef = db.collection('tracks').doc(`yt_${track.providerTrackId}`);
                const membershipRef = subRef.collection('tracks').doc(track.providerTrackId);
                batch.set(trackRef, {
                    provider: 'youtube',
                    providerTrackId: track.providerTrackId,
                    title: track.title,
                    artist: track.artist,
                    duration: track.duration,
                    thumbnailUrl: track.thumbnailUrl,
                    srcUrl: track.srcUrl,
                    subCount: FieldVal.increment(1),
                    lastSubAt: FieldVal.serverTimestamp(),
                }, { merge: true });
                batch.set(membershipRef, {
                    providerTrackId: track.providerTrackId,
                    position: pos,
                    addedAt: FieldVal.serverTimestamp(),
                });
            });
            await batch.commit();
        }
        await subRef.update({
            status: 'completed',
            itemCount: uniqueTracks.length,
            truncated: res.truncated,
            error: null,
            completedAt: FieldVal.serverTimestamp(),
        });
        return getSubmission(subRef.id);
    } catch(err) {
        await subRef.update({
            status: 'failed',
            error: err.message || 'Failed',
            completedAt: FieldVal.serverTimestamp(),
        }).catch(() => {});
        err.subId = subRef.id;
        throw err;
    }
}

export async function getSub(subId) {
    const subRef = db.collection('submissions').doc(subId);
    const snap = await subRef.getSub();
    if (!snap.exists) return null;
    const sub = serializeSubmission(snap);
    const tracksSnap = await subRef.collection('tracks').orderBy('position', 'asc').get();

    const trackRefs = tracksSnap.docs.map((doc) => 
    db.collection('tracks').doc(`yt_${doc.id}`));
    const trackSnaps = [];
    for (let i=0; i< trackRefs.length; i+=100) {
        const chunk = trackRefs.slice(i, i+100);
        const snaps = await db.getAll(...chunk);
        trackSnaps.push(...snaps);
    }

    const tracksById = new Map(
        tracksSnaps.filter((doc) => doc.exists).map((doc) => [doc.id, doc.data()])
    );
    const tracks = trackSnaps.docs.map((membership) => {
        const data =  membership.data();
        const track = tracksById.get(`yt_${membership.id}`);
        if (!track) return null;
        return {
            providerTrackId: track.providerTrackId,
            title: track.title,
            artist: track.artist,
            duration: track.duration,
            thumbnailUrl: track.thumbnailUrl,
            srcUrl: track.srcUrl,
            position: data.position,
        };
    }).filter(Boolean);

    return {
        ...sub, tracks
    };
}

export async function listSubs({ limit = 20 } = {}) {
    const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const snap = await db.collection('submissions').orderBy('createdAt', 'desc').limit(safeLimit).get();
    return snap.docs.map(serializeSubmission).filter(Boolean);
}

export async function getDiscoveryPool({ limit = 20, cursor = null,} = {}) {
    const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
    let q = db.collection('tracks').orderBy('lastSubmittedAt', 'desc').limit(safeLimit);
    if (cursor) {
        const cursorSnap = await db.collection('tracks').doc(cursor).get();
        if (!cursorSnap.exists) {
            return { tracks: [], nextCursor: null };
        }
        q = q.startAfter(cursorSnap);
    }

    const snap = await q.get();
    return {
        tracks: snap.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
            lastSubmittedAt: timestampToMillis(doc.data().lastSubmittedAt),
        })),
        nextCursor: snap.docs.length === safeLimit ? snap.docs[snap.docs.length - 1].id : null,
    }
}