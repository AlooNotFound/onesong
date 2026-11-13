import { db, FieldVal, Timestamp } from '../firebase.js';
import { parseYTUrl, resolveYTSubmission } from './yt.js';
import { normalizeTrack } from './normalizeTrack.js';
import {enqueueIngestion} from '../jobs/schema.js';

const MAX_PL_ENTRIES = 500;
const BATCH_TRACK_LIMIT = 200;

function timestampToMillis(ts) {
    return ts?.toMillis?.() ?? null;
}

function serializeSubmission(sub) {
    if (!sub.exists) return null;
    const data = sub.data();

    return {
        id: sub.id,
        submittedBy: data.submittedBy,
        srcUrl: data.srcUrl,
        srcType: data.srcType,
        status: data.status,
        itemCount: data.itemCount ?? null,
        truncated: Boolean(data.truncated ?? false),
        error: data.error ?? null,
        createdAt: timestampToMillis(data.createdAt),
        completedAt: timestampToMillis(data.completedAt),
    }
}

async function saveTrackForSub({ subRef, track, position }) {
    const norm = normalizeTrack(track);
    const srcRef = db.collection('tracks').doc(`yt_${track.providerTrackId}`);
    const membershipRef = subRef.collection('tracks').doc(track.providerTrackId);
    const canonicalRef = db.collection('canonical_tracks').doc(norm.canonicalId);
    await db.runTransaction(async (tx) => {
        const [srcSnap, canonicalSnap, membershipSnap] = await Promise.all([
            tx.get(srcRef),
            tx.get(canonicalRef),
            tx.get(membershipRef),
        ]);
        const now = FieldVal.serverTimestamp();
        const srcExists = srcSnap.exists;
        const membershipExists = membershipSnap.exists;
        const oldSrc = srcExists ? srcSnap.data() : null;
        const oldCanonical = canonicalSnap.exists ? canonicalSnap.data() : null;
        const oldMembership = membershipExists ? membershipSnap.data() : null;
        const srcChangedCanonical = oldSrc?.canonicalId !== norm.canonicalId;
        tx.set(srcRef, {
            provider: 'youtube',
            providerTrackId: track.providerTrackId,
            title: norm.title,
            originalTitle: track.title,
            artist: norm.artist,
            uploader: norm.uploader,
            duration: track.duration,
            thumbnailUrl: track.thumbnailUrl,
            srcUrl: track.srcUrl,
            canonicalTrackId: norm.canonicalId,
            normTitle: norm.normTitle,
            normArtist: norm.normArtist,
            version: norm.version,
            artistSrc: norm.artistSrc,
            deduplicationMethod: norm.deduplicationMethod,
            firstSubmittedAt:
            oldSrc?.firstSubmittedAt ?? now,
            lastSubmittedAt: now,
            submissionCount: FieldVal.increment(
            membershipExists ? 0 : 1
        ),
      }, { merge: true });

      const canonicalData = {
          canonicalTrackId: norm.canonicalId,
          title: norm.title,
          artist: norm.artist,
          normTitle: norm.normTitle,
          normArtist: norm.normArtist,
          version: norm.version,
          canDeduplicate: norm.canDeduplicate,
          deduplicationMethod: norm.deduplicationMethod,
          published: true,
          repSourceId: track.providerTrackId,
          duration: track.duration ?? null,
          thumbnailUrl: track.thumbnailUrl ?? null,
          srcUrl: track.srcUrl ?? null,
          lastSubmittedAt: now,
      };

      if (!canonicalSnap.exists) {
          canonicalData.firstSubmittedAt = now;
          canonicalData.srcCount = 1;
          canonicalData.submissionCount = membershipExists ? 0 : 1;
      } else {
          canonicalData.srcCount = FieldVal.increment(!srcExists || srcChangedCanonical ? 1 : 0);
          canonicalData.submissionCount = FieldVal.increment(!membershipExists ? 1 : 0);
      }

      tx.set(canonicalRef, canonicalData, { merge: true });

      if (!membershipExists) {
        tx.create(membershipRef, {
            providerTrackId: track.providerTrackId,
            canonicalTrackId: norm.canonicalId,
            position,
            addedAt: now,
        });
      }
    });
}

export async function createSubmission({ url, uid }) {
  const parsed = parseYTUrl(url);
  const subRef = db
    .collection('submissions')
    .doc();
  await subRef.create({
    submittedBy: uid,
    srcUrl: url.trim(),
    srcType: parsed.type,
    provider: 'youtube',
    status: 'queued',
    itemCount: 0,
    truncated: false,
    error: null,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
    completedAt: null,
  });
  try {
    await enqueueIngestion({ subId: subRef.id, uid, });
    processIngestionJob(subRef.id).catch((err) => {
      console.warn('bg ingestion error:', err.message);
    });
  } catch (err) {
    await subRef.update({ status: 'failed', error: err.message, completedAt: FieldVal.serverTimestamp(), }).catch(() => {});
    throw err;
  }

  return {
    id: subRef.id,
    submittedBy: uid,
    srcUrl: url.trim(),
    srcType: parsed.type,
    status: 'queued',
    itemCount: 0,
    truncated: false,
  };
}

export const createSub = createSubmission;

export async function getSub(subId) {
    const subRef = db.collection('submissions').doc(subId);
    const snap = await subRef.get();
    if (!snap.exists) return null;
    const sub = serializeSubmission(snap);
    const tracksSnap = await subRef.collection('tracks').orderBy('position', 'asc').get();

    const trackRefs = tracksSnap.docs.map((doc) => 
    db.collection('tracks').doc(`yt_${doc.id}`));
    const trackSnaps = [];
    for (let i=0; i< trackRefs.length; i+=100) {
        const chunk = trackRefs.slice(i, i+100);
        const snaps = await db.getAll(...chunk);
        trackSnaps.push(...snaps);
    }

    const tracksById = new Map(
        trackSnaps.filter((doc) => doc.exists).map((doc) => [doc.id, doc.data()])
    );
    const tracks = tracksSnap.docs.map((membership) => {
        const data =  membership.data();
        const track = tracksById.get(`yt_${membership.id}`);
        if (!track) return null;
        return {
            providerTrackId: track.providerTrackId,
            title: track.title,
            artist: track.artist,
            duration: track.duration,
            thumbnailUrl: track.thumbnailUrl,
            srcUrl: track.srcUrl,
            position: data.position,
        };
    }).filter(Boolean);

    return {
        ...sub, tracks
    };
}

export async function listSubs({ limit = 20 } = {}) {
    const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const snap = await db.collection('submissions').orderBy('createdAt', 'desc').limit(safeLimit).get();
    return snap.docs.map(serializeSubmission).filter(Boolean);
}

export async function getDiscoveryPool({ limit = 20, cursor = null,} = {}) {
    const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
    let q = db.collection('canonical_tracks').where('published', '==', true).orderBy('lastSubmittedAt', 'desc').limit(safeLimit);
    if (cursor) {
        const cursorSnap = await db.collection('canonical_tracks').doc(cursor).get();
        if (!cursorSnap.exists) {
            return { tracks: [], nextCursor: null };
        }
        q = q.startAfter(cursorSnap);
    }

    const snap = await q.get();
    return {
        tracks: snap.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
            lastSubmittedAt: timestampToMillis(doc.data().lastSubmittedAt),
        })),
        nextCursor: snap.docs.length === safeLimit ? snap.docs[snap.docs.length - 1].id : null,
    }
}

export async function processIngestionJob(subId) {
  const subRef = db.collection('submissions').doc(subId);
  const subSnap = await subRef.get();
  if (!subSnap.exists) {
    throw new Error('Submission not found.');
  }

  const data = subSnap.data();

  if (data.status === 'completed') {
    return { subId, status: 'completed', alreadyCompleted: true, };
  }
  const parsed = parseYTUrl(data.srcUrl);
  await subRef.update({ status: 'processing', updatedAt: FieldVal.serverTimestamp(), error: null, });
  const res = await resolveYTSubmission(parsed, { maxPlaylistEntries: MAX_PL_ENTRIES, });
  const uniqueTracks = [ ...new Map( res.tracks.map((track) => [ track.providerTrackId, track, ]) ).values() ];

  for (let i = 0; i < uniqueTracks.length; i++) {
    await saveTrackForSub({ subRef, track: uniqueTracks[i], position: i, 
    });
  }
  const memberships = await subRef.collection('tracks').get();
  const canonicalRefs = [ ...new Map(memberships.docs.map((doc) => doc.data().canonicalTrackId).filter(Boolean).map((id) => [ id, db.collection('canonical_tracks').doc(id), ])).values(),];
  for (let i = 0; i < canonicalRefs.length; i += 450) {
    const batch = db.batch();
    for (const ref of canonicalRefs.slice(i, i + 450)) {
      batch.set(ref, {
        published: true,
        lastSubmittedAt: FieldVal.serverTimestamp(),
      }, { merge: true });
    }
    await batch.commit();
  }

  await subRef.update({
    status: 'completed',
    itemCount: uniqueTracks.length,
    nextCursor: res.nextCursor ?? null,
    truncated: Boolean(res.truncated),
    error: null,
    completedAt: FieldVal.serverTimestamp(),
    updatedAt: FieldVal.serverTimestamp(),
  });

  return {
    subId,
    status: 'completed',
    itemCount: uniqueTracks.length,
    truncated: Boolean(res.truncated),
  };
}