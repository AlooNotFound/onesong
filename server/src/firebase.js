import { getApps, initializeApp, applicationDefault, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import fs from 'fs';
import path from 'path';

let credential;
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
        const raw = process.env.FIREBASE_SERVICE_ACCOUNT.trim();
        const parsed = JSON.parse(raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8'));
        credential = cert(parsed);
    } catch {}
} else if (process.env.GOOGLE_APPLICATION_CREDENTIALS && fs.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
    credential = applicationDefault();
} else {
    const candidates = [
        path.resolve('serviceAccountKey.json'),
        path.resolve('server/serviceAccountKey.json'),
        path.resolve(import.meta.dirname, '../serviceAccountKey.json'),
        path.resolve(import.meta.dirname, '../../serviceAccountKey.json'),
    ];
    for (const file of candidates) {
        if (fs.existsSync(file)) {
            credential = cert(file);
            break;
        }
    }
}

const app = getApps().length === 0 ? initializeApp({
    ...(credential ? { credential } : {}),
    projectId: process.env.FIREBASE_PROJECT_ID || 'one-song-internet',
}) : getApps()[0];

export const db = getFirestore(app);
try {
    db.settings({ ignoreUndefinedProperties: true });
} catch {}
export const auth = getAuth(app);
export const FieldVal = FieldValue;
export { Timestamp };
