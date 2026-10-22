import { useSyncedPlayer } from '../hooks/useSyncedPlayer';

export default function YTPlayer({ station, nowMs }) {
    const { hostRef, enabled, status, tuneIn } = useSyncedPlayer({ station, nowMs });
    const failed = status.startsWith('Error');

    return (
    <section className="card player-card" aria-label="Tune in to OneSong">
      <h2 className="player-title">OneSong</h2>
      <div className="player" hidden={!enabled}>
        <div className="player-host" ref={hostRef}/>
      </div>
      {(!enabled || failed) && (
        <button className="tune-in" type="button" onClick={tuneIn}>
          {failed ? 'Retry player' : 'Tune in'}
        </button>
      )}
      <p className="player-status" role="status" aria-live="polite">
        {status}
      </p>
    </section>
  );
}