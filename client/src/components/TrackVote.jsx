import { useEffect, useState } from "react";
import { auth } from "../firebase.js";

export default function TrackVote({ canonicalTrackId}) {
    const [vote, setVote] = useState({likes: 0, dislikes: 0, myVote: 0});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState(null);

    useEffect(() => {
        let cancelled = false;
        async function loadVote() {
            try {
                const user = auth.currentUser;
                if (!user) {
                    setErr('Sign in to vote');
                    return;
                }
                const token = await user.getIdToken();
                const resp = await fetch(`/api/tracks/${encodeURIComponent(canonicalTrackId)}/vote`,
                    {
                        headers: {
                        Authorization: `Bearer ${token}`,
                        },
                    });
                const data = await resp.json();
                if (!resp.ok) {
                    throw new Error(data.error || 'Failed to load vote');
                }
                if (!cancelled) {
                    setVote(data.vote);
                    setErr(null);
                }
            } catch (err) {
                if (!cancelled) {
                    setErr(err.message);
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        }
        loadVote();
        return () => {
            cancelled = true;
        };
    }, [canonicalTrackId])

    async function handleVote(vote) {
        if (saving) return;
        try {
            setSaving(true);
            setErr(null);
            const user = auth.currentUser;
            if (!user) {
                setErr('Sign in to vote');
                return;
            }
            const token = await user.getIdToken();
            const resp = await fetch(`/api/tracks/${encodeURIComponent(canonicalTrackId)}/vote`,
                {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ value }),
                }
            );
            const data = await resp.json();
            if (!resp.ok) {
                throw new Error(data.error || 'Failed to set vote');
            }
            setVote(data.vote);
        } catch (err) {
            setErr(err.message);
        } finally {
            setSaving(false);
        }
    }
    if (loading) {
        return <div className="track-vote">Loading...</div>;
    }

    return (
        <div className="track-vote">
            <button
                type="button"
                className={vote.myVote === 1 ? 'active' : ''}
                disabled={saving}
                aria-label="Like track"
                aria-pressed={vote.myVote === 1}
                onClick={() => handleVote(vote.myVote === 1 ? 0 : 1)}
            >
                ▲ <span>{vote.likes}</span>
            </button>
            <button
                type="button"
                className={vote.myVote === -1 ? 'active' : ''}
                disabled={saving}
                aria-label="Dislike track"
                aria-pressed={vote.myVote === -1}
                onClick={() => handleVote(vote.myVote === -1 ? 0 : -1)}
            >
                ▼ <span>{vote.dislikes}</span>
            </button>
            {err && (
                <span className="track-vote__error" role="alert">
                {err}
                </span>
            )}
        </div>
    );
}