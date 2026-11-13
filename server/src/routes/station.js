import { Router } from "express";
import { getStation, getStationSnap, advanceStation } from "../station/service.js";

const router = Router();

router.get('/', async (req, res) => {
    try {
        const advanceIfEnding = req.query.advance === '1' || req.query.advance === 'true';
        const station = await getStation({ advanceIfEnding });
        return res.json({ station, ...station });
    } catch (err) {
        console.error('Error fetching station:', err.message || err);
        try {
            const fallback = await getStationSnap();
            return res.json({ station: fallback, ...fallback });
        } catch {
            return res.json({
                station: { status: 'waiting', song: null, position: 0, remaining: 0 },
                status: 'waiting',
                song: null,
            });
        }
    }
});

router.post('/advance', async (_req, res) => {
    try {
        const station = await advanceStation({ force: true });
        return res.json({ station, ...station });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

export default router;
