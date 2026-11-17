import { useEffect, useRef, useState, useCallback } from "react";
import { useStationEvents } from "../hooks/useStationEvents.js";
import { measureClock } from "../lib/clock.js";
import { formatTime, clamp } from "../lib/format.js";
import SkipVote from "./SkipVote.jsx";

const POLL_MS = 2000;

export default function SyncedPlayer({ station: propStation, clock, onRequireLogin }) {
    const audRef = useRef(null);
    const stationRef = useRef(null);
    const activePlayKeyRef = useRef(null);
    const isEnabledRef = useRef(false);
    const clockOffsetRef = useRef(0);
    const [station, setStation] = useState(propStation || null);
    const [isEnabled, setIsEnabled] = useState(false);
    const [playbackErr, setPlaybackErr] = useState(null);
    const [syncStats, setSyncStats] = useState({ driftMs: 0, rate: 1.0 });
    const [posSec, setPosSec] = useState(0);
    const [imgFailed, setImgFailed] = useState(false);
    const { station: liveStation } = useStationEvents();
    const syncClock = useCallback(async () => {
        try {
            const { offset } = await measureClock({
                fetch: async () => {
                    const res = await fetch('/api/time', { cache: 'no-store' });
                    const data = await res.json();
                    return data.serverTime;
                },
                samples: 5,
            });
            clockOffsetRef.current = offset;
        } catch {}
    }, []);
    useEffect(() => {
        syncClock();
        const interval = setInterval(syncClock, 20000);
        return () => clearInterval(interval);
    }, [syncClock]);
    const gertSrvTime = useCallback(() => {
        if (clock?.now) return clock.now();
        return Date.now() + clockOffsetRef.current;
    }, [clock]);
    useEffect(() => {
        if (propStation) {
            setStation(propStation);
            stationRef.current = propStation;
        }
    }, [propStation]);
    useEffect(() => {
        if (liveStation) {
            setStation(liveStation);
            stationRef.current = liveStation;
        }
    }, [liveStation]);
    const fetchStation = useCallback(async (opts = {}) => {
        try {
            const url = opts.advance ? "/api/station?advance=1" : "/api/station";
            const resp = await fetch(url, { cache: "no-store" });
            const data = await resp.json();
            if (!resp.ok) return;
            const s = data.station || data;
            setStation(s);
            stationRef.current = s;
            return s;
        } catch {
            return null;
        }
    }, []);
    useEffect(() => {
        fetchStation();
        const timer = setInterval(fetchStation, POLL_MS);
        return () => clearInterval(timer);
    }, [fetchStation]);
    const getTgtSec = useCallback((st = stationRef.current) => {
        if (!st || st.status !== 'playing' || !st.startedAt) return 0;
        const serverNow = gertSrvTime();
        const elapsedSec = (serverNow - st.startedAt) / 1000;
        const dur = st.song?.dur || (st.endsAt ? (st.endsAt - st.startedAt) / 1000 : 0);
        if (dur > 0) {
            if (elapsedSec >= dur) {
                return 0;
            }
            return Math.max(0, elapsedSec);
        }
        return Math.max(0, elapsedSec);
    }, [gertSrvTime]);
    const currPlayKey = station?.status === 'playing' && station.song?.canonicalTrackId
        ? `${station.songNum || station.songNumber || 0}:${station.song.canonicalTrackId}:${station.startedAt || 0}`
        : null;
    useEffect(() => {
        const aud = audRef.current;
        if (!aud) return;
        if (!currPlayKey || station?.status !== 'playing') {
            aud.pause();
            activePlayKeyRef.current = null;
            return;
        }
        if (activePlayKeyRef.current !== currPlayKey) {
            activePlayKeyRef.current = currPlayKey;
            setPlaybackErr(null);
            setImgFailed(false);
            const trackId = station.song.canonicalTrackId;
            const audUrl = station.song.audUrl || `/api/audio/${trackId}`;
            const targetSec = getTgtSec(station);
            const currentSrcPath = aud.src ? new URL(aud.src, window.location.origin).pathname : '';
            if (currentSrcPath !== audUrl) {
                aud.src = audUrl;
                aud.load();
                const onLoaded = async () => {
                    aud.currentTime = getTgtSec(stationRef.current);
                    if (isEnabledRef.current) {
                        try {
                            await aud.play();
                        } catch (err) {
                            setPlaybackErr(err.message);
                        }
                    }
                };
                aud.addEventListener('loadedmetadata', onLoaded, { once: true });
            } else {
                aud.currentTime = targetSec;
                if (isEnabledRef.current) {
                    aud.play().catch(err => setPlaybackErr(err.message));
                }
            }
        }
    }, [currPlayKey, station, getTgtSec]);
    async function handleTuneIn() {
        const aud = audRef.current;
        if (!aud) return;
        isEnabledRef.current = true;
        setIsEnabled(true);
        setPlaybackErr(null);
        const targetSec = getTgtSec(stationRef.current);
        if (aud.readyState >= 1) {
            aud.currentTime = targetSec;
            try {
                await aud.play();
            } catch {
                setPlaybackErr('click tune in or check audio perms.');
            }
        } else {
            const onCanPlay = async () => {
                aud.currentTime = getTgtSec(stationRef.current);
                try {
                    await aud.play();
                } catch {}
            };
            aud.addEventListener('canplay', onCanPlay, { once: true });
            aud.load();
        }
    }
    function handleLeave() {
        const aud = audRef.current;
        if (aud) {
            aud.pause();
        }
        setIsEnabled(false);
        isEnabledRef.current = false;
    }
    useEffect(() => {
        const aud = audRef.current;
        if (!aud) return;
        const onEnded = async () => {
            const nextSt = await fetchStation({ advance: true });
            if (nextSt?.status === 'playing') {
                const target = getTgtSec(nextSt);
                aud.currentTime = target;
                if (isEnabledRef.current) {
                    aud.play().catch(() => {});
                }
            }
        };
        aud.addEventListener('ended', onEnded);
        return () => {
            aud.removeEventListener('ended', onEnded);
        };
    }, [fetchStation, getTgtSec]);
    useEffect(() => {
        if (!isEnabled) return;
        const syncInterval = setInterval(() => {
            const aud = audRef.current;
            const curr = stationRef.current;
            if (!aud || !curr || curr.status !== 'playing') return;
            const targetSec = getTgtSec(curr);
            const dur = curr.song?.dur || aud.duration || 0;
            const serverNow = gertSrvTime();
            if (curr.endsAt && serverNow >= curr.endsAt) {
                fetchStation({ advance: true });
                return;
            }
            if ((aud.paused || aud.ended) && dur > 0 && targetSec < dur - 0.5) {
                aud.currentTime = targetSec;
                aud.play().catch(() => {});
                return;
            }
            if (!Number.isFinite(aud.duration) || aud.paused) return;
            const actualSec = aud.currentTime;
            setPosSec(actualSec);
            const driftSec = targetSec - actualSec;
            const driftMs = Math.round(driftSec * 1000);
            let newRate = 1.0;
            if (Math.abs(driftSec) > 0.45) {
                aud.currentTime = targetSec;
                newRate = 1.0;
            } else if (driftSec > 0.025) {
                newRate = driftSec > 0.12 ? 1.08 : 1.04;
            } else if (driftSec < -0.025) {
                newRate = driftSec < -0.12 ? 0.92 : 0.96;
            } else {
                newRate = 1.0;
            }
            if (aud.playbackRate !== newRate) {
                aud.playbackRate = newRate;
            }
            setSyncStats({ driftMs, rate: newRate });
        }, 250);
        return () => clearInterval(syncInterval);
    }, [isEnabled, getTgtSec, gertSrvTime, fetchStation]);

    const dur = station?.song?.dur || 0;
    const pos = clamp(posSec, 0, dur);
    const remaining = Math.max(0, dur - pos);
    const progressPct = dur > 0 ? (pos / dur) * 100 : 0;
    const thumbUrl = !imgFailed && station?.song?.thumbnailUrl ? station.song.thumbnailUrl : null;
    if (!isEnabled) {
        return (
            <div className="big-play-container">
                <audio ref={audRef} preload="auto" playsInline />
                <button type="button"  className="big-play-btn"  onClick={handleTuneIn} disabled={station?.status !== 'playing'} aria-label="Tune In to Live Broadcast">
                    <div className="big-play-glow" />
                    <div className="big-play-icon-wrap">
                        <svg className="big-play-svg" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M8 5v14l11-7z" />
                        </svg>
                    </div>
                    <div className="big-play-meta">
                        <span className="big-play-title">Tune In Live</span>
                        <span className="big-play-subtitle">
                            {station?.status === 'playing' ? 'Listen in sync with the world' : 'Station waiting for tracks...'}
                        </span>
                    </div>
                </button>
                {playbackErr && (
                    <p role="alert" className="player-err-msg">{playbackErr}</p>
                )}
            </div>
        );
    }

    return (
        <section className="active-player-card">
            <audio ref={audRef} preload="auto" playsInline />            
            <div className="player-art-frame">
                {thumbUrl ? (
                    <img src={thumbUrl} alt={station?.song?.title || 'Album Art'} className="player-thumb-img"onError={() => setImgFailed(true)}/>
                ) : (
                    <div className="player-thumb-fallback">
                        <span className="fallback-vinyl-icon">🎵</span>
                    </div>
                )}
                <div className="player-live-badge">
                    <span className="live-badge-dot" /> LIVE
                </div>
            </div>
            <div className="player-song-meta">
                <span className="player-song-number">
                    NOW PLAYING · #{station?.songNum || station?.songNumber || 1}
                </span>
                <h2 className="player-song-title">{station?.song?.title || 'Unknown Title'}</h2>
                <p className="player-song-artist">{station?.song?.artist || 'Unknown Artist'}</p>
            </div>
            <div className="player-progress-wrap">
                <div className="progress-bar-track">
                    <div className="progress-bar-fill" style={{ width: `${progressPct}%` }} />
                </div>
                <div className="player-timestamps">
                    <span className="time-elapsed">{formatTime(pos)}</span>
                    <span className="time-remaining">next song in {formatTime(remaining)}</span>
                </div>
            </div>
            <div className="player-controls-row">
                <div className="sync-status-badge">
                    <span className="sync-dot" />
                    <span>Sync: ±{Math.abs(syncStats.driftMs)}ms {syncStats.rate !== 1.0 ? `(${syncStats.rate}x)` : '✓ locked'}</span>
                </div>
                <button type="button"  className="leave-btn" onClick={handleLeave} title="Pause and return to standby">
                    Leave / Mute
                </button>
            </div>
            <div className="player-skip-container">
                <SkipVote onRequireLogin={onRequireLogin} />
            </div>
            {playbackErr && (
                <p role="alert" className="player-err-msg">{playbackErr}</p>
            )}
        </section>
    );
}
