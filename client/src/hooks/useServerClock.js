import { useCallback, useEffect, useRef, useState } from "react";
import { measureClock } from "../lib/clock";

async function fetchServerTime() {
    const res = await fetch('/api/time', { cache: 'no-store' });
    if (!res.ok) throw new Error(`Failed to fetch server time: ${res.status}`);
    const data = await res.json();
    return data.serverTime;
}

export function useServerClock() {
    const offsetRef = useRef(0);
    const [ready, setReady] = useState(false);
    const now = useCallback(() => Date.now() + offsetRef.current, []);
    useEffect(() => {
        let cancelled = false;
        async function sync() {
            try {
                const { offset } = await measureClock(fetchServerTime);
                if (cancelled) return;
                offsetRef.current = offset;
                setReady(true);
            }
        }
    }, []);

    return { now, ready };
}