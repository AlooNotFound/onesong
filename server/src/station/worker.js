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
    if (running || stopping ) return;
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
    } catch (err) {
        console.error('Error advancing station:', err);
    } finally {
        running = false;
    }
}

async function shutdown(sig) {
    console.log(`Received ${sig}. Shutting down...`);
    stopping = true;
    while (running) {
        console.log('Waiting for current operation to finish...');
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    console.log('Shutdown complete.');
    process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

await tick();
const timer = setInterval(tick, POLL_MS);
process.on('beforeExit', () => clearInterval(timer));