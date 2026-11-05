import { db, FieldVal } from '../firebase.js';

const snap = await db.collection('canonical_tracks').get();
for (let i=0; i < snap.docs.length; i += 450) {
    const batch = db.batch();
    for (const doc of snap.docs.slice(i, i + 450)) {
        batch.set(doc.ref, {
            published: true,
            lastSubmittedAt: doc.data().lastSubmittedAt ?? FieldVal.serverTimestamp(),
        }, { merge: true });
    }
    await batch.commit();
}

console.log(`Updated ${snap.docs.length} canonical tracks to be published.`);