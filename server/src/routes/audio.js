import { Router } from 'express';
import path from 'path';
import { db } from '../firebase.js';
import { CACHE_DIR, AUDIO_MIME_TYPES } from '../audio/config.js';

const router = Router();

router.get('/:canonicalTrackId', async (req, res) => {
    try {
        const { canonicalTrackId } = req.params;
        if (!/^ct_[a-f0-9]{32}$/.test(canonicalTrackId)) {
            return res.status(400).json({ error: 'Invalid canonicalTrackId format' });
        }
        const snap = await db.collection('audio_cache').doc(canonicalTrackId).get();
        if (!snap.exists) {
            return res.status(404).json({ error: 'Audio not found' });
        }
        const data = snap.data();
        if (data.status !== 'ready') {
            return res.status(404).json({ error: 'Audio not ready' });
        }
        if (!data.fName || !data.mimeType) {
            return res.status(500).json({ error: 'Audio metadata incomplete' });
        }
        res.sendFile(path.join(CACHE_DIR, data.fName), { contentType: data.mimeType });
    } catch (error) {
        console.error('Error in audio route:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

export default router;