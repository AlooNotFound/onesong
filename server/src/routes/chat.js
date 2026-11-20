import { Router } from "express";
import { auth } from "../firebase.js";
import { getProfile } from "../users/service.js";
import { getRecentMessages, addMessage } from "../chat/service.js";

const router = Router();

router.get('/', async (_req, res) => {
    try {
        const messages = await getRecentMessages(50);
        res.json({ messages });
    } catch (err) {
        res.status(500).json({ error: err.message || 'failed to fetch messages' });
    }
});

router.post('/', async (req, res) => {
    try {
        const { text, guestName } = req.body ?? {};
        if (typeof text !== 'string' || !text.trim()) {
            return res.status(400).json({ error: 'msg text is required' });
        }
        if (text.trim().length > 300) {
            return res.status(400).json({ error: 'msg cannot exceed 300 characters' });
        }
        let uid = null;
        let displayName = guestName ? String(guestName).trim() : null;
        let username = null;
        let isGuest = true;
        const header = req.headers.authorization ?? '';
        if (header.startsWith('Bearer ')) {
            try {
                const token = header.slice(7);
                const decoded = await auth.verifyIdToken(token);
                uid = decoded.uid;
                const profile = await getProfile(uid);
                if (profile) {
                    displayName = profile.displayName || profile.username || decoded.name || 'User';
                    username = profile.username || null;
                    isGuest = false;
                } else {
                    displayName = decoded.name || decoded.email?.split('@')[0] || 'User';
                    isGuest = false;
                }
            } catch {}
        }
        if (!displayName) {
            displayName = 'Guest';
        }
        const msg = await addMessage({
            text: text.trim(),
            uid,
            displayName,
            username,
            isGuest
        });
        res.status(201).json({ message: msg });
    } catch (err) {
        res.status(500).json({ error: err.message || 'failed to send msg' });
    }
});
export default router;