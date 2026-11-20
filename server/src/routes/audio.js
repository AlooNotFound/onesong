import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import { db } from '../firebase.js';
import { CACHE_DIR } from '../audio/config.js';

const router = Router();

router.get('/:canonicalTrackId', async (req, res) => {
    try {
        const { canonicalTrackId } = req.params;
        if (!canonicalTrackId || !/^ct_[a-f0-9]{32}$/.test(canonicalTrackId)) {
            return res.status(400).json({ error: 'Invalid canonicalTrackId format' });
        }
        const snap = await db.collection('audio_cache').doc(canonicalTrackId).get();
        if (!snap.exists) {
            return res.status(404).json({ error: 'Audio not found' });
        }
        let data = snap.data();
        let filePath = data.fName ? path.join(CACHE_DIR, path.basename(data.fName)) : null;
        if (!filePath || !fs.existsSync(filePath) || data.status === 'failed' || data.status === 'queued') {
            try {
                const { acquireTrackAudio } = await import('../audio/acquisition.js');
                const result = await acquireTrackAudio(canonicalTrackId);
                if (result?.fName) {
                    filePath = path.join(CACHE_DIR, path.basename(result.fName));
                    data = { ...data, fName: result.fName, mimeType: result.mimeType, status: 'ready' };
                }
            } catch {}
        }
        if (!filePath || !fs.existsSync(filePath)) {
            return res.status(404).json({ error: `Audio not ready for streaming (status: ${data.status})` });
        }

        const stat = fs.statSync(filePath);
        const totalSize = stat.size;
        const mimeType = data.mimeType || 'audio/mpeg';
        const range = req.headers.range;
        if (range) {
            const parts = range.replace(/bytes=/, '').split('-');
            const start = parseInt(parts[0], 10);
            const requestedEnd = parts[1] ? parseInt(parts[1], 10) : NaN;
            let end;
            if (Number.isFinite(requestedEnd)) {
                end = Math.min(requestedEnd, totalSize - 1);
            } else if (req.query.chunkSize) {
                const customChunk = parseInt(req.query.chunkSize, 10);
                end = Math.min(start + customChunk - 1, totalSize - 1);
            } else {
                end = totalSize - 1;
            }
            const contentLength = (end - start) + 1;
            res.writeHead(206, {
                'Content-Range': `bytes ${start}-${end}/${totalSize}`,
                'Accept-Ranges': 'bytes',
                'Content-Length': contentLength,
                'Content-Type': mimeType,
                'Cache-Control': 'public, max-age=86400',
            });

            const stream = fs.createReadStream(filePath, { start, end });
            stream.pipe(res);
            req.on('close', () => stream.destroy());
            stream.on('error', () => {
                if (!res.headersSent) res.status(500).end();
                stream.destroy();
            });
        } else {
            res.writeHead(200, {
                'Content-Length': totalSize,
                'Content-Type': mimeType,
                'Accept-Ranges': 'bytes',
                'Cache-Control': 'public, max-age=86400',
            });
            const stream = fs.createReadStream(filePath);
            stream.pipe(res);
            req.on('close', () => stream.destroy());
            stream.on('error', () => {
                if (!res.headersSent) res.status(500).end();
                stream.destroy();
            });
        }
    } catch (error) {
        console.error('Error in audio route:', error);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Internal server error' });
        }
    }
});

export default router;
