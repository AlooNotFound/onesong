import { Router } from "express";
import { getTrackLyrics } from "../lyrics/service.js";
import { db } from "../firebase.js";

const router = Router();

router.get('/', async (req, res) => {
    try {
        let { canonicalTrackId, title, artist, dur } = req.query ?? {};
        if ((!title || !artist) && canonicalTrackId) {
            try {
                const doc = await db.collection('canonical_tracks').doc(String(canonicalTrackId)).get();
                if (doc.exists) {
                    const d = doc.data();
                    title = title || d.title;
                    artist = artist || d.artist;
                    dur = dur || d.dur || d.duration;
                }
            } catch {}
        }

        if (!title && !artist) {
            return res.json({ hasLyrics: false, lines: [] });
        }

        const durNum = dur ? parseFloat(dur) : 0;
        const result = await getTrackLyrics({
            canonicalTrackId: canonicalTrackId ? String(canonicalTrackId) : null,
            title: String(title || ''),
            artist: String(artist || ''),
            dur: durNum
        });

        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message || 'Failed to fetch lyrics' });
    }
});

export default router;
