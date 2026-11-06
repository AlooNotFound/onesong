import { advStation } from "./service";
const POLL_MS = 1000;

let running = false;
let stopping = false;

async function tick() {
    if (running || stopping ) return;
    running = true;
    try {
        const station = await advStation();
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