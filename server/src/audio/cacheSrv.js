import { db, FieldVal, Timestamp } from '../firebase.js';
import { TCACHE_SIZE, CACHE_DIR } from './config.js';
import { downloadYtAud } from './downloader.js';

export const ACTIVE_STATUSES = ['downloading', 'ready', 'playing'];

export async function getCacheStatus() {
    const snap = await db.collection('audio_cache').get();
    const stats = {
        queued: 0,
        awaiting: 0,
        downloading: 0,
        ready: 0,
        playing: 0,
        deleting: 0,
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
    stats.active = ACTIVE_STATUSES.reduce((total, status) => total + (stats[status] || 0), 0);
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

    const existingSnap = await db.collection('audio_cache').get();
    const activeIds = new Set(
        existingSnap.docs
            .filter((d) => ACTIVE_STATUSES.includes(d.data().status))
            .map((doc) => doc.id)
    );
    const playedIds = new Set(
        existingSnap.docs
            .filter((d) => d.data().status === 'played')
            .map((doc) => doc.id)
    );

    const candidatesSnap = await db.collection('canonical_tracks').where('published', '==', true).limit(100).get();
    let available = candidatesSnap.docs.filter((doc) => !activeIds.has(doc.id) && !playedIds.has(doc.id));
    if (available.length < needed) {
        const recyclable = candidatesSnap.docs.filter((doc) => !activeIds.has(doc.id) && playedIds.has(doc.id));
        available = [...available, ...recyclable];
    }
    available.sort((a, b) => {
        const aTime = a.data().lastSubmittedAt?.toMillis?.() ?? 0;
        const bTime = b.data().lastSubmittedAt?.toMillis?.() ?? 0;
        return aTime - bTime;
    });
    const selected = available.slice(0, needed);
    let added = 0;
    for (const doc of selected) {
        const canonicalId = doc.id;
        const data = doc.data();
        const repId = data.representativeSourceId || data.representativeSrcId || data.providerTrackId;
        if (!repId) {
            continue;
        }
        let srcData = null;
        try {
            const srcSnap = await db.collection('tracks').doc(`yt_${repId}`).get();
            if (srcSnap.exists) {
                srcData = srcSnap.data();
            }
        } catch {}

        const srcUrl = srcData?.srcUrl || `https://www.youtube.com/watch?v=${repId}`;
        const title = data.title || srcData?.title || 'Unknown Title';
        const artist = data.artist || srcData?.artist || 'Unknown Artist';
        const duration = srcData?.duration ?? data.duration ?? null;
        const cacheRef = db.collection('audio_cache').doc(canonicalId);
        await cacheRef.set({
            canonicalTrackId: canonicalId,
            srcTrackId: repId,
            provider: 'youtube',
            providerTrackId: repId,
            title,
            artist,
            duration,
            status: 'downloading',
            fName: null,
            fSize: null,
            fExtension: null,
            mimeType: null,
            error: null,
            createdAt: Timestamp.now(),
            addedAt: Timestamp.now(),
            updatedAt: FieldVal.serverTimestamp(),
            readyAt: null,
            playedAt: null,
        }, { merge: true });
        try {
            console.log(`Downloading audio for ${title} (${repId})...`);
            const dlRes = await downloadYtAud({
                videoId: repId,
                canonicalTrackId: canonicalId,
                srcUrl,
            });

            await cacheRef.update({
                status: 'ready',
                fName: dlRes.fileName,
                fSize: dlRes.size,
                fExtension: dlRes.ext,
                mimeType: dlRes.mimeType,
                readyAt: Timestamp.now(),
                updatedAt: FieldVal.serverTimestamp(),
                error: null,
            });
            added++;
            console.log(`cached ${title} (${dlRes.fileName}, ${(dlRes.size / (1024 * 1024)).toFixed(2)} MB)`);
        } catch (err) {
            console.error(`Failed to download ${canonicalId} (${repId}):`, err.message);
            await cacheRef.update({
                status: 'failed',
                error: err.message,
                updatedAt: FieldVal.serverTimestamp(),
            });
        }
    }

    return {
        added,
        active: stats.active+ added,
        target: TCACHE_SIZE,
    };
}

export async function markPlaying(canonicalTrackId) {
    const cacheRef = db.collection('audio_cache').doc(canonicalTrackId);
    return db.runTransaction(async (tx) => {
        const snap = await tx.get(cacheRef);
        if (!snap.exists) {
            throw new Error('Audio cache not found');
        }
        const data = snap.data();
        if (data.status !== 'ready' && data.status !== 'playing') {
            throw new Error(`Audio cache not ready (status: ${data.status})`);
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
    await db.runTransaction(async (tx) => {
        const snap = await tx.get(cacheRef);
        if (!snap.exists) {
            return;
        }
        tx.update(cacheRef, {
            status: 'deleting',
            playedAt: FieldVal.serverTimestamp(),
            updatedAt: FieldVal.serverTimestamp(),
        });
    });
}

export async function finishCacheClean(canonicalTrackId) {
    const cacheRef = db.collection('audio_cache').doc(canonicalTrackId);
    await cacheRef.update({
        status: 'played',
        fName: null,
        fSize: null,
        fExtension: null,
        mimeType: null,
        cleanedAt: FieldVal.serverTimestamp(),
        updatedAt: FieldVal.serverTimestamp(),
    });
}

export async function getReadyTracks() {
    const snap = await db.collection('audio_cache').where('status', '==', 'ready').limit(TCACHE_SIZE).get();
    return snap.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
    }));
}
