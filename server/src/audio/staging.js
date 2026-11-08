import fs from 'fs/promises';
import path from 'path';
import { db, FieldVal } from '../firebase.js';
import { INCOMING_DIR, CACHE_DIR, ALLOWED_AUDIO_EXTS, AUDIO_MIME_TYPES, MAX_FILE_SIZE } from './config.js';

async function ensureDirExists() {
    await fs.mkdir(INCOMING_DIR, { recursive: true });
    await fs.mkdir(CACHE_DIR, { recursive: true });
}

async function findIncomingFiles(providerTrackId) {
    if (!providerTrackId) return null;
    await ensureDirExists();
    const entries = await fs.readdir(INCOMING_DIR, { withFileTypes: true });
    for (const e of entries) {
        if (!e.isFile()) continue;
        const ext = path.extname(e.name).toLowerCase();
        const base = path.basename(e.name, ext);
        if (base !== providerTrackId || !ALLOWED_AUDIO_EXTS.includes(ext)) {
            continue;
        }
        const fPath = path.join(INCOMING_DIR, e.name);
        const stat = await fs.stat(fPath);
        if (!stat.isFile() || stat.size > MAX_FILE_SIZE) {
            continue;
        }
        return { path: fPath, ext, size: stat.size };
    }
    return null;
}

export async function processStagedAssets() {
    await ensureDirExists();
    const waiting = await db.collection('audio_cache').where('status', '==', 'awaiting').limit(20).get();
    let processed = 0;
    for (const doc of waiting.docs) {
        const data = doc.data();
        const asset = await findIncomingFiles(data.providerTrackId);
        if (!asset) continue;

        const fName = `${doc.id}${asset.ext}`;
        const destPath = path.join(CACHE_DIR, fName);

        const claimed = await db.runTransaction(async (tx) => {
            const curr = await tx.get(doc.ref);
            if (!curr.exists || curr.data().status !== 'awaiting') {
                return false;
            }
            tx.update(doc.ref, {
                status: 'downloading',
                updatedAt: FieldVal.serverTimestamp(),
            });
            return true;
        });
        if (!claimed) continue;
        try {
            await fs.rename(asset.path, destPath);
            await doc.ref.update({
                status: 'ready',
                fName,
                fSize: asset.size,
                fExtension: asset.ext,
                mimeType: AUDIO_MIME_TYPES[asset.ext] || 'audio/mpeg',
                readyAt: FieldVal.serverTimestamp(),
                updatedAt: FieldVal.serverTimestamp(),
            });
            processed++;
        } catch (err) {
            console.error('Error processing staged file:', err);
            await doc.ref.update({
                status: 'error',
                error: err.message,
                updatedAt: FieldVal.serverTimestamp(),
            });
        }
    }
    return { processed };
}

export const processStagedFile = processStagedAssets;