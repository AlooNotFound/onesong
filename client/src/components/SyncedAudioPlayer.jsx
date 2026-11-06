import { useEffect, useRef, useState } from "react";
import { useStationEvents } from "../hooks/useStationEvents.js";

const POLL_MS = 2000;
const DRIFT_THRESHOLD = 1.25;

export default function SyncedPlayer() {
    const audRef = useRef(null);
    const stationRef = useRef(null);
    const activeRef = useRef(null);
    const [station, setStation] = useState(null);
    const [isEnabled, setIsEnabled] = useState(false);
    const [playbackErr, setPlaybackErr] = useState(null);
    const isEnabledRef = useRef(false);
    const { station: liveStation, connected, skipVotes } = useStationEvents();

    stationRef.current = station;

    async function fetchStation() {
        try {
            const resp = await fetch("/api/station");
            const data = await resp.json();
            if (!resp.ok) {
                throw new Error(data.error || "Failed to fetch station data");
            }
            setStation({...data.station, receivedAt: Date.now()});
        } catch (err) {
            setPlaybackErr(err.message);
        }
    }
    useEffect(() => {
        fetchStation();
        const timer = setInterval(fetchStation, POLL_MS);
        return () => clearInterval(timer);
    }, []);
    useEffect(() => {
        if (!liveStation) return;
        setStation(liveStation);
        stationRef.current = liveStation;
    }, [liveStation]);
    useEffect(() => {
        const aud = audRef.current;
        if (!aud || !station) return;
        if ( station.status !== 'playing' || !station.song?.canonicalTrackId ) {
            aud.pause();
            activeRef.current = null;
            return;
        }
        const trackId = station.song.canonicalTrackId;
        if (activeRef.current !== trackId) {
            activeRef.current = trackId;
            setPlaybackErr(null);
            aud.pause();
            aud.src = station.song.audUrl;
            aud.load();
        }

        const seekAndPlay = async () => {
            const latest = stationRef.current;
            if (!latest || latest.status !== 'playing' || latest.song?.canonicalTrackId !== trackId) return;
            const elapsed = (Date.now() - latest.receivedAt) / 1000;
            const targetPos = latest.position + elapsed;
            if (Number.isFinite(aud.duration)) {
                aud.currentTime = Math.min(targetPos, Math.max(0, aud.duration - 0.1));
            } else {
                aud.currentTime = targetPos;
            }
            isEnabledRef.current = isEnabled;
            if (isEnabled) {
                try {
                    await aud.play();
                } catch (err) {
                    setPlaybackErr(err.message);
                }
            }
        };
        aud.addEventListener('loadedmetadata', seekAndPlay);
        return () => {
            aud.removeEventListener('loadedmetadata', seekAndPlay);
        };
}, [station?.song?.canonicalTrackId, station?.status]);
async function handleTuneIn() {
    const aud = audRef.current;
    const curr = stationRef.current;
    isEnabledRef.current = true;
    setIsEnabled(true);
    setPlaybackErr('');
    const seekAndPlay = async () => {
        const latest = stationRef.current;
        if (!latest || latest.status !== 'playing') return;
        const elapsed = ( Date.now() - latest.receivedAt ) / 1000;
        const tPos = Math.max( 0, latest.position + elapsed );
        aud.currentTime = Math.min( tPos, Math.max(0, aud.duration - 0.1));
        try {
            await aud.play();
        } catch {
            setPlaybackErr('Could not start playback.');
        }
    };
    if (aud.ready >= 1) {
        await seekAndPlay();
    } else {
        aud.addEventListener( 'loadedmetadata', seekAndPlay, { once: true });
    }
}

useEffect(() => {
    const timer = setInterval(() => {
        const aud = audRef.current;
        const curr = stationRef.current;
        if (!aud || !curr || curr.status !== 'playing' || !Number.isFinite(aud.duration)) return;
        const elapsed = ( Date.now() - curr.receivedAt ) / 1000;
        const targetPos = Math.max(0, curr.position + elapsed);
        const drift = Math.abs(aud.currentTime - targetPos);
        if (drift > DRIFT_THRESHOLD) {
            aud.currentTime = Math.min(targetPos, Math.max(0, aud.duration - 0.1));
        }
    }, 1000);
    if (aud.paused && !aud.ended) {
        aud.play().catch(err => setPlaybackErr(err.message));
    }
return () => clearInterval(timer);
}, [isEnabled]);
return (
        <section className="synced-player">
            <audio ref={audRef} preload="auto"/>
            {station?.status === 'playing' ? (
                <div className="synced-player__now-playing">
                    <p>NOW PLAYING · #{station.songNumber}</p>
                    <h2>{station.song.title}</h2>
                    <p>{station.song.artist || 'Unknown artist'}</p>
                    <p>
                        {Math.floor(station.position)}s elapsed
                    </p>
                </div>
            ) : (
                <div className="synced-player__waiting">
                    <h2>Waiting for the next track</h2>
                    <p>The station is looking for ready audio.</p>
                </div>
            )}
            {!isEnabled ? (
                <button type="button" onClick={handleTuneIn} disabled={station?.status !== 'playing'}> Tune in </button>
            ) : ( <p>Listening to OneSong</p> )}
            {playbackErr && (
                <p role="alert" className="error">
                    {playbackErr}
                </p>
            )}
        </section>
    );
}