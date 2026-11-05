import {useState} from "react";
import { auth } from "../lib/firebase";

export default function SubmitSrc() {
    const [url, setUrl] = useState('');
    const [status, setStatus] = useState('idle');
    const [message, setMessage] = useState('');
    const [sub, setSub] = useState(null);

    async function handleSubmit(e) {
        e.preventDefault();
        if (!url.trim() || status === 'loading') return;
        const user = auth.currentUser;
        if (!user) {
            setStatus('error');
            setMessage('You must be logged in to submit a source.');
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
                body: JSON.stringify({ url }),
            });
            const data = await resp.json();
            if (!resp.ok) {
                throw new Error(data.error || 'Failed to submit source.');
            }
            setSub(data);
        } catch (error) {
            setStatus('error');
            setMessage(error.message);
        } finally {
            setStatus('idle');
        }
    }
    return (
        <section className="submit-src">
            <div className="submit-src_header">
                <h2>Put smtg in the mix</h2>
                <p>Submit a YouTube video or playlist to be added to the mix.</p>
            </div>
            <form onSubmit={handleSubmit}>
                <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Enter YouTube URL" required disabled={status === 'loading'} />
                <button type="submit" disabled={status === 'loading'}>Submit</button>
                {status === 'loading' && <p>Submitting...</p>}
                {status === 'error' && <p className="error">{message}</p>}
            </form>
            {message && (
                <p className={`submit-source__message submit-source__message--${status}`} role="status">
                    {message}
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