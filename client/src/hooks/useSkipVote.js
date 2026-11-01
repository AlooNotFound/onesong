import { useCallback, useEffect, useState } from "react";

const pollms = 3000;
const storageKey = "onesong:listenerId";

function getListenerId() {
    try {
        const existing = localStorage.getItem(storageKey);
        if (existing && typeof existing === "string" && /^[a-zA-Z0-9]{8}$/.test(existing)) {
            return existing;
        }
        
        const id = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2, 10);
        sessionStorage.setItem(storageKey, id);
        return id;
    } catch (err) {
        return Math.random().toString(36).slice(2, 10);
    }
}

async function reqJson(url, opts = {}) {
    const res = await fetch(url, opts);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        throw new Error(data.error || `Request failed with status ${res.status}`);
    }
    return data;
}

export function useSkipVote() {
    const [listenerId] = useState(getListenerId());
    
    const stationKey = station ? station.stationKey : null;
    const [voteState, setVoteState] = useState(null);
    const [pending, setPending] = useState(false);
    const [msg, setMsg] = useState('');

    const refresh = useCallback(async () => {
        try {
            const data = await reqJson('/api/skip-vote');
            setVoteState(data);
            setMsg('');
        } catch (error) {
            setMsg('Failed to refresh vote data');
        }
    }, []);

    useEffect(() => {
        if (!stationKey) {
            setVoteState(null);
            return;
        }

        let cancelled = false;
        async function poll() {
            try {
                const data = await reqJson('/api/skip-vote');
                if (!cancelled) {
                    setVoteState(data);
                    setMsg('');
                }
            } catch (error) {
                if (!cancelled) {
                    setMsg('Failed to refresh vote data');
                }
            }
        }

        poll();
        const interval = setInterval(poll, pollms);
        return () => {
            cancelled = true;
            clearInterval(interval);
        };
    }, [stationKey, refresh]);

    const vote = useCallback(async () => {
        if (!stationKey || pending) return;

        setPending(true);
        setMsg('');

        try {
        const result = await requestJson('/api/skip-vote', {
            method: 'POST',
            headers: {
            'Content-Type': 'application/json',
            },
            cache: 'no-store',
            body: JSON.stringify({
            listenerId,
            expectedStationKey: stationKey,
            }),
        });

        setVoteState((previous) => ({ ...previous, ...result, stationKey, }));

        setMsg( result.skipped ? 'The song was skipped.' : result.duplicate ? 'You have already voted.' : 'Vote counted.',);

        await refresh();
        } catch (error) {
        setMsg( error.status === 403 ? 'Tune in before voting.' : error.status === 409 ? 'The station changed. Refreshing votes…' : error.message || 'Could not submit your vote.', );
        await refresh();
        } finally {
        setPending(false);
        }
    }, [listenerId, pending, refresh, stationKey]);

    const sameSong = voteState && stationKey === voteState.stationKey;
    return { votes: sameSong ? voteState.votes : 0, threshold: sameSong ? voteState.threshold : 2, activeListeners: sameSong   ? voteState.activeListeners   : 0, advancing: sameSong && Boolean(voteState.advancing), pending, msg, vote, };
}