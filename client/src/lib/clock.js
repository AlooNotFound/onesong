export function toSample({ wallSent, rtt, serverTime }) {
    return { rtt, offset: serverTime - wallSent - rtt / 2, serverTime };
}

export function pickBest(samples) {
    if (samples.length === 0) throw new Error(' pickBest needs atleast one sample');
    return samples.reduce((best, s ) => (s.rtt < best.rtt ? s : best));
}

export async function measureClock({ fetch, samples = 5, wallNow = Date.now, perfNow = () => performance.now() }) {
    const taken = [];
    for( let i = 0; i < samples; i++ ) {
        const wallSent = wallNow();
        const t0 = perfNow();
        const serverTime = await fetch();
        const rtt = perfNow() - t0;
        taken.push(toSample({ wallSent, rtt, serverTime }));
    }
    return pickBest(taken);
}