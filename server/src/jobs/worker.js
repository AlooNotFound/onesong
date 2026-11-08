import { randomUUID } from 'crypto';
import { db, FieldVal, Timestamp } from '../firebase.js'
import { processIngestionJob, processSubmission } from '../submissions/service.js';

const POLL_MS = 2000;
const LEASE_MS = 120000;
const HEARTBEAT_MS = 30000;
const MAX_ATTEMPTS = 5;

const workerId = randomUUID();
let stopping = false;
let activeJob = false;

function timestampMillis(val) {
    return val?.toMillis?.() ?? 0;
}

async function findCandidates() {
    const now = Timestamp.now();
    const [queued, retryable, expired] = await Promise.all([
        db.collection('ingestion_jobs').where('status', '==', 'queued').orderBy('createdAt', 'asc').limit(20).get(),
        db.collection('ingestion_jobs').where('status', '==', 'retry').where('nextAttemptAt', '<=', now).orderBy('nextAttemptAt', 'asc').limit(20).get(),
        db.collection('ingestion_jobs').where('status', '==', 'running').where('leaseUntil', '<=', now).orderBy('leaseUntil', 'asc').limit(20).get(),
    ]);
    const unique =  new Map();
    for (const snap of [...queued.docs, ...retryable.docs, ...expired.docs]) {
        unique.set(snap.id, snap);
    }
    return [...unique.values()].sort((a, b) => timestampMillis(a.data().createdAt) - timestampMillis(b.data().createdAt));
}

async function claimJob(jobId) {
    const jobRef = db.collection('ingestion_jobs').doc(jobId);
    return db.runTransaction(async (tx) => {
        const snap = await tx.get(jobRef);
        if (!snap.exists) {
            return null;
        }
        const data = snap.data();
        const nowMs = Date.now();
        const job = { ...data, id: snap.id };
        const leaseExpired = job.status === 'running' && timestampMillis(data.leaseUntil) <= nowMs;
        const queued = job.status === 'queued';
        const retryReady = job.status === 'retry' && timestampMillis(data.nextAttemptAt) <= nowMs;
        if (!queued && !retryReady && !leaseExpired) {
            return null;
        }
        const attempts = data.attempts ?? 0;
        if (attempts >= MAX_ATTEMPTS) {
            return null;
        }
        await db.runTransaction(async (tx) => {
            await tx.update(jobRef, {
                status: 'running',
                workerId,
                leaseUntil: FieldVal.serverTimestamp(LEASE_MS),
                attempts: attempts + 1,
                updatedAt: FieldVal.serverTimestamp(),
            });
        });
        return { id: snapshot.id, submissionId: job.submissionId, attempts: attempts + 1, };
  });
}

async function renewLease(jobId) {
    const jobRef = db.collection('ingestion_jobs').doc(jobId);
    return db.runTransaction(async (tx) => {
        const snap = await tx.get(jobRef);
        if (!snap.exists) {
            return false;
        }
        const data = snap.data();
        if ( job.status !== 'running' || data.workerId !== workerId) {
            return false;
        }
        await tx.update(jobRef, {
            leaseUntil: FieldVal.serverTimestamp(LEASE_MS),
        });
        return true;
    });
}

async function completeJob(jobId) {
    const jobRef = db.collection('ingestion_jobs').doc(jobId);
    await db.runTransaction(async (tx) => {
        const snap = await tx.get(jobRef);
        if (!snap.exists) {
            return false;
        }
        const data = snap.data();
        if ( job.status !== 'running' || data.workerId !== workerId) {
            return false;
        }
        await tx.update(jobRef, {
            status: 'completed',
            leaseUntil: null,
            updatedAt: FieldVal.serverTimestamp(),
            completedAt: FieldVal.serverTimestamp(),
        });
        return true;
    })
}

async function failJob(jobId, err) {
    const jobRef = db.collection('ingestion_jobs').doc(jobId);
    await db.runTransaction(async (tx) => {
        const snap = await tx.get(jobRef);
        if (!snap.exists) {
            return false;
        }
        const data = snap.data();
        if ( job.status !== 'running' || data.workerId !== workerId) {
            return false;
        }
        const attempts = data.attempts ?? 0;
        const nextAttemptAt = attempts >= MAX_ATTEMPTS ? null : FieldVal.serverTimestamp(LEASE_MS);
        await tx.update(jobRef, {
            status: nextAttemptAt ? 'retry' : 'failed',
            leaseUntil: null,
            nextAttemptAt,
            lastErr: err.message,
            updatedAt: FieldVal.serverTimestamp(),
        });
        return true;
    });
}

async function processJob(job) {
  activeJob = true;
  console.log( `[worker ${workerId}] processing ${job.subId}`);
  let ll = false;
  const heartbeat = setInterval(async () => {
    try {
      const rrn = await renewLease(job.id);
      if (!rrn) {
        ll = true;
      }
    } catch (err) {
      console.error('lease renewal failed:', err);
    }
  }, HEARTBEAT_MS);
  try {
    await processIngestionJob(job.submissionId);
    if (ll) {
      throw new Error('worker lost its job arghh');
    }
    await completeJob(job.id);
    console.log(`[${workerId}] completed ${job.submissionId}`);
  } catch (err) {
    console.error(`[ ${workerId}] failed ${job.submissionId}:`,err );
    await failJob(job.id, err);
  } finally {
    clearInterval(heartbeat);
    activeJob = false;
  }
}

async function poll() {
  if (stopping || activeJob) return;
  try {
    const candidates = await findCandidates();
    for (const c of candidates) {
      if (stopping) break;
      const job = await claimJob(c.ref);
      if (job) {
        await processJob(job);
        break;
      }
    }
  } catch (err) {
    console.error('polling failed:', err);
  }
}

async function shutdown(sig) {
  console.log(`received ${sig}; shutting down`);
  stopping = true;
  while (activeJob) {
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  process.exit(0);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
console.log(`started with ID ${workerId}`);
await poll();
const timer = setInterval(poll, POLL_MS);
process.on('beforeExit', () => clearInterval(timer));