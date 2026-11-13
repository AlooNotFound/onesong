import { useState, useEffect } from "react";
import { auth } from "../lib/firebase.js";
import { onAuthStateChanged } from "firebase/auth";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getSub(subId, token) {
    const resp = await fetch(`/api/submissions/${subId}`, {
        headers: {
            Authorization: `Bearer ${token}`,
        },
    });
    const data = await resp.json();
    if (!resp.ok) {
        throw new Error(data.error || 'Failed to fetch submission.');
    }
    return data.sub || data.submission;
}

export default function SubmitSrc() {
    const [url, setUrl] = useState('');
    const [status, setStatus] = useState('idle');
    const [message, setMessage] = useState('');
    const [sub, setSub] = useState(null);
    const [currentUser, setCurrentUser] = useState(auth.currentUser);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            setCurrentUser(user);
        });
        return unsubscribe;
    }, []);

    async function handleSubmit(e) {
        e.preventDefault();
        if (!url.trim() || status === 'loading') return;
        const user = auth.currentUser;
        if (!user) {
            setStatus('error');
            setMessage('You must be logged in to submit a source. Please sign in above.');
            return;
        }
        setStatus('loading');
        setMessage('');
        setSub(null);
        try {
            const token = await user.getIdToken();
            const resp = await fetch('/api/submissions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({ url: url.trim() }),
            });
            const data = await resp.json();
            if (!resp.ok) {
                throw new Error(data.error || 'Failed to submit source.');
            }
            const created = data.sub || data.submission;
            setSub(created);
            setMessage('Submission queued. Processing...');
            setUrl('');

            for (let i = 0; i < 60; i++) {
                await sleep(2000);
                const curr = await getSub(created.id, token);
                setSub(curr);
                if (curr.status === 'completed') {
                    setStatus('success');
                    setMessage(`Successfully added ${curr.itemCount || 1} tracks to the mix.`);
                    return;
                }
                if (curr.status === 'failed') {
                    throw new Error(curr.error || 'Failed to process submission.');
                }
                setMessage(
                    curr.status === 'processing' ? 'Importing tracks...' : 'Waiting for ingestion...'
                );
            }
            setStatus('pending');
            setMessage('Submission is still processing. Check back later.');
        } catch (err) {
            setStatus('error');
            setMessage(err.message);
        }
    }

    return (
        <section className="card submit-src">
            <div className="submit-src_header">
                <h2>Put smtg in the mix</h2>
                <p>Submit a YouTube video or playlist to be added to the mix.</p>
            </div>
            {!currentUser && (
                <p className="profile-setup__error" style={{ marginBottom: 12 }}>
                    Please sign in above to submit songs.
                </p>
            )}
            <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input 
                    type="url" 
                    value={url} 
                    onChange={(e) => setUrl(e.target.value)} 
                    placeholder="Enter YouTube URL (e.g. https://www.youtube.com/watch?v=...)" 
                    required 
                    disabled={status === 'loading' || !currentUser} 
                    style={{ flex: 1, minWidth: 220 }}
                />
                <button type="submit" disabled={status === 'loading' || !currentUser}>
                    {status === 'loading' ? 'Submitting...' : 'Submit'}
                </button>
            </form>
            {message && (
                <p className={`submit-source__message submit-source__message--${status}`} role="status" style={{ marginTop: 10 }}>
                    {message}
                </p>
            )}
            {sub && (
                <p className="submit-source__message" style={{ marginTop: 6, opacity: 0.85 }}>
                    Status: <strong>{sub.status}</strong>
                    {sub.itemCount > 0 && ` · ${sub.itemCount} tracks`}
                </p>
            )}
            {sub?.truncated && (
                <p className="submit-source__message submit-source__message--warning" role="status">
                    Note: The submission was truncated due to a large number of tracks.
                </p>
            )}
        </section>
    );
}
