const YT_URLS = new Set([
    'youtube.com',
    'www.youtube.com',
    'm.youtube.com',
    'music.youtube.com',
    'youtu.be'
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
    throw new SubmitErr('Invalid YouTube URL: no valid video or playlist ID found');
}

async function ytReq(endpoint, params = {}, method = 'GET') {
    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey) {
        throw new SubmitErr('YouTube API key is not configured', 500);
    }

    const url = new URL(`https://www.googleapis.com/youtube/v3/${endpoint}`);
    params.key = apiKey;
    Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
            url.searchParams.append(key, value);
        }
    });
    const resp = await fetch(url.toString(), { method });
    if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new SubmitErr(
            `YouTube API request failed: ${resp.status} ${resp.statusText}`,
            resp.status
        );
    }
    return await resp.json();
}

function parseDur(val) {
    if (!val) return null;
    const match = val.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
    if (!match) return null;
    const [, h, m, s] = match.map(Number);
    return (h || 0) * 3600 + (m || 0) * 60 + (s || 0);
}

async function getVideoInfo(vidIds) {
    const res = [];
    for (let i = 0; i < vidIds.length; i += 50) {
        const batch = vidids.slice(i, i + 50);
        const data = await ytReq('videos', {
            part: 'snippet,contentDetails,statistics',
            id: batch.join(','),
        });
        for (const i of data.items?? []) {
            const snip = i.snippet ?? {};
            res.push({
                id: i.id,
                title: snip.title ?? null,
                description: snip.description ?? null,
                artist: snip.channelTitle ?? null,
                duration: parseDur(i.contentDetails?.duration),
                thumbnailUrl: snip.thumbnails?.high?.url ?? snip.thumbnails?.default?.url ?? null,
                srcUrl: `https://www.youtube.com/watch?v=${i.id}`,
            });
        }
    }
    return res;
}

async function getPlaylistInfo(plId, maxEntries) {
    const ids = [];
    let pageToken;
    let truncated = false;
    while (true) {
        const remaining = maxEntries - ids.length;
        if (remaining <= 0) {
            truncated = true;
            break;
        }
        const data = await ytReq('playlistItems', {
            part: 'contentDetails',
            playlistId: plId,
            maxResults: Math.min(remaining, 50),
            pageToken,
        });

        for (const i of data.items ?? []) {
            const id = i.contentDetails?.videoId;
            if (id) {
                ids.push(id);
            }
        }
        pageToken = data.nextPageToken;

        if (!pageToken) {
            break;
        }
    }
    return {
        videoIds: [...new Set(ids)],
        truncated,
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
    const { videoIds, truncated } = await getPlaylistInfo(parsed.id, maxPlaylistEntries);
    if (!videoIds.length) {
        throw new SubmitErr('Playlist not found or empty', 404);
    }
    const tracks = await getVideoInfo(videoIds);
    if (!tracks.length) {
        throw new SubmitErr('No valid videos found in playlist', 404);
    }
    return { tracks, truncated };
}