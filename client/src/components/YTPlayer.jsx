import { useSyncedPlayer } from '../hooks/useSyncedPlayer';
import { useListenerCount } from '../hooks/useListenerCount';

export default function YTPlayer({ station, nowMs }) {
    const { hostRef, enabled, status, tuneIn } = useSyncedPlayer({ station, nowMs });
    const { count: listenerCount, online: listenerCountOnline } = useListenerCount(enabled);
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
      {enabled && (
        <p className="listener-count" aria-live="polite" aria-atomic="true">
          {listenerCountOnline && listenerCount !== null
            ? `${listenerCount.toLocaleString()} listening now`
            : listenerCount === null
              ? 'Connecting to listener count...'
              : 'Listener count unavailable'}
        </p>
      )}
    </section>
  );
}