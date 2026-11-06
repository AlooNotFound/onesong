import { useEffect, useState } from 'react';

export function useStationEvents() {
    const [station, setStation] = useState(null);
    const [history, setHistory] = useState([]);
    const [trackVotes, setTrackVotes] = useState({});
    const [skipVotes, setSkipVotes] = useState(null);
    const [connected, setConnected] = useState(false);

    useEffect(() => {
        let cancelled = false;
        let src = null;
        let fallbackTimer = null;
        let reconnTimer = null;
        let reconnAttempts = 0;

        async function loadSnap() {
            try {
                const [stationResp, historyResp] = await Promise.all([
                    fetch('/api/station'),
                    fetch('/api/history'),
                ]);
                if (!stationResp.ok) {
                    throw new Error('Failed to fetch station data');
                }
                if (!historyResp.ok) {
                    throw new Error('Failed to fetch history data');
                }
                const stationData = await stationResp.json();
                const historyData = await historyResp.json();
                if (cancelled) return;
                setStation(stationData);
                setHistory(historyData);
            } catch (err) {
                console.error('Error loading station snapshot:', err);
            }
        }
        function connect() {
            if (cancelled) return;
            src = new EventSource('/api/events');
            src.onopen = () => {
                if (cancelled) return;
                reconnAttempts = 0;
                setConnected(true);
                if (fallbackTimer) {
                    clearTimeout(fallbackTimer);
                    fallbackTimer = null;
                }
            };
            src.addEventListener('station', (e) => {
                try {
                    setStation(JSON.parse(e.data));
                } catch (err) {
                    console.error('Error parsing station event data:', err);
                }
            });
            src.addEventListener('history', (e) => {
                try {
                    const data = JSON.parse(e.data);
                    setTrackVotes((curr) => ({
                        ...curr,
                        [data.canonicalTrackId]: {
                            likes: data.likes,
                            dislikes: data.dislikes,
                        },
                    }));
                } catch (err) {
                    console.error('Error parsing history event data:', err);
                }
            });
            src.addEventListener('skip-vote', (event) => {
                try {
                    setSkipVotes(JSON.parse(event.data));
                } catch (err) {
                    console.error('Error parsing skip-vote event data:', err);
                }
            });
            src.onerror = () => {
                if (cancelled) return;
                setConnected(false);
                if (src) {
                    src.close();
                    src = null;
                }
                if (!fallbackTimer) {
                    fallbackTimer = setTimeout(() => {
                        if (cancelled) return;
                        loadSnap();
                    }, 5000);
                }
                if (!reconnTimer) {
                    const delay = Math.min(1000 * 2 ** reconnAttempts, 30000);
                    reconnTimer = setTimeout(() => {
                        reconnTimer = null;
                        reconnAttempts += 1;
                        if (cancelled) return;
                        connect();
                    }, delay);
                }
            }
        }
        loadSnap();
        connect();
        return () => {
            cancelled = true;
            if (src) {
                src.close();
            }
            if (fallbackTimer) {
                clearTimeout(fallbackTimer);
            }
            if (reconnTimer) {
                clearTimeout(reconnTimer);
            }
        };
    }, []);
        return { station, history, trackVotes, skipVotes, connected };
}
