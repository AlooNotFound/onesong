import { db, FieldVal, Timestamp } from '../firebase.js';

export async function enqueueIngestion({ subId, uid }) {
    const subRef = db.collection('submissions').doc(subId);
    const jobRef = db.collection('ingestionJobs').doc(subId);
    await db.runTx(async (tx) => {
        const [sub, existingJob] = await Promise.all([
            tx.get(subRef),
            tx.get(jobRef),
        ]);
        if (!sub.exists) {
            throw new Error('Submission not found');
        }
        if (existingJob.exists) {
            throw new Error('Ingestion job already exists');
        }
        const now = Timestamp.now();
        tx.update(subRef, {
            status: 'queued',
            updatedAt: FieldVal.serverTimestamp(),
        });
        tx.create(jobRef, {
            subId,
            submittedBy: uid,
            status: 'queued',
            attempts: 0,
            maxAttempts: 5,
            workerId: null,
            leaseUntil: null,
            nextAttemptAt: now,
            lastErr: null,
            createdAt: now,
            updatedAt: now,
            completedAt: null,
        })
    })
    return subId;
}