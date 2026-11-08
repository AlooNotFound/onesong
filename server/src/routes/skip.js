import { Router } from "express";
import { reqAuth } from "../middleware/reqAuth.js";
import { castSkipVote } from "../skipVotes/service.js";

const router = Router();

router.post('/', reqAuth, async (req, res) => {
    try {
        const res = await castSkipVote(req.user.uid);
        res.json({ skip: res});
    } catch (err) {
        res.status(err.status ?? 500).json({
            error: err.message ?? 'Failed to cast vote',
        });
    }
});

export default router;