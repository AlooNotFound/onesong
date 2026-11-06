import { initializeApp } from 'firebase-admin';
import { db } from '../firebase.js';

async function initVoteCounts() {
    const snap = await db.collection('canonical_tracks').get();
    let batch = db.batch();
    let ops = 0;
    let updated = 0;

    for (const doc of snap.docs) {
        const data = doc.data();
        if ( typeof data.likes === 'number' && typeof data.dislikes === 'number') continue;
        ops++;
        updated++;

        if (ops === 450) {
            await batch.commit();
            batch = db.batch();
            ops = 0;
        }
    }
    if (ops > 0) {
        await batch.commit();
    }
}

initVoteCounts().catch((err) => {
    console.error(err);
    process.exit(1);
})