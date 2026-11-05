import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { createSub, getSub, listSubs, getDiscoveryPool } from '../submissions/service.js';
import { SubmitErr } from '../submissions/yt.js';

const router = Router();
router.post('/', requireAuth, async (req, res) => {
  try {
    const { url } = req.body ?? {};
    if (typeof url !== 'string') {
      return res.status(400).json({
        error: 'url must be a string.',
      });
    }
    const sub = await createSub({ url, uid: req.user.uid, });
    return res.status(201).json({ submission: sub });
  } catch (err) {
    const code = err instanceof SubmissionError ? err.statusCode : 500;
    return res.status(code).json({
      error: err.message || 'Could not process submission.',
      submissionId: err.submissionId ?? null,
    });
  }
});

router.get('/pool', async (req, res) => {
    try {
        const res = await getDiscoveryPool({
            limit: req.query.limit,
            cursor: req.query.cursor,
        });
        return res.status(200).json(res);
    } catch {
        return res.status(500).json({
            error: 'Failed to fetch discovery pool',
        });
    }
});

router.get('/', async (req, res) => {
    try {
        const subs = await listSubs({
            limit: req.query.limit,
        });
        return res.status(200).json({ submissions: subs });
    } catch {
        return res.status(500).json({
            error: 'Failed to fetch submissions',
        });
    }
});

router.get('/:id', async (req, res) => {
    try {
        const sub = await getSub(req.params.id);
        if (!sub) {
            return res.status(404).json({
                error: 'Submission not found',
            });
        }
        return res.status(200).json({ submission: sub });
    } catch {
        return res.status(500).json({
            error: 'Failed to fetch submission',
        });
    }
})

export default router;