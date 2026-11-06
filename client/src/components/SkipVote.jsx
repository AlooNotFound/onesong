import { useState } from "react";
import { auth } from "../firebase.js";

export default function SkipVote() {
    const [skip, setSkip] = useState({votes: 0, myVote: false});
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState(null);

    async function handleSkip() {
        if (loading) return;
        try {
            setLoading(true);
            setErr('');
            const user = auth.currentUser;
            if (!user) {
                setErr('Sign in to vote');
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
            setSkip(data);
        } catch (err) {
            setErr(err.message);
        } finally {
            setLoading(false);
        }
    } 
    return (
       <div className="skip-vote">
            <button type="button" onClick={handleSkip} disabled={loading}>
                {loading ? 'Voting...' : 'Skip track'}
            </button>
            {skip && (
                <span className="skip-vote__status">
                {skip.advanced ? 'Track skipped' : `${skip.votes}/${skip.required} votes to skip`}
                </span>
            )}
            {err && (
                <span className="skip-vote__error" role="alert">
                {err}
                </span>
            )}
    </div>
  );
}