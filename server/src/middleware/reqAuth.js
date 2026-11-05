import { auth } from "../firebase.js";

export async function reqAuth(req, res, next) {
    const header = req.headers.authorization ?? '';

    if (!header.startsWith('Bearer ')) {
        return res.status(401).json({
            error: 'Auth Req.',
        });
    }

    const token = header.slice(7);

    try {
        const decoded = await auth.verifyIdToken(token);
        req.user = {
            uid: decoded.uid,
            email: decoded.email ?? null,
            name: decoded.name ?? null,
        };
        return next();
    } catch {
        return res.status(401).json({
            error: 'Invalid auth token',
        });
    }
}