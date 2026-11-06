import { db } from '../firebase.js';

export async function getPlayHistory(lim=50) {
    const safeLim = Math.min(100, Math.max(1, Number(lim) || 50));

    const snap = await db.collection('play_history').orderBy('startedAt', 'desc').limit(safeLim).get();
    return snap.docs.map((doc) => ({
        id: doc.id,
        ...doc.data()
    }));
}

export async function getHistoryEntry(songNum) {
    const snap = await db.collection('play_history').doc(String(songNum)).get();
    if (!snap.exists) return null;
    return {
        id: snap.id,
        ...snap.data()
    };
}