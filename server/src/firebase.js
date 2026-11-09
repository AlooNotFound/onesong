import { getApps, initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

const app = getApps().length === 0 ? initializeApp({
    credential: applicationDefault(),
    projectId: process.env.FIREBASE_PROJECT_ID || 'one-song-internet',
}) : getApps()[0];

export const db = getFirestore(app);
export const auth = getAuth(app);
export const FieldVal = FieldValue;
export { Timestamp };
