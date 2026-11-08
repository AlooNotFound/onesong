import { Router } from "express";
import { getStation } from "../station/service.js";

const router = Router();

router.get('/', async (_req, res) => {
    try {
        const station = await getStation();
        return res.json({ station, ...station });
    } catch (err) {
        console.error('Error fetching station:', err);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
});

export default router;
