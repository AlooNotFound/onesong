import admin from 'firebase-admin';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

const apps = typeof admin.getApps === 'function' ? admin.getApps() : [];

const credential = process.env.GOOGLE_APPLICATION_CREDENTIALS
    ? (admin.credential?.applicationDefault?.() ?? admin.applicationDefault?.())
    : undefined;

const app = apps.length > 0 ? apps[0] : admin.initializeApp({
    ...(credential ? { credential } : {}),
    projectId: process.env.FIREBASE_PROJECT_ID || 'one-song-internet',
});

export const db = typeof app.firestore === 'function' ? app.firestore() : getFirestore(app);
if (!db.runTransaction && typeof db.runTransaction === 'function') {
    db.runTransaction = db.runTransaction.bind(db);
}

export const auth = typeof app.auth === 'function' ? app.auth() : getAuth(app);
export const FieldVal = FieldValue;
export { Timestamp };