import { extractVIdMeta, extractPLMeta } from '../audio/downloader.js';

const YT_URLS = new Set([
    'youtube.com',
    'www.youtube.com',
    'm.youtube.com',
    'music.youtube.com',
    'youtu.be',
]);

const VID_ID_PATTERN = /^[a-zA-Z0-9_-]{11}$/;
const PLAYLIST_ID_PATTERN = /^[a-zA-Z0-9_-]{10,}$/;

export class SubmitErr extends Error {
    constructor(message, code = 400) {
        super(message);
        this.name = 'SubmissionError';
        this.code = code;
    }
}

export function parseYTUrl(input) {
    if (typeof input !== 'string' || !input.trim()) {
        throw new SubmitErr('Invalid input: must be a non-empty string');
    }
    let url;
    try {
        url = new URL(input.trim());
    } catch {
        throw new SubmitErr('Invalid URL format');
    }

    if (!['https:', 'http:'].includes(url.protocol)) {
        throw new SubmitErr('Invalid URL protocol: must be http or https');
    }
    if (!YT_URLS.has(url.hostname)) {
        throw new SubmitErr('Invalid YouTube URL: unrecognized domain');
    }

    let vidId = null;
    if (url.hostname.toLowerCase() === 'youtu.be') {
        vidId = url.pathname.split('/').filter(Boolean)[0] ?? null;
    } else {
        const parts = url.pathname.split('/').filter(Boolean);
        if (parts[0] === 'watch') {
            vidId = url.searchParams.get('v');
        } else if (['shorts', 'embed', 'live'].includes(parts[0])) {
            vidId = parts[1] ?? null;
        }
    }

    const playlistId = url.searchParams.get('list');
    if (playlistId) {
        if (!PLAYLIST_ID_PATTERN.test(playlistId)) {
            throw new SubmitErr('Invalid YouTube playlist ID');
        }
        return { type: 'playlist', id: playlistId };
    }

    if (!vidId) {
        throw new SubmitErr('Invalid YouTube URL: no valid video ID found');
    }

    if (!VID_ID_PATTERN.test(vidId)) {
        throw new SubmitErr('Invalid YouTube video ID');
    }

    return { type: 'video', id: vidId };
}

async function getVideoInfo(vidIds) {
    const results = await Promise.all(
        vidIds.map(async (id) => {
            try {
                return await extractVIdMeta(id);
            } catch (err) {
                console.error(`Failed to extract metadata without API for ${id}:`, err.message);
                return null;
            }
        })
    );
    return results.filter(Boolean);
}

async function getPlaylistInfo(plId, maxEntries) {
    const plInfo = await extractPLMeta(plId, maxEntries);
    return {
        videoIds: plInfo.videoIds,
        tracks: plInfo.tracks,
        truncated: plInfo.truncated,
    };
}

export async function resolveYTSubmission(parsed, { maxPlaylistEntries = 500 } = {}) {
    if (parsed.type === 'video') {
        const tracks = await getVideoInfo([parsed.id]);
        if (!tracks.length) {
            throw new SubmitErr('Video not found', 404);
        }
        return { tracks, truncated: false };
    }

    const plResult = await getPlaylistInfo(parsed.id, maxPlaylistEntries);
    if (!plResult.videoIds?.length) {
        throw new SubmitErr('Playlist not found or empty', 404);
    }

    let tracks = plResult.tracks;
    if (!tracks || !tracks.length) {
        tracks = await getVideoInfo(plResult.videoIds);
    }
    if (!tracks.length) {
        throw new SubmitErr('No valid videos found in playlist', 404);
    }

    return { tracks, truncated: plResult.truncated };
}