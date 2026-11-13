import { Router } from "express";
import { reqAuth } from "../middleware/reqAuth.js";
import { getProfile, createProfile, updateProfile, changeUsername, getPublicProfile } from "../users/service.js";

const router = Router();

router.get('/me', reqAuth, async (req, res) => {
    try {
        const profile = await getProfile(req.user.uid);
        res.json({ profile: profile || null });
    } catch (err) {
        res.status(err.status ?? 500).json({
            error: err.message ?? 'Failed to retrieve profile',
        });
    }
});

router.get('/', reqAuth, async (req, res) => {
    try {
        const profile = await getProfile(req.user.uid);
        res.json({ profile: profile || null });
    } catch (err) {
        res.status(err.status ?? 500).json({
            error: err.message ?? 'Failed to retrieve profile',
        });
    }
});

router.post('/', reqAuth, async (req, res) => {
    try {
        const profile = await createProfile(req.user.uid, req.body);
        res.status(201).json({ profile });
    } catch (err) {
        res.status(err.status ?? 500 ).json({
            error: err.message ?? 'Failed to create profile',
        });
    }
});

router.patch('/me', reqAuth, async (req, res) => {
    try {
        const profile = await updateProfile(req.user.uid, req.body);
        res.json({ profile });
    } catch (err) {
        res.status(err.status ?? 500).json({
            error: err.message ?? 'Failed to update profile',
        });
    }
});

router.patch('/me/username', reqAuth, async (req, res) => {
    try {
        const profile = await changeUsername(req.user.uid, req.body.username);
        res.json({ profile });
    } catch (err) {
        res.status(err.status ?? 500).json({
            error: err.message ?? 'Failed to change username',
        });
    }
});

router.get('/:username', async (req, res) => {
    try {
        const profile = await getPublicProfile(req.params.username);
        if (!profile) {
            return res.status(404).json({ error: 'Profile not found' });
        }
        res.json(profile);
    } catch (err) {
        res.status(err.status ?? 500).json({
            error: err.message ?? 'Failed to retrieve profile',
        });
    }
});

export default router;