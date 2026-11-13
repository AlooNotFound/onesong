import { getApps, initializeApp, applicationDefault, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import fs from 'fs';
import path from 'path';

let credential;
if (process.env.GOOGLE_APPLICATION_CREDENTIALS && fs.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
    credential = applicationDefault();
} else if (fs.existsSync(path.resolve('serviceAccountKey.json'))) {
    credential = cert(path.resolve('serviceAccountKey.json'));
} else if (fs.existsSync(path.resolve('server/serviceAccountKey.json'))) {
    credential = cert(path.resolve('server/serviceAccountKey.json'));
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
