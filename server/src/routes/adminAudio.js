import { Router } from 'express';
import express from 'express';
import { requireAdmin } from '../middleware/adminAuth.js';
import { acquireTrackAudio, stageUploadedAudio, listAcquisitionTracks, getAcquisitionStats, retryFailedAcquisitions, deleteAcquiredAudio, } from '../audio/acquisition.js';
import { auditCacheStorage, cleanPlayed } from '../audio/cleanup.js';
import { downloadYouTubeAudio } from '../audio/downloader.js';
const router = Router();
router.use(requireAdmin);

router.get('/status', async (_req, res) => {
    try {
        const stats = await getAcquisitionStats();
        res.json({ ok: true, stats });
    } catch (err) {
        console.error('error:', err);
        res.status(500).json({ ok: false, error: err.message });
    }
});

router.get('/tracks', async (req, res) => {
    try {
        const statusFilter = req.query.status || null;
        const limit = parseInt(req.query.limit, 10) || 100;
        const tracks = await listAcquisitionTracks({ statusFilter, limit });
        res.json({ ok: true, tracks });
    } catch (err) {
        console.error('error:', err);
        res.status(500).json({ ok: false, error: err.message });
    }
});

router.post('/acquire/:canonicalTrackId', async (req, res) => {
    try {
        const { canonicalTrackId } = req.params;
        const result = await acquireTrackAudio(canonicalTrackId);
        res.json({ ok: true, track: result });
    } catch (err) {
        const status = err.status || 500;
        res.status(status).json({ ok: false, error: err.message });
    }
});

router.post('/retry/:canonicalTrackId', async (req, res) => {
    try {
        const { canonicalTrackId } = req.params;
        const result = await acquireTrackAudio(canonicalTrackId);
        res.json({ ok: true, track: result });
    } catch (err) {
        const status = err.status || 500;
        res.status(status).json({ ok: false, error: err.message });
    }
});

router.post('/retry-failed', async (_req, res) => {
    try {
        const result = await retryFailedAcquisitions();
        res.json({ ok: true, ...result });
    } catch (err) {
        console.error('error:', err);
        res.status(500).json({ ok: false, error: err.message });
    }
});

const rawAudioParser = express.raw({
    type: ['audio/*', 'application/octet-stream', 'application/x-binary'],
    limit: '50mb',
});

router.post('/upload/:canonicalTrackId', rawAudioParser, async (req, res) => {
    try {
        const { canonicalTrackId } = req.params;
        let buffer = null;
        let fName = req.query.fName || 'audio.mp3';
        let mimeType = req.headers['content-type'] || 'audio/mpeg';
        if (Buffer.isBuffer(req.body) && req.body.length > 0) {
            buffer = req.body;
        } else if (req.body?.base64Data) {
            buffer = Buffer.from(req.body.base64Data, 'base64');
            fName = req.body.fName || fName;
            mimeType = req.body.mimeType || mimeType;
        }
        if (!buffer || buffer.length === 0) {
            return res.status(400).json({ ok: false, error: 'Empty audio buffer' });
        }
        const result = await stageUploadedAudio({ canonicalTrackId, buffer, fName, mimeType, });
        res.json({ ok: true, track: result });
    } catch (err) {
        console.error('error:', err);
        res.status(500).json({ ok: false, error: err.message });
    }
});

router.delete('/:canonicalTrackId', async (req, res) => {
    try {
        const { canonicalTrackId } = req.params;
        const result = await deleteAcquiredAudio(canonicalTrackId);
        res.json({ ok: true, ...result });
    } catch (err) {
        console.error('error:', err);
        res.status(500).json({ ok: false, error: err.message });
    }
});

router.post('/cleanup', async (_req, res) => {
    try {
        const cleanedPlayed = await cleanPlayed();
        const cleanedStale = await auditCacheStorage();
        const stats = await getAcquisitionStats();
        res.json({ ok: true, cleanedPlayed, cleanedStale, stats, });
    } catch (err) {
        console.error('error:', err);
        res.status(500).json({ ok: false, error: err.message });
    }
});

export default router;