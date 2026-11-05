import { createHash } from "crypto";

const VERSION_PATTERNS = [
  ['live', /\b(live|concert|live at|live from)\b/i],
  ['remix', /\b(remix|rework|bootleg)\b/i],
  ['acoustic', /\b(acoustic|unplugged)\b/i],
  ['instrumental', /\b(instrumental|karaoke)\b/i],
  ['cover', /\b(cover|covered by)\b/i],
  ['sped_up', /\b(sped[\s_-]?up)\b/i],
  ['slowed', /\b(slowed|slowed[\s_-]?reverb)\b/i],
  ['nightcore', /\bnightcore\b/i],
  ['edit', /\b(edit|extended mix|radio edit)\b/i],
];

const REMOVABLE_TAGS = [
  /\b(official music video|official video|official audio)\b/gi,
  /\b(lyrics video|lyric video|lyrics|lyric)\b/gi,
  /\b(hd|4k|hq|visualizer|visualiser)\b/gi,
  /\b(full song|audio only)\b/gi,
];

function cleanTxt(val) {
    return String(val?? '').normalize('NFKC').replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/[\s]+/g, ' ').trim();
}

function normalizeWords(val) {
    return cleanTxt(val).toLocaleLowerCase('en').normalize('NFKD').replace(/\p{Diacritic}/gu, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
}

function hash(val) {
    return createHash('sha256').update(val).digest('hex').slice(0, 32);
}

function detectVersion(title) {
    const matches = VERSION_PATTERNS.filter(([, pattern]) => pattern.test(title)).map(([name]) => name);
    return matches.length ? matches.join('+') : 'original';
}

function stripBracketedNoise(title) {
    return title.replace(/\(([^)]*)\)|\[([^\]]*)\]/g, ' ');
}

function stripNoise(title) {
  let res = stripBracketedNoise(title);
  for (const pattern of REMOVABLE_TAGS) {
    res = res.replace(pattern, ' ');
  }
  for (const [, pattern] of VERSION_PATTERNS) {
    res = res.replace(pattern, ' ');
  }
  return cleanTxt(res).replace(/\s*[-|]\s*$/, '').replace(/^[\s\-|:]+|[\s\-|:]+$/g, '').trim();
}

function splitArtistTitle(raw) {
    const title = stripNoise(raw);
    const match = title.match(/^(.{1,100}?)\s+[-–—]\s+(.{1,150})$/);
    if (!match) {
        return { title, artist: null, artistSrc: null, };
    }
    const artist = cleanTxt(match[1]);
    const trackTitle = cleanTxt(match[2]);
    if (!artist || !trackTitle) {
        return { title, artist: null, artistSrc: null, };
    }
    return { title: trackTitle, artist, artistSrc: 'title_format', };
}

export function normalizeTrack(track) {
    const raw = cleanTxt(track.title ?? '');
    const version = detectVersion(raw);
    const parsed = splitArtistTitle(raw);
    const title = cleanTxt(parsed.title ?? raw);
    const artist = parsed.artist ?? cleanTxt(track.artist ?? '');
    const normTitle = normalizeWords(title);
    const normArtist = normalizeWords(artist);
    const id = hash(`${normArtist}::${normTitle}`);
    const canDeduplicate = Boolean(normTitle && normArtist);
    const identity = canDeduplicate ? [ 'yt-rec', normArtist, normTitle, version ].join(':') : `youtube-source:${track.providerTrackId}`;
    const canonicalId = `ct_${hash(identity)}`;
    return {
        id,
        canonicalId,
        title,
        artist,
        version,
        canDeduplicate,
        uploader: track.artist ?? null,
        normTitle,
        normArtist,
        artistSrc: parsed.artistSrc ?? null,
        deduplicationMethod: canDeduplicate ? 'normalized_artist_title_version' : 'source_id',
    };

}