import fs from 'fs/promises';
import path from 'path';
import { db } from '../firebase.js';
import { CACHE_DIR, TCACHE_SIZE } from './config.js';
import { finishCacheClean } from './cacheSrv.js';


export async function cleanPlayed({ tracksToDelete = null } = {}) {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    let cleaned = 0;

    try {
        let targets = tracksToDelete;
        if (!targets) {
            const snap = await db.collection('audio_cache').where('status', '==', 'deleting').limit(50).get();
            targets = snap.docs.map((doc) => ({
                id: doc.id,
                fName: doc.data().fName,
            }));
        }
        for (const track of targets) {
            if (track.fName) {
                const fName = path.basename(track.fName);
                const fPath = path.join(CACHE_DIR, fName);
                await fs.rm(fPath, { force: true }).catch((err) => {
                    console.warn(`Could not remove file ${fPath}:`, err.message);
                });
            }
            if (!tracksToDelete) {
                await finishCacheClean(track.id).catch(() => {});
            }
            cleaned++;
        }
    } catch (err) {
        console.warn('Error in cleanPlayed:', err.message);
    }
    return cleaned;
}

export async function auditCacheStorage({ activeFiles = null } = {}) {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    let removed = 0;
    try {
        const entries = await fs.readdir(CACHE_DIR, { withFileTypes: true });
        const fNames = entries.filter((e) => e.isFile()).map((e) => e.name);
        if (fNames.length === 0) return 0;
        let validfNames = activeFiles instanceof Set ? activeFiles : null;
        if (validfNames === null) {
            try {
                const activeSnap = await db.collection('audio_cache').get();
                validfNames = new Set();
                for (const doc of activeSnap.docs) {
                    const data = doc.data();
                    if (['ready', 'playing'].includes(data.status) && data.fName) {
                        validfNames.add(path.basename(data.fName));
                    }
                }
            } catch (err) {
                console.warn('could not get audio_cache db:', err.message);
            }
        }

        const remFiles = [];
        for (const name of fNames) {
            const isTemp = name.startsWith('tmp_');
            const isOrphan = validfNames !== null && !validfNames.has(name);
            if (isOrphan || isTemp) {
                const fPath = path.join(CACHE_DIR, name);
                try {
                    const stat = await fs.stat(fPath);
                    if (isTemp && Date.now() - stat.mtimeMs < 5 * 60 * 1000) {
                        continue;
                    }
                    await fs.rm(fPath, { force: true });
                    removed++;
                } catch {}
            } else {
                remFiles.push(name);
            }
        }
        if (remFiles.length > TCACHE_SIZE) {
            const fileStats = [];
            for (const name of remFiles) {
                const fPath = path.join(CACHE_DIR, name);
                try {
                    const stat = await fs.stat(fPath);
                    fileStats.push({ name, path: fPath, mtimeMs: stat.mtimeMs });
                } catch {}
            }
            fileStats.sort((a, b) => a.mtimeMs - b.mtimeMs);
            if (fileStats.length > TCACHE_SIZE) {
                const excess = fileStats.slice(0, fileStats.length - TCACHE_SIZE);
                for (const file of excess) {
                    await fs.rm(file.path, { force: true }).catch(() => {});
                    removed++;
                }
            }
        }
    } catch (err) {
        console.error('Error in auditCacheStorage:', err);
    }
    return removed;
}
