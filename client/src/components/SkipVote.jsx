import { useSkipVote } from "../hooks/useSkipVote.js";

export default function SkipVote({ station }) {
    const { votes, threshold, activeListeners, hasVoted, advancing, vote, pending, msg } = useSkipVote(station);
    if (!station) return null;

    const progress = Math.min(100, Math.round((votes / threshold) * 100));

    return (
        <section className= "card skip-card">
            <div className="skip-heading">
                <div>
                    <p className="eyebrow">Community control</p>
                    <h2 className="skip-title">Skip this song?</h2>
                </div>
                <span className="skip-count">{votes} of {threshold} votes</span>
            </div>
            <div className="skip-progress" role="progressbar" aria-valuenow={Math.min(votes, threshold)} aria-valuemin="0" aria-valuemax={threshold}>
                <div className="skip-progress-fill" style={{ width: `${progress}%` }}></div>
            </div>
            <p className="skip-desc">{activeListeners} active listeners. A majority is needed to skip.</p>
            <button className="skip-btn" type="button" disabled={pending || advancing || hasVoted} onClick={vote}>
                {advancing ? "Skipping..." : "Skip"}
            </button>
            <p className="skip-msg" role="status" aria-live="polite">{msg}</p>
        </section>
    );
}