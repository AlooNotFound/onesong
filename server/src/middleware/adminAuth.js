import { auth, db } from '../firebase.js';

const DEFAULT_ADMIN_KEY = 'onesong-admin';

export async function requireAdmin(req, res, next) {
    const adminKey = req.headers['x-admin-key'];
    const expectedKey = process.env.ADMIN_KEY || process.env.ADMIN_SECRET || DEFAULT_ADMIN_KEY;
    if (adminKey && adminKey === expectedKey) {
        req.isAdmin = true;
        return next();
    }

    const authHeader = req.headers.authorization || '';
    if (authHeader.startsWith('Bearer ')) {
        const token = authHeader.slice(7);
        try {
            const decoded = await auth.verifyIdToken(token);
            req.user = {
                uid: decoded.uid,
                email: decoded.email || null,
                name: decoded.name || null,
                role: decoded.role || 'user',
            };
            const adminUids = (process.env.ADMIN_UIDS || '').split(',').map((s) => s.trim()).filter(Boolean);
            const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
            const isExplicitAdmin =
                decoded.admin === true ||
                decoded.role === 'admin' ||
                (decoded.email && adminEmails.includes(decoded.email.toLowerCase())) ||
                adminUids.includes(decoded.uid);
            if (isExplicitAdmin) {
                req.isAdmin = true;
                return next();
            }

            try {
                const userSnap = await db.collection('users').doc(decoded.uid).get();
                if (userSnap.exists) {
                    const uData = userSnap.data();
                    if (uData.role === 'admin' || uData.isAdmin) {
                        req.isAdmin = true;
                        return next();
                    }
                }
            } catch {}
        } catch {}
    }

    return res.status(403).json({ error: 'Unauthorized: admin access required' });
}
