import { Router } from "express";
import { reqAuth } from "../middleware/reqAuth.js";
import { auth } from "../firebase.js";
import { castSkipVote, getSkipStatus } from "../skipVotes/service.js";

const router = Router();

router.get('/', async (req, res) => {
    try {
        let uid = null;
        const authHeader = req.headers.authorization || '';
        if (authHeader.startsWith('Bearer ')) {
            try {
                const decoded = await auth.verifyIdToken(authHeader.slice(7));
                uid = decoded.uid;
            } catch {}
        }
        const status = await getSkipStatus(uid);
        res.json(status);
    } catch (err) {
        res.status(err.status ?? 500).json({
            error: err.message ?? 'Failed to get skip status',
        });
    }
});

router.post('/', reqAuth, async (req, res) => {
    try {
        const result = await castSkipVote(req.user.uid);
        res.json(result);
    } catch (err) {
        res.status(err.status ?? 500).json({
            error: err.message ?? 'Failed to cast vote',
        });
    }
});

export default router;