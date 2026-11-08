import { replenishCache, getCacheStatus } from './cacheSrv.js';
import { processStagedAssets } from './staging.js';
import { cleanPlayed, auditCacheStorage } from './cleanup.js';

const POLL_MS = 5000;
let stopping = false;
let running = false;

export async function poll() {
    if (stopping || running) return;
    running = true;
    try {
        const cleaned = await cleanPlayed();
        const audited = await auditCacheStorage();

        const staged = await processStagedAssets();
        const replenished = await replenishCache();
        const stats = await getCacheStatus();
        if (replenished.added > 0 || staged.processed > 0 || cleaned > 0 || audited > 0) {
            console.log(`cache update: replenished ${replenished.added}, staged ${staged.processed}, cleaned ${cleaned}, audited ${audited} | Active: ${stats.active}/10 (Ready: ${stats.ready}, Playing: ${stats.playing}, Downloading: ${stats.downloading})`);
        }
    } catch (error) {
        console.error('Error in poll:', error);
    } finally {
        running = false;
    }
}

async function shutdown(sig) {
    console.log(`received ${sig}; shutting down`);
    stopping = true;
    while (running) {
        await new Promise((resolve) => setTimeout(resolve, 500));
    }
    process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

console.log('audio worker started');
await poll();
const timer = setInterval(poll, POLL_MS);
process.on('beforeExit', () => clearInterval(timer));