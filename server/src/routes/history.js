import { Router } from "express";
import { getPlayHistory, getHistoryEntry } from "../history/service";

const router = Router();

router.get('/', async (req, res) => {
    try {
        const history = await getPlayHistory(req.query.limit);
        res.json(history);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
})

router.get('/:songNum', async (req, res) => {
    try {
        const songNum = req.params.songNum;
        if (!Number.isSafeInteger(songNum) || songNum < 1) {
            return res.status(400).json({
                error: 'Invalid song number',
            });
        }
        const entry = await getHistoryEntry(songNum);
        if (!entry) {
            return res.status(404).json({
                error: 'History entry not found',
            });
        }
        res.json(entry);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
})

export default router;