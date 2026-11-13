import fs from 'fs/promises';
import path from 'path';
import { db, FieldVal, Timestamp } from '../firebase.js';
import { CACHE_DIR, TCACHE_SIZE, AUDIO_MIME_TYPES } from './config.js';
import { downloadYtAud } from './downloader.js';

export async function acquireTrackAudio(canonicalTrackId) {
    if (!canonicalTrackId) {
        throw new Error('canonicalTrackId is required');
    }

    await fs.mkdir(CACHE_DIR, { recursive: true });
    const canonicalRef = db.collection('canonical_tracks').doc(canonicalTrackId);
    const canonicalSnap = await canonicalRef.get();
    if (!canonicalSnap.exists) {
        throw Object.assign(new Error(`not found canonical track '${canonicalTrackId}'`), { status: 404 });
    }
    const cData = canonicalSnap.data();
    let repId = cData.repSourceId || cData.repSrcId || cData.providerTrackId;
    let title = cData.title;
    let artist = cData.artist;
    let duration = cData.duration ?? null;
    let srcUrl = cData.srcUrl ?? null;

    if (!repId) {
        const qSnap = await db.collection('tracks').where('canonicalTrackId', '==', canonicalTrackId).limit(1).get();
        if (!qSnap.empty) {
            const trackDoc = qSnap.docs[0].data();
            repId = trackDoc.providerTrackId;
            title = title || trackDoc.title;
            artist = artist || trackDoc.artist;
            duration = duration ?? trackDoc.duration;
            srcUrl = srcUrl || trackDoc.srcUrl;
        } else {
            const directSnap = await db.collection('tracks').doc(canonicalTrackId).get();
            if (directSnap.exists) {
                const trackDoc = directSnap.data();
                repId = trackDoc.repSourceId || trackDoc.providerTrackId;
                title = title || trackDoc.title;
                artist = artist || trackDoc.artist;
                duration = duration ?? trackDoc.duration;
                srcUrl = srcUrl || trackDoc.srcUrl;
            }
        }
        if (repId) {
            await canonicalRef.set({
                repSourceId: repId,
                title: title || 'Unknown Title',
                artist: artist || 'Unknown Artist',
                duration,
                srcUrl,
            }, { merge: true });
        }
    }

    if (!repId) {
        throw Object.assign(new Error(`no src video ID found for '${canonicalTrackId}'`), { status: 400 });
    }
    let srcData = null;
    try {
        const srcSnap = await db.collection('tracks').doc(`yt_${repId}`).get();
        if (srcSnap.exists) {
            srcData = srcSnap.data();
        }
    } catch {}
    title = title || srcData?.title || 'Unknown Title';
    artist = artist || srcData?.artist || 'Unknown Artist';
    duration = duration ?? srcData?.duration ?? null;
    srcUrl = srcUrl || srcData?.srcUrl || `https://www.youtube.com/watch?v=${repId}`;
    const cacheRef = db.collection('audio_cache').doc(canonicalTrackId);
    await cacheRef.set({ canonicalTrackId, srcTrackId: repId, provider: 'youtube', providerTrackId: repId, title, artist, duration, status: 'downloading', fName: null, fSize: null, fExtension: null, mimeType: null, error: null, acquiredVia: 'admin_acquisition', updatedAt: FieldVal.serverTimestamp(), }, { merge: true });
    try {
        const result = await downloadYtAud({ vidId: repId, canonicalTrackId, srcUrl, });

        await cacheRef.update({ status: 'ready', fName: result.fName || result.fName, fSize: result.size, fExtension: result.ext, mimeType: result.mimeType, readyAt: Timestamp.now(), updatedAt: FieldVal.serverTimestamp(), error: null,});

        return { success: true, canonicalTrackId, title, artist, status: 'ready', fName: result.fName || result.fName, size: result.size, mimeType: result.mimeType, audioUrl: `/api/audio/${canonicalTrackId}`, };
    } catch (err) {
        await cacheRef.update({
            status: 'failed',
            error: err.message,
            updatedAt: FieldVal.serverTimestamp(),
        }).catch(() => {});
        throw err;
    }
}

export async function stageUploadedAudio({ canonicalTrackId, buffer, fName = 'audio.mp3', mimeType = 'audio/mpeg' }) {
    if (!canonicalTrackId) {
        throw new Error('canonicalTrackId is required');
    }
    if (!buffer || buffer.length === 0) {
        throw new Error('Audio file buffer is empty');
    }
    await fs.mkdir(CACHE_DIR, { recursive: true });
    const ext = path.extname(fName).toLowerCase() || '.mp3';
    const destfName = `${canonicalTrackId}${ext}`;
    const destPath = path.join(CACHE_DIR, destfName);
    await fs.writeFile(destPath, buffer);
    let title = 'Uploaded Track';
    let artist = 'Admin';
    let duration = null;

    try {
        const cSnap = await db.collection('canonical_tracks').doc(canonicalTrackId).get();
        if (cSnap.exists) {
            const data = cSnap.data();
            title = data.title || title;
            artist = data.artist || artist;
            duration = data.duration || null;
        }
    } catch {}
    try {
        const cacheRef = db.collection('audio_cache').doc(canonicalTrackId);
        await cacheRef.set({
            canonicalTrackId,
            title,
            artist,
            duration,
            status: 'ready',
            fName: destfName,
            fSize: buffer.length,
            fExtension: ext,
            mimeType: AUDIO_MIME_TYPES[ext] || mimeType,
            acquiredVia: 'admin_upload',
            readyAt: Timestamp.now(),
            updatedAt: FieldVal.serverTimestamp(),
            error: null,
        }, { merge: true });
    } catch (err) {
        console.error(`aud cache update failed`, err);
    }

    return { success: true, canonicalTrackId, fName: destfName, size: buffer.length, status: 'ready', audioUrl: `/api/audio/${canonicalTrackId}`, };
}

export async function listAcquisitionTracks({ statusFilter = null, limit = 100 } = {}) {
    const [canonicalSnap, cacheSnap, tracksSnap] = await Promise.all([
        db.collection('canonical_tracks').limit(limit).get(),
        db.collection('audio_cache').get(),
        db.collection('tracks').limit(200).get(),
    ]);
    const cacheMap = new Map();
    for (const doc of cacheSnap.docs) {
        cacheMap.set(doc.id, doc.data());
    }

    const tracksMap = new Map();
    for (const doc of tracksSnap.docs) {
        const d = doc.data();
        if (d.canonicalTrackId) tracksMap.set(d.canonicalTrackId, d);
        tracksMap.set(doc.id, d);
    }

    const tracks = [];
    for (const doc of canonicalSnap.docs) {
        const cData = doc.data();
        const cacheData = cacheMap.get(doc.id);
        const fallback = tracksMap.get(doc.id);
        const status = cacheData?.status || 'pending';
        if (statusFilter && status !== statusFilter) {
            continue;
        }
        tracks.push({ 
            canonicalTrackId: doc.id, 
            title: cData.title || cacheData?.title || fallback?.title || 'Unknown', 
            artist: cData.artist || cacheData?.artist || fallback?.artist || 'Unknown', 
            duration: cData.duration ?? cacheData?.duration ?? fallback?.duration ?? null, 
            repSourceId: cData.repSourceId || cData.repSrcId || fallback?.repSourceId || fallback?.providerTrackId || null, 
            status, 
            fName: cacheData?.fName || null, 
            fSize: cacheData?.fSize || null, 
            error: cacheData?.error || null, 
            acquiredVia: cacheData?.acquiredVia || null, 
            readyAt: cacheData?.readyAt?.toMillis?.() ?? null, 
            audioUrl: ['ready', 'playing'].includes(status) ? `/api/audio/${doc.id}` : null, 
        });
    }
    const priority = { pending: 1, failed: 2, downloading: 3, ready: 4, playing: 5, played: 6 };
    tracks.sort((a, b) => (priority[a.status] || 99) - (priority[b.status] || 99));
    return tracks;
}

export async function getAcquisitionStats() {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    const [canonicalSnap, cacheSnap] = await Promise.all([
        db.collection('canonical_tracks').get(),
        db.collection('audio_cache').get(),
    ]);
    const stats = { totalCanonicalTracks: canonicalSnap.size, ready: 0, downloading: 0, pending: 0, failed: 0, playing: 0, played: 0, TCacheLim: TCACHE_SIZE, diskFilesCount: 0, totalDiscBytes: 0, };
    const cacheSet = new Set();
    for (const doc of cacheSnap.docs) {
        cacheSet.add(doc.id);
        const st = doc.data().status;
        if (st in stats) {
            stats[st]++;
        }
    }

    stats.pending = Math.max(0, canonicalSnap.size - cacheSet.size);
    try {
        const files = await fs.readdir(CACHE_DIR, { withFileTypes: true });
        for (const file of files) {
            if (file.isFile()) {
                stats.diskFilesCount++;
                try {
                    const st = await fs.stat(path.join(CACHE_DIR, file.name));
                    stats.totalDiscBytes += st.size;
                } catch {}
            }
        }
    } catch {}
    stats.activeCount = stats.ready + stats.playing + stats.downloading;
    return stats;
}

export async function retryFailedAcquisitions() {
    const failedSnap = await db.collection('audio_cache').where('status', '==', 'failed').limit(20).get();
    const retried = [];
    const failedAgain = [];
    for (const doc of failedSnap.docs) {
        try {
            const res = await acquireTrackAudio(doc.id);
            retried.push(res);
        } catch (err) {
            failedAgain.push({ canonicalTrackId: doc.id, error: err.message });
        }
    }

    return {
        retriedCount: retried.length,
        failedCount: failedAgain.length,
        retried,
        failedAgain,
    };
}

export async function deleteAcquiredAudio(canonicalTrackId) {
    try {
        const files = await fs.readdir(CACHE_DIR);
        for (const f of files) {
            if (f.startsWith(`${canonicalTrackId}.`) || f.startsWith(`tmp_${canonicalTrackId}`)) {
                await fs.rm(path.join(CACHE_DIR, f), { force: true }).catch(() => {});
            }
        }
    } catch {}

    try {
        const cacheRef = db.collection('audio_cache').doc(canonicalTrackId);
        const snap = await cacheRef.get();
        if (snap.exists) {
            const data = snap.data();
            if (data.fName) {
                const fPath = path.join(CACHE_DIR, path.basename(data.fName));
                await fs.rm(fPath, { force: true }).catch(() => {});
            }
            await cacheRef.delete();
        }
    } catch (err) {
        console.error(`deletion failed for ${canonicalTrackId}:`, err);
    }

    return {
        success: true,
        canonicalTrackId,
        deleted: true,
    };
}
