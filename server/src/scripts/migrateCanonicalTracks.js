import { db, FieldVal } from '../firebase.js';
import { normalizeTrack } from './normalizeTrack.js';

const tracksSnap = await db.collection('tracks').get();
const subsSnap = await db.collection('submissions').get();
const srcByVidId = new Map();
const canonicalGroups = new Map();
const srcSubCounts = new Map();
const canonicalSubSets = new Map();

for (const doc of tracksSnap.docs) {
    const data = doc.data();
    const norm = normalizeTrack({
        providerTrackId: data.providerTrackId,
        title: data.originalTitle ?? data.title,
        artist: data.uploader ?? data.artist,
    });
    srcByVidId.set(data.providerTrackId, {
        doc, data, norm,
    });
    if (!canonicalGroups.has(norm.canonicalId)) {
        canonicalGroups.set(norm.canonicalId, {
            ...norm, srcCount: 0, repSrcId: data.providerTrackId, firstSubmittedAt: data.firstSubmittedAt ?? data.createdAt ?? null, lastSubmittedAt: data.lastSubmittedAt ?? data.createdAt ?? null,
        });
    }
    const group = canonicalGroups.get(norm.canonicalId);
    group.srcCount++;
}

for (const doc of subsSnap.docs) {
    const memberships = await doc.ref.collection('tracks').get();
    for (const m of memberships.docs) {
        const videoId = m.id;
        const src = srcByVidId.get(videoId);
        if (!src) continue;
            const canonicalId = src.norm.canonicalId;
        if (!srcSubCounts.has(videoId)) {
            srcSubCounts.set(videoId, new Set());
        }
        srcSubCounts.get(videoId).add(doc.id);
        if (!canonicalSubSets.has(canonicalId)) {
            canonicalSubSets.set(canonicalId, new Set());
        }
        canonicalSubSets.get(canonicalId).add(doc.id);
  }
}

async function commitOps(ops) {
    for (let i = 0; i< ops.length; i += 450) {
        const batch = db.batch();
        for (const op of ops.slice(i, i + 450)) {
            op(batch);
        }
        await batch.commit();
    }
}

const srcOps = [];

for (const [vidId, src] of srcByVidId.entries()) {
    const { doc, data, norm } = src;
    srcOps.push((batch) => {
        batch.set(
            doc.ref, {
                title: norm.title,
                originalTitle: data.originalTitle ?? norm.title,
                artist: norm.artist,
                uploader: norm.uploader,
                canonicalTrackId: norm.canonicalId,
                normTitle: norm.normTitle,
                normArtist: norm.normArtist,
                version: norm.version,
                artistSrc: norm.artistSrc,
                deduplicationMethod: norm.deduplicationMethod,
                firstSubmittedAt: data.firstSubmittedAt ?? data.createdAt ?? null,
                lastSubmittedAt: data.lastSubmittedAt ?? data.createdAt ?? null,
                submissionCount: srcSubCounts.get(vidId)?.size ?? 0,
            }, { merge: true }
        );
    });
}

const canonicalOps = [];

for (const [canonicalId, group] of canonicalGroups.entries()) {
    canonicalOps.push((batch) => {
        batch.set(
            db.collection('canonical_tracks').doc(canonicalId), {
              title: group.title,
              artist: group.artist,
              normTitle: group.normTitle,
              normArtist: group.normArtist,
              version: group.version,
              canDeduplicate: group.canDeduplicate,
              deduplicationMethod: group.deduplicationMethod,
              published: false,
              srcCount: group.srcCount,
              submissionCount: canonicalSubSets.get(canonicalId)?.size ?? 0,
              repSourceId: group.repSrcId,
              firstSubmittedAt: group.firstSubmittedAt ?? null,
              lastSubmittedAt: group.lastSubmittedAt ?? null,
            }, { merge: true }
        );
    });  
}

await commitOps(srcOps);
await commitOps(canonicalOps);

console.log(`Updated ${srcOps.length} source tracks and ${canonicalOps.length} canonical tracks.`);