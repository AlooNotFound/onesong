import { advStation } from "./service.js";
import { getPlayHistory } from "../history/service.js";
import { publishEvent } from "../realtime/events.js";
const POLL_MS = 1000;

let prevSig = null;
let running = false;
let stopping = false;

function getSig(station) {
    return JSON.stringify({
        status: station?.status,
        songNum: station?.songNum,
        canonicalTrackId: station?.song?.canonicalTrackId ?? null,
        startedAt: station?.startedAt ?? null,
        endsAt: station?.endsAt ?? null
    });
}

async function tick() {
    if (running || stopping ) return null;
    running = true;
    try {
        const station = await advStation();
        const sig = getSig(station);
        if (sig !== prevSig) {
            prevSig = sig;
            const history = await getPlayHistory(20);
            publishEvent('station', station);
            publishEvent('history', history);
        }
        if (station.status === 'playing') {
            console.log(`Now playing: ${station.song.title} by ${station.song.artist}`);
        }
        return station;
    } catch (err) {
        console.error('Error advancing station:', err?.message || err);
        return null;
    } finally {
        running = false;
    }
}

let timer = null;

function scheduleNext(station) {
    if (stopping) return;
    let delay = 10000;
    if (station?.status === 'playing' && station?.endsAt) {
        const remaining = station.endsAt - Date.now();
        if (remaining > 5000) {
            delay = Math.min(remaining - 2000, 15000);
        } else {
            delay = Math.max(1000, remaining);
        }
    } else {
        delay = 10000;
    }
    clearTimeout(timer);
    timer = setTimeout(async () => {
        const nextStation = await tick();
        scheduleNext(nextStation);
    }, delay);
}

async function shutdown(sig) {
    console.log(`Received ${sig}. Shutting down...`);
    stopping = true;
    clearTimeout(timer);
    while (running) {
        console.log('Waiting for current operation to finish...');
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    console.log('Shutdown complete.');
    process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

const initial = await tick();
scheduleNext(initial);
process.on('beforeExit', () => clearTimeout(timer));