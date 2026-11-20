import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import { db } from "../firebase.js";

const lyricsCache = new Map();

function parseLRC(lrc) {
    if (!lrc || typeof lrc !== 'string') return [];
    const lines = [];
    const regex = /\[(\d{1,2}):(\d{2}(?:\.\d{1,3})?)\](.*)/;
    for (const raw of lrc.split('\n')) {
        const match = raw.match(regex);
        if (match) {
            const min = parseInt(match[1], 10);
            const sec = parseFloat(match[2]);
            const time = Math.round((min * 60 + sec) * 100) / 100;
            const text = match[3].trim();
            if (text) {
                lines.push({ time, text });
            }
        }
    }
    return lines.sort((a, b) => a.time - b.time);
}

function cleanTitle(val) {
    if (!val) return '';
    return String(val)
        .replace(/\(([^)]*)\)|\[([^\]]*)\]/g, ' ')
        .replace(/\s*\|.*$/, '')
        .replace(/\b(official music video|official video|official audio|lyrics video|lyric video|lyrics|lyric|hd|4k|hq|visualizer|visualiser|full song|audio only|remix|acoustic|live)\b/gi, ' ')
        .replace(/\b(?:feat\.?|ft\.?|featuring)\b.*$/i, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function cleanArtist(val) {
    if (!val) return '';
    return String(val)
        .replace(/\b(?:feat\.?|ft\.?|featuring)\b.*$/i, '')
        .replace(/\s*,\s*.*$/, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function getLeadingSilence(filePath) {
    return new Promise((resolve) => {
        if (!filePath || !fs.existsSync(filePath)) {
            return resolve(0);
        }
        execFile("ffmpeg", [
            "-i", filePath,
            "-af", "silencedetect=noise=-25dB:d=0.5",
            "-t", "25",
            "-f", "null", "-"
        ], { timeout: 4000 }, (err, stdout, stderr) => {
            const output = stderr || stdout || "";
            const lines = output.split("\n");
            let leadSilence = 0;
            let inLead = false;
            for (const line of lines) {
                if (line.includes("silence_start:")) {
                    const m = line.match(/silence_start:\s*([\d.]+)/);
                    if (m && parseFloat(m[1]) <= 0.1) {
                        inLead = true;
                    } else if (inLead) {
                        const start = parseFloat(m ? m[1] : 0);
                        if (start - leadSilence > 0.5) {
                            inLead = false;
                        }
                    }
                }
                if (line.includes("silence_end:") && inLead) {
                    const m = line.match(/silence_end:\s*([\d.]+)/);
                    if (m) {
                        leadSilence = parseFloat(m[1]);
                    }
                }
            }
            resolve(leadSilence >= 1.5 ? Math.round(leadSilence * 10) / 10 : 0);
        });
    });
}

async function fetchFromLrclib(title, artist, dur, canonicalTrackId) {
    const rawT = (title || '').trim();
    const rawA = (artist || '').trim();
    const cleanT = cleanTitle(rawT);
    const cleanA = cleanArtist(rawA);

    const attempts = [];
    if (rawT && rawA) {
        const params = new URLSearchParams({ track_name: rawT, artist_name: rawA });
        if (dur) params.set('duration', String(Math.round(dur)));
        attempts.push(`https://lrclib.net/api/get?${params}`);
    }
    if (cleanT && cleanA && (cleanT !== rawT || cleanA !== rawA)) {
        const params = new URLSearchParams({ track_name: cleanT, artist_name: cleanA });
        attempts.push(`https://lrclib.net/api/get?${params}`);
    }
    const q1 = `${cleanA} ${cleanT}`.trim();
    if (q1) {
        attempts.push(`https://lrclib.net/api/search?q=${encodeURIComponent(q1)}`);
    }

    let filePath = null;
    if (canonicalTrackId) {
        const p = path.resolve(import.meta.dirname, '../../data/audio/cache', `${canonicalTrackId}.mp3`);
        if (fs.existsSync(p)) {
            filePath = p;
        }
    }

    const leadingSilence = filePath ? await getLeadingSilence(filePath) : 0;

    for (const url of attempts) {
        try {
            const resp = await fetch(url, {
                headers: { 'User-Agent': 'OneSong/0.1.0 (https://github.com/onesong)' }
            });
            if (!resp.ok) continue;
            const data = await resp.json();
            const item = Array.isArray(data) ? (data.find(x => x.syncedLyrics) || data[0]) : data;
            if (item && item.syncedLyrics) {
                let lines = parseLRC(item.syncedLyrics);
                if (lines.length > 0) {
                    const lrclibDur = typeof item.duration === 'number' ? item.duration : 0;
                    let offsetSec = leadingSilence;
                    if (!offsetSec && dur && lrclibDur > 0 && (dur - lrclibDur) >= 2.5) {
                        offsetSec = Math.round((dur - lrclibDur) * 10) / 10;
                    }

                    if (offsetSec > 0) {
                        lines = lines.map(line => ({
                            ...line,
                            time: Math.round((line.time + offsetSec) * 100) / 100
                        }));
                    }

                    return {
                        hasLyrics: true,
                        synced: true,
                        lines,
                        offsetSec,
                        trackName: item.trackName || item.name || title,
                        artistName: item.artistName || artist
                    };
                }
            }
        } catch {}
    }

    return { hasLyrics: false, lines: [] };
}

export async function getTrackLyrics({ canonicalTrackId, title, artist, dur }) {
    const cacheKey = canonicalTrackId || `${artist}_${title}`.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (lyricsCache.has(cacheKey)) {
        return lyricsCache.get(cacheKey);
    }

    try {
        const doc = await db.collection('track_lyrics').doc(cacheKey).get();
        if (doc.exists) {
            const data = doc.data();
            lyricsCache.set(cacheKey, data);
            return data;
        }
    } catch {}

    const result = await fetchFromLrclib(title, artist, dur, canonicalTrackId);
    lyricsCache.set(cacheKey, result);

    try {
        db.collection('track_lyrics').doc(cacheKey).set(result).catch(() => {});
    } catch {}

    return result;
}
