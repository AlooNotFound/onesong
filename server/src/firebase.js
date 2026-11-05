import admin from 'firebase-admin';

if (!admin.getApps.length) {
    admin.initializeApp({
        credential: admin.credential.applicationDefault(),
        projectId: process.env.FIREBASE_PROJECT_ID,
    });
}

export const db = admin.firestore();
export const auth = admin.auth();
export const FieldVal = admin.firestore.FieldValue;
export const Timestamp = admin.firestore.Timestamp;