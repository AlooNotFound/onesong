import {useState, useEffect} from 'react';

const retry_ms = 3000;
const min_delay_ms = 500;
const end_margin_ms = 250;

export function useStation(now, enabled) {
    const [station, setStation] = useState(null);
    const [err, setErr] = useState(null);
    
    useEffect(() => {
        if(!enabled) return undefined;
        let cancelled = false;
        let timer;

        async function load() {
            clearTimeout(timer);
            try {
                const res = await fetch('/api/now', { cache: 'no-store' });
                if (!res.ok) throw new Error(`Failed to fetch station: ${res.status}`);
                const raw = await res.json();
                if (cancelled) return;
                const snap = raw.station || raw;
                setStation(snap);
                setErr(null);
                const delay = Math.max((snap.endsAt || 0) - now() + end_margin_ms, min_delay_ms);
                timer = setTimeout(load, delay);
            } catch (e) {
                if (cancelled) return;
                setErr(e);
                timer = setTimeout(load, retry_ms);
            }
        }
        load();
        const onVisible = () => {
            if (document.visibilityState === 'visible') {
                load();
            }
        }
        document.addEventListener('visibilitychange', onVisible);

        return () => {
            cancelled = true;
            clearTimeout(timer);
            document.removeEventListener('visibilitychange', onVisible);
        };
    }, [now, enabled]);
    return { station, error: err };
}