export function toSample({ wallSent, rtt, serverTime }) {
    return { rtt, offset: serverTime - wallSent - rtt / 2, serverTime };
}

export function pickBest(samples) {
    if (samples.length === 0) throw new Error(' pickBest needs atleast one sample');
    return samples.reduce((best, s ) => (s.rtt < best.rtt ? s : best));
}

export async function measureClock(options = {}) {
    const opts = typeof options === 'function' ? { fetch: options } : (options || {});
    const fetchFn = opts.fetch || opts.fetchFn;
    if (typeof fetchFn !== 'function') {
        throw new TypeError('measureClock requires a fetch function');
    }
    const samples = opts.samples ?? 5;
    const wallNow = opts.wallNow ?? Date.now;
    const perfNow = opts.perfNow ?? (() => performance.now());
    const taken = [];
    for( let i = 0; i < samples; i++ ) {
        const wallSent = wallNow();
        const t0 = perfNow();
        const serverTime = await fetchFn();
        const rtt = perfNow() - t0;
        taken.push(toSample({ wallSent, rtt, serverTime }));
    }
    return pickBest(taken);
}