import { useState, useEffect } from "react";
import { auth } from "../lib/firebase.js";

export default function SkipVote({ onRequireLogin, songNum, liveSkipVotes }) {
    const [skip, setSkip] = useState({ votes: 0, required: 1, voted: false, advanced: false });
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState(null);

    useEffect(() => {
        let cancelled = false;
        async function fetchStatus() {
            try {
                const user = auth.currentUser;
                const headers = {};
                if (user) {
                    try {
                        const token = await user.getIdToken();
                        headers.Authorization = `Bearer ${token}`;
                    } catch {}
                }
                const resp = await fetch('/api/skip', { headers });
                if (!resp.ok) return;
                const data = await resp.json();
                if (!cancelled && data) {
                    setSkip((prev) => ({
                        ...prev,
                        ...data,
                        required: data.required || data.req || 1,
                    }));
                }
            } catch {}
        }
        fetchStatus();
        return () => {
            cancelled = true;
        };
    }, [songNum]);

    useEffect(() => {
        if (liveSkipVotes) {
            setSkip((prev) => ({
                ...prev,
                ...liveSkipVotes,
                required: liveSkipVotes.required || liveSkipVotes.req || prev.required || 1,
            }));
        }
    }, [liveSkipVotes]);

    async function handleSkip() {
        if (loading) return;
        try {
            setLoading(true);
            setErr('');
            const user = auth.currentUser;
            if (!user) {
                setErr('Sign in to vote');
                onRequireLogin?.();
                return;
            }
            const token = await user.getIdToken();
            const resp = await fetch('/api/skip', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });
            const data = await resp.json();
            if (!resp.ok) {
                throw new Error(data.error || 'Failed to cast skip vote');
            }
            const skipData = data.skip || data;
            setSkip((prev) => ({
                ...prev,
                ...skipData,
                required: skipData.required || skipData.req || prev.required || 1,
            }));
        } catch (err) {
            setErr(err.message);
        } finally {
            setLoading(false);
        }
    } 

    const reqCount = skip?.required || skip?.req || 1;
    const voteCount = skip?.votes || 0;

    return (
       <div className="skip-vote">
            <button type="button" onClick={handleSkip} disabled={loading || skip?.voted || skip?.advanced}>
                {loading ? 'Voting...' : (skip?.advanced ? 'Skipped' : (skip?.voted ? 'Voted to skip' : 'Skip track'))}
            </button>
            <span className="skip-vote__status">
                {skip?.advanced ? 'Track skipped' : `${voteCount}/${reqCount} votes to skip`}
            </span>
            {err && (
                <span className="skip-vote__error" role="alert">
                    {err}
                </span>
            )}
        </div>
    );
}