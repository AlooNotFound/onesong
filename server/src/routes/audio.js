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
        const data = snap.data();
        if (data.status !== 'ready' && data.status !== 'playing') {
            return res.status(404).json({ error: `Audio not ready for streaming (status: ${data.status})` });
        }
        if (!data.fName) {
            return res.status(500).json({ error: 'Audio metadata incomplete' });
        }
        const filePath = path.join(CACHE_DIR, path.basename(data.fName));
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'Audio file missing from storage' });
        }
        res.type(data.mimeType || 'audio/mpeg');
        res.sendFile(filePath);
    } catch (error) {
        console.error('Error in audio route:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

export default router;
