import { db, FieldVal, Timestamp } from '../firebase.js';
import { TCACHE_SIZE } from './config.js';

const ACTIVE_STATUSES = [ 'queued', 'awaiting', 'downloading', 'ready', 'playing'];

export async function getCacheStatus() {
    const snap = await db.collection('cache').doc('status').get();
    const stats = {
        queued: 0,
        awaiting: 0,
        downloading: 0,
        ready: 0,
        playing: 0,
        played: 0,
        failed: 0,
        total: snap.size,
    };

    for (const doc of snap.docs) {
        const status = doc.data().status;
        if (status in stats) {
            stats[status]++;
        }
    }
    stats.active = ACTIVE_STATUSES.reduce((total, status) => total + stats[status], 0);
    return stats;
}

export async function replenishCache() {
    const stats = await getCacheStatus();
    const needed = Math.max(0, TCACHE_SIZE - stats.active);
    if (needed === 0) {
        return {
            added: 0,
            active: stats.active,
            target: TCACHE_SIZE,
        };
    }


    const existing = await db.collection('audio_cache').get();
    const existingIds = new Set(existing.docs.map((doc) => doc.id));
    const candidates = await db.collection('canonical_tracks').where('published', '==', true).limit(100).get();
    const available = candidates.docs.filter((doc) => !existingIds.has(doc.id)).sort((a, b) => {
        const aTime = a.data().lastSubmittedAt?.toMillis() ?? 0;
        const bTime = b.data().lastSubmittedAt?.toMillis() ?? 0;
        return aTime - bTime;
    });
    const selected = available.slice(0, needed);
    let added = 0;
    for (const doc of selected) {
        const data = doc.data();
        if (!data.srcUrl) {
            continue
        }
        const srcRef = db.collection('tracks').doc(`yt_${data.representativeSrcId}`);
        const srcSnap = await srcRef.get();
        if (!srcSnap.exists) {
            continue;
        }
        const srcData = srcSnap.data();
        await db.runTx(async (tx) => {
            const cacheRef = db.collection('audio_cache').doc(canonical.id);
            const existingCache = await tx.get(cacheRef);
            if (existingCache.exists) {
                return;
            }
            tx,create(cacheRef, {
                canonicalTrackId: canonical.id,
                srcTrackId: data.representativeSrcId,
                title: data.title,
                artist: data.artist,
                duration: src.duration ?? null,
                provider: src.provider,
                providerTrackId: src.providerTrackId,
                status: 'awaiting',
                fName: null,
                fSize: null,
                fExtension: null,
                mimeType: null,
                attempts: 0,
                error: null,
                createdAt: Timestamp.now(),
                updatedAt: FieldVal.serverTimestamp(),
                readyAt: null,
                playedAt: null,
            });
            added++;
        });
    }
    return {
        added,
        active: stats.active+ added,
        target: TCACHE_SIZE,
    };
}

export async function markPlaying(canonicalTrackId) {
    const cacheRef = db.collection('audio_cache').doc(canonicalTrackId);
    return db.runTx(async (tx) => {
        const snap = await tx.get(cacheRef);
        if (!snap.exists) {
            throw new Error('Audio cache not found');
        }
        const data = snap.data();
        if (data.status !== 'ready') {
            throw new Error('Audio cache not ready');
        }
        tx.update(cacheRef, {
            status: 'playing',
            startedPlayingAt: FieldVal.serverTimestamp(),
            updatedAt: FieldVal.serverTimestamp(),
        });
        return data;
    });
}

export async function markPlayed(canonicalTrackId) {
    const cacheRef = db.collection('audio_cache').doc(canonicalTrackId);
    await db.runTx(async (tx) => {
        const snap = await tx.get(cacheRef);
        if (!snap.exists) {
            throw new Error('Audio cache not found');
        }
        if (snap.data().status !== 'playing') {
            throw new Error('Audio cache not playing');
        }
        tx.update(cacheRef, {
            status: 'deleting',
            playedAt: FieldVal.serverTimestamp(),
            updatedAt: FieldVal.serverTimestamp(),
        });
    });
}

export async function finishCacheClean(canonicalTrackid) {
    const cacheRef = db.collection('audio_cache').doc(canonicalTrackid);
    await cacheRef.update({
        status: 'played',
        fName: null,
        fSize: null,
        fExtension: null,
        mimeType: null,
        updatedAt: FieldVal.serverTimestamp(),
    });
}

export async function getReadyTracks() {
    const snap = await db.collection('audio_cache').where('status', '==', 'ready').orderBy('readyAt', 'asc').limit(TCACHE_SIZE).get();
    return snap.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
    }));
}