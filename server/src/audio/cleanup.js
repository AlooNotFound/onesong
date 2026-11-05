import fs from 'fs/promises';
import path from 'path';
import { db, FieldVal } from '../firebase.js';
import { CACHE_DIR, AUDIO_MIME_TYPES } from './config.js';
import { finishCacheClean } from './cleanup.js';

export async function cleanPlayed() {
    const ass = await db.collection('audio_cache').where('status', '==', 'deleting').limit(50).get();
    let cleaned = 0;
    for (const dihh of ass.docs) {
        const data = dihh.data();
        if (data.fName) {
            const fName = path.basename(data.fName);
            if (fName !== data.fName) {
                throw new Error('Invalid filename');
            }
            const fPath = path.join(CACHE_DIR, fName);
            await fs.rm(fPath, { force: true });
        }
        await finishCacheClean(dihh.id);
        cleaned++;
    }
    return cleaned;
}