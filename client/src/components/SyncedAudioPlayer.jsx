import { useEffect, useRef, useState, useCallback } from "react";
import { useStationEvents } from "../hooks/useStationEvents.js";
import { measureClock } from "../lib/clock.js";

const POLL_MS = 2000;

export default function SyncedPlayer({ station: propStation, clock }) {
    const audRef = useRef(null);
    const stationRef = useRef(null);
    const activePlayKeyRef = useRef(null);
    const isEnabledRef = useRef(false);
    const clockOffsetRef = useRef(0);
    const [station, setStation] = useState(propStation || null);
    const [isEnabled, setIsEnabled] = useState(false);
    const [playbackErr, setPlaybackErr] = useState(null);
    const [syncStats, setSyncStats] = useState({ driftMs: 0, rate: 1.0 });
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
        const duration = st.song?.duration || (st.endsAt ? (st.endsAt - st.startedAt) / 1000 : 0);
        if (duration > 0) {
            if (elapsedSec >= duration) {
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
            const duration = curr.song?.duration || aud.duration || 0;
            const serverNow = gertSrvTime();
            if (curr.endsAt && serverNow >= curr.endsAt) {
                fetchStation({ advance: true });
                return;
            }
            if ((aud.paused || aud.ended) && duration > 0 && targetSec < duration - 0.5) {
                aud.currentTime = targetSec;
                aud.play().catch(() => {});
                return;
            }
            if (!Number.isFinite(aud.duration) || aud.paused) return;
            const actualSec = aud.currentTime;
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
    }, [isEnabled, getTgtSec]);

    return (
        <section className="card synced-player">
            <audio ref={audRef} preload="auto" playsInline />
            {station?.status === 'playing' && station.song ? (
                <div className="synced-player__now-playing">
                    <p className="eyebrow">NOW PLAYING · #{station.songNum || station.songNumber || 1}</p>
                    <h2 className="song-title">{station.song.title}</h2>
                    <p style={{ margin: '0 0 10px', color: 'var(--muted, #8b8b98)' }}>
                        {station.song.artist || 'Unknown artist'}
                    </p>
                    {isEnabled && (
                        <p style={{ fontSize: '0.8rem', opacity: 0.65, margin: '4px 0 12px' }}>
                            Sync: ±{Math.abs(syncStats.driftMs)}ms {syncStats.rate !== 1.0 ? `(speed ${syncStats.rate}x)` : '✓ locked'}
                        </p>
                    )}
                </div>
            ) : (
                <div className="synced-player__waiting">
                    <h2>Waiting for next song</h2>
                    <p style={{ color: 'var(--muted)' }}>station searching for ready tracks...</p>
                </div>
            )}
            {!isEnabled ? (
                <button type="button" onClick={handleTuneIn} disabled={station?.status !== 'playing'}style={{ background: 'var(--accent, #ff4d6d)', color: '#fff', border: 'none', padding: '12px 24px', borderRadius: 8, fontWeight: 600, cursor: 'pointer', fontSize: '1rem', width: '100%', }}>
                    Tune In Live
                </button>
            ) : (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: '#4ade80', fontWeight: 600, fontSize: '0.9rem' }}>
                        Live synchronized
                    </span>
                    <button type="button" onClick={() => { if (audRef.current) audRef.current.pause(); setIsEnabled(false); isEnabledRef.current = false; }} style={{ background: 'transparent', border: '1px solid #444', color: '#bbb', padding: '4px 10px', borderRadius: 6, fontSize: '0.8rem', cursor: 'pointer' }}>
                        Mute / Leave
                    </button>
                </div>
            )}
            {playbackErr && (
                <p role="alert" className="profile-setup__error" style={{ marginTop: 8 }}>
                    {playbackErr}
                </p>
            )}
        </section>
    );
}
