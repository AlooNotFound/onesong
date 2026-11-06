import { Router } from "express";
import { getStation } from "../station.js";

const router = Router();

router.get('/', async (_req, res) => {
    try{
        const station = await getStation();
        return res.json(station);
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
});

export default router;