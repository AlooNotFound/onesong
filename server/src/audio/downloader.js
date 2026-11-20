import fs from 'fs/promises';
import { existsSync } from 'fs';
import { spawn } from 'child_process';
import path from 'path';
import os from 'os';
import { CACHE_DIR, MAX_FILE_SIZE } from './config.js';

function getYtDlpBin() {
    if (process.env.YT_DLP_PATH && existsSync(process.env.YT_DLP_PATH)) {
        return process.env.YT_DLP_PATH;
    }
    const home = os.homedir();
    const candidates = [
        path.join(home, '.local/bin/yt-dlp'),
        path.join(home, 'bin/yt-dlp'),
        '/usr/local/bin/yt-dlp',
        '/usr/bin/yt-dlp',
    ];
    for (const p of candidates) {
        if (existsSync(p)) return p;
    }
    return 'yt-dlp';
}

const YT_DLP_BIN = getYtDlpBin();

function getCookiesPath() {
    if (process.env.YT_COOKIES_PATH && existsSync(process.env.YT_COOKIES_PATH)) {
        return process.env.YT_COOKIES_PATH;
    }
    const home = os.homedir();
    const filenames = ['cookies.txt', 'cookie.txt', 'youtube_cookies.txt', 'youtube-cookies.txt'];
    const searchDirs = [
        process.cwd(),
        path.resolve('server'),
        path.resolve('..'),
        path.join(home, 'onesong'),
        path.join(home, 'onesong/server'),
        home,
        path.join(home, '.config/yt-dlp'),
    ];
    for (const dir of searchDirs) {
        for (const fname of filenames) {
            const p = path.join(dir, fname);
            if (existsSync(p)) return p;
        }
    }
    return null;
}

function getYtDlpExtractorArgs() {
    const args = ['--js-runtimes', 'node:node'];
    args.push('--extractor-args', 'youtube:player_client=visionos,mweb');
    if (process.env.YT_DLP_PROXY) {
        const proxies = process.env.YT_DLP_PROXY.split(',').map(p => p.trim()).filter(Boolean);
        const proxy = proxies[Math.floor(Math.random() * proxies.length)];
        console.log(`[AudioDownloader] Using proxy: ${proxy}`);
        args.push('--proxy', proxy);
    }
    return args;
}

const SPAWN_ENV = {
    ...process.env,
    PATH: [
        path.join(os.homedir(), '.local/bin'),
        path.join(os.homedir(), 'bin'),
        '/usr/local/bin',
        '/usr/bin',
        '/bin',
        process.env.PATH,
    ].filter(Boolean).join(':'),
};

export async function downloadYtAud({ vidId, videoId, canonicalTrackId, srcUrl }) {
    const id = vidId || videoId;
    if (!id && !srcUrl) {
        throw new Error('video Id or source url required');
    }
    const targetId = canonicalTrackId || `yt_${id}`;
    const url = srcUrl || `https://www.youtube.com/watch?v=${id}`;
    await fs.mkdir(CACHE_DIR, { recursive: true });
    const finalFName = `${targetId}.mp3`;
    const finalFPath = path.join(CACHE_DIR, finalFName);
    const cachedStat = await fs.stat(finalFPath).catch(() => null);
    if (cachedStat?.isFile() && cachedStat.size > 0) {
        return {
            fPath: finalFPath,
            filePath: finalFPath,
            fName: finalFName,
            fName: finalFName,
            size: cachedStat.size,
            ext: '.mp3',
            mimeType: 'audio/mpeg',
        };
    }
    const tempPrefix = `tmp_${targetId}_${Date.now()}`;
    const tempPattern = path.join(CACHE_DIR, `${tempPrefix}.%(ext)s`);
    const tempMp3Path = path.join(CACHE_DIR, `${tempPrefix}.mp3`);

    async function runDownload() {
        const args = [
            '--no-warnings',
            '--no-playlist',
            ...getYtDlpExtractorArgs(),
            '-x',
            '--audio-format', 'mp3',
            '--audio-quality', '0',
            '--max-filesize', `${MAX_FILE_SIZE}`,
            '-o', tempPattern,
            url,
        ];
        return new Promise((resolve, reject) => {
            const proc = spawn(YT_DLP_BIN, args, { env: SPAWN_ENV });
            let outputData = '';
            proc.stdout.on('data', (d) => {
                outputData += d.toString();
            });
            proc.stderr.on('data', (d) => {
                outputData += d.toString();
            });
            proc.on('close', (code) => {
                if (code === 0) {
                    resolve();
                } else {
                    console.error(`[AudioDownloader] yt-dlp failed (code ${code}):\n${outputData}`);
                    reject(new Error(`yt-dlp failed ${code}: ${outputData.slice(-500)}`));
                }
            });
            proc.on('error', (err) => {
                console.error(`[AudioDownloader] Failed to execute yt-dlp:`, err);
                reject(new Error(`Failed to execute yt-dlp: ${err.message}`));
            });
        });
    }

    try {
        await runDownload();
        const stat = await fs.stat(tempMp3Path);
        if (!stat.isFile() || stat.size === 0) {
            throw new Error('Downloaded audio file is empty or missing');
        }
        await fs.rename(tempMp3Path, finalFPath);
        return {
            fPath: finalFPath,
            filePath: finalFPath,
            fName: finalFName,
            fName: finalFName,
            size: stat.size,
            ext: '.mp3',
            mimeType: 'audio/mpeg',
        };
    } catch (err) {
        await fs.rm(tempMp3Path, { force: true }).catch(() => {});
        try {
            const files = await fs.readdir(CACHE_DIR);
            for (const f of files) {
                if (f.startsWith(tempPrefix)) {
                    await fs.rm(path.join(CACHE_DIR, f), { force: true }).catch(() => {});
                }
            }
        } catch {}
        throw err;
    }
}

export async function extractVIdMeta(vidId) {
    const url = `https://www.youtube.com/watch?v=${vidId}`;
    const args = [
        '--dump-single-json',
        '--no-warnings',
        '--skip-download',
        ...getYtDlpExtractorArgs(),
        url,
    ];
    return new Promise((resolve, reject) => {
        const proc = spawn(YT_DLP_BIN, args, { env: SPAWN_ENV });
        let stdoutData = '';
        let stderrData = '';
        proc.stdout.on('data', (d) => {
            stdoutData += d.toString();
        });
        proc.stderr.on('data', (d) => {
            stderrData += d.toString();
        });
        proc.on('close', (code) => {
            if (code !== 0) {
                return reject(new Error(`yt-dlp metadata extraction failed (code ${code}): ${stderrData.slice(-500)}`));
            }
            try {
                const info = JSON.parse(stdoutData);
                const dur = typeof info.duration === 'number' ? Math.round(info.duration) : null;
                resolve({
                    id: info.id || vidId,
                    providerTrackId: info.id || vidId,
                    title: info.title ?? null,
                    description: info.description ?? null,
                    artist: info.artist ?? info.channel ?? info.uploader ?? null,
                    dur,
                    thumbnailUrl: info.thumbnail ?? (info.thumbnails?.[0]?.url) ?? null,
                    srcUrl: `https://www.youtube.com/watch?v=${info.id || vidId}`,
                });
            } catch (err) {
                reject(new Error(`Failed to parse yt-dlp metadata JSON: ${err.message}`));
            }
        });

        proc.on('error', (err) => {
            reject(new Error(`Failed to run yt-dlp for metadata: ${err.message}`));
        });
    });
}

export async function extractPLMeta(playlistId, maxEntries = 500) {
    const url = `https://www.youtube.com/playlist?list=${playlistId}`;
    const args = [
        '--dump-single-json',
        '--flat-playlist',
        '--playlist-end', String(maxEntries),
        '--no-warnings',
        '--skip-download',
        ...getYtDlpExtractorArgs(),
        url,
    ];

    return new Promise((resolve, reject) => {
        const proc = spawn(YT_DLP_BIN, args, { env: SPAWN_ENV });

        let stdoutData = '';
        let stderrData = '';
        proc.stdout.on('data', (d) => {
            stdoutData += d.toString();
        });
        proc.stderr.on('data', (d) => {
            stderrData += d.toString();
        });
        proc.on('close', (code) => {
            if (code !== 0) {
                return reject(new Error(`yt-dlp playlist extraction failed (code ${code}): ${stderrData.slice(-500)}`));
            }
            try {
                const data = JSON.parse(stdoutData);
                const rawEntries = Array.isArray(data.entries) ? data.entries : [];
                const truncated = rawEntries.length >= maxEntries;
                const tracks = [];
                const vidIds = [];
                for (const item of rawEntries) {
                    if (!item || !item.id) continue;
                    vidIds.push(item.id);
                    const dur = typeof item.duration === 'number' ? Math.round(item.duration) : null;
                    tracks.push({
                        id: item.id,
                        providerTrackId: item.id,
                        title: item.title ?? null,
                        description: item.description ?? null,
                        artist: item.artist ?? item.channel ?? item.uploader ?? null,
                        dur,
                        thumbnailUrl: item.thumbnail ?? (item.thumbnails?.[0]?.url) ?? null,
                        srcUrl: `https://www.youtube.com/watch?v=${item.id}`,
                    });
                }

                resolve({
                    title: data.title ?? null,
                    vidIds: [...new Set(vidIds)],
                    videoIds: [...new Set(vidIds)],
                    tracks,
                    truncated,
                });
            } catch (err) {
                reject(new Error(`Failed to parse yt-dlp playlist JSON: ${err.message}`));
            }
        });
        proc.on('error', (err) => {
            reject(new Error(`Failed to run yt-dlp for playlist: ${err.message}`));
        });
    });
}

export const downloadYouTubeAudio = downloadYtAud;
export const extractVideoMetadataWithoutApi = extractVIdMeta;
export const extractPlaylistMetadataWithoutApi = extractPLMeta;
