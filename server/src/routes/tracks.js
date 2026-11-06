import { Router } from "express";
import { reqAuth } from '../middleware/reqAuth.js';
import { getTrackVote, setTrackVote } from "../votes/service.js";

const router = Router();

router.get('/:canonicalTrackId/vote', requireAuth, async (req, res) => {
  try {
    const { canonicalTrackId } = req.params;
    const result = await getTrackVote({ canonicalTrackId, uid: req.user.uid,});
    res.json({ vote: result });
  } catch (err) {
    res.status(err.status ?? 500).json({
      error: err.message ?? 'Failed to retrieve votes',
    });
  }
});

router.post('/:canonicalTrackId/vote', reqAuth, async (req, res) => {
    try {
        const { canonicalTrackId } = req.params;
        const { val } = req.body;

        if (![1, -1, 0].includes(val)) {
            return res.status(400).json({ error: 'Invalid vote value' });
        }
        const res = await setTrackVote({ canonicalTrackId, uid: req.user.uid, vote: val, });
        res.json({ vote: res });
    } catch (err) {
        res.status(err.status ?? 500).json({
            error: err.message ?? 'Failed to set vote',
        })
    }
})

export default router;