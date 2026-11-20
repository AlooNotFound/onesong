import { useEffect, useRef, useState, useCallback } from "react";
import { useStationEvents } from "../hooks/useStationEvents.js";
import { useListenerCount } from "../hooks/useListenerCount.js";
import { measureClock } from "../lib/clock.js";
import { formatTime, clamp } from "../lib/format.js";
import SkipVote from "./SkipVote.jsx";
import { X } from "lucide-react";

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
    const [posSec, setPosSec] = useState(0);
    const [imgFailed, setImgFailed] = useState(false);
    const [lyrics, setLyrics] = useState(null);
    const [showLyrics, setShowLyrics] = useState(false);
    const activeLineRef = useRef(null);
    const lyricsScrollRef = useRef(null);
    const { count: listenerCount } = useListenerCount(isEnabled);
    const { station: liveStation, skipVotes } = useStationEvents();
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
        aud.preservesPitch = false;
        aud.webkitPreservesPitch = false;
        aud.mozPreservesPitch = false;
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
        aud.preservesPitch = false;
        aud.webkitPreservesPitch = false;
        aud.mozPreservesPitch = false;
        isEnabledRef.current = true;
        setIsEnabled(true);
        setPlaybackErr(null);
        const trackId = stationRef.current?.song?.canonicalTrackId;
        const audUrl = stationRef.current?.song?.audUrl || (trackId ? `/api/audio/${trackId}` : '');
        if (audUrl) {
            const currentSrcPath = aud.src ? new URL(aud.src, window.location.origin).pathname : '';
            if (currentSrcPath !== audUrl) {
                aud.src = audUrl;
            }
        }
        const targetSec = getTgtSec(stationRef.current);
        if (aud.readyState >= 1) {
            if (Math.abs(aud.currentTime - targetSec) > 0.5) {
                aud.currentTime = targetSec;
            }
            try {
                await aud.play();
            } catch {
                setPlaybackErr('click tune in or check audio perms.');
            }
        } else {
            const onCanPlay = async () => {
                const cur = getTgtSec(stationRef.current);
                if (cur > 0.5) {
                    aud.currentTime = cur;
                }
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
            if (aud.paused && isEnabledRef.current && dur > 0 && targetSec < dur - 0.5) {
                if (Math.abs(aud.currentTime - targetSec) > 1.0) {
                    aud.currentTime = targetSec;
                }
                aud.play().catch(() => {});
                return;
            }
            if (!Number.isFinite(aud.duration) || aud.paused) return;
            const actualSec = aud.currentTime;
            setPosSec(actualSec);
            const driftSec = targetSec - actualSec;
            const driftMs = Math.round(driftSec * 1000);
            let nr = 1.0;
            const currRate = aud.playbackRate;
            if (Math.abs(driftSec) > 1.5) {
                aud.currentTime = targetSec;
                nr = 1.0;
            } else if (currRate === 1.0) {
                if (driftSec > 0.08) {
                    nr = driftSec > 0.3 ? 1.04 : 1.02;
                } else if (driftSec < -0.08) {
                    nr = driftSec < -0.3 ? 0.96 : 0.98;
                } else {
                    nr = 1.0;
                }
            } else {
                if (Math.abs(driftSec) <= 0.02) {
                    nr = 1.0;
                } else if (driftSec > 0.02) {
                    nr = driftSec > 0.3 ? 1.04 : 1.02;
                } else if (driftSec < -0.02) {
                    nr = driftSec < -0.3 ? 0.96 : 0.98;
                } else {
                    nr = 1.0;
                }
            }
            if (aud.preservesPitch !== false) {
                aud.preservesPitch = false;
                aud.webkitPreservesPitch = false;
                aud.mozPreservesPitch = false;
            }
            if (aud.playbackRate !== nr) {
                aud.playbackRate = nr;
            }
        }, 250);
        return () => clearInterval(syncInterval);
    }, [isEnabled, getTgtSec, gertSrvTime, fetchStation]);

    const dur = station?.song?.dur || 0;
    const pos = clamp(posSec, 0, dur);
    const remaining = Math.max(0, dur - pos);
    const progressPct = dur > 0 ? (pos / dur) * 100 : 0;
    const thumbUrl = !imgFailed && station?.song?.thumbnailUrl ? station.song.thumbnailUrl : null;
    const activeListeners = listenerCount ?? 1;

    useEffect(() => {
        let cancelled = false;
        const song = station?.song;
        if (!song || station?.status !== 'playing') {
            setLyrics(null);
            setShowLyrics(false);
            return;
        }
        const params = new URLSearchParams();
        if (song.canonicalTrackId) params.set('canonicalTrackId', song.canonicalTrackId);
        if (song.title) params.set('title', song.title);
        if (song.artist) params.set('artist', song.artist);
        if (song.dur) params.set('dur', String(song.dur));
        fetch(`/api/lyrics?${params}`).then(res => res.ok ? res.json() : null).then(data => {
                if (cancelled) return;
                if (data && data.hasLyrics && Array.isArray(data.lines) && data.lines.length > 0) {
                    setLyrics(data);
                } else {
                    setLyrics(null);
                    setShowLyrics(false);
                }
            }).catch(() => {
                if (!cancelled) {
                    setLyrics(null);
                    setShowLyrics(false);
                }
            });
        return () => {
            cancelled = true;
        };
    }, [station?.song?.canonicalTrackId, station?.song?.title, station?.song?.artist]);
    const [userOffset, setUserOffset] = useState(0);
    const currTrackId = station?.song?.canonicalTrackId;
    useEffect(() => {
        if (!currTrackId) {
            setUserOffset(0);
            return;
        }
        const saved = localStorage.getItem(`onesong_lyrics_offset_${currTrackId}`);
        setUserOffset(saved ? parseFloat(saved) || 0 : 0);
    }, [currTrackId]);
    const handleNudgeOffset = (delta) => {
        setUserOffset((prev) => {
            const next = Math.round((prev + delta) * 10) / 10;
            if (currTrackId) {
                if (next === 0) {
                    localStorage.removeItem(`onesong_lyrics_offset_${currTrackId}`);
                } else {
                    localStorage.setItem(`onesong_lyrics_offset_${currTrackId}`, String(next));
                }
            }
            return next;
        });
    };
    const effectivePos = Math.max(0, pos + userOffset);
    const activeIdx = lyrics?.lines?.reduce((currIdx, line, idx) => {
        return line.time <= effectivePos ? idx : currIdx;
    }, -1) ?? -1;
    useEffect(() => {
        if (!showLyrics || activeIdx < 0 || !activeLineRef.current) return;
        activeLineRef.current.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
        });
    }, [activeIdx, showLyrics]);
    useEffect(() => {
        if (!showLyrics) return;
        const onKeyDown = (e) => {
            if (e.key === 'Escape') setShowLyrics(false);
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [showLyrics]);
    return (
        <>
            <audio ref={audRef} preload="auto" playsInline />
            {!isEnabled ? (
                <div className="big-play-container">
                    <button type="button" className="big-play-btn" onClick={handleTuneIn} disabled={station?.status !== 'playing'} aria-label="Tune In to Live Broadcast">
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
            ) : (
                <section className="active-player-card">
                    <div className="player-art-frame">
                        {thumbUrl ? (
                            <img src={thumbUrl} alt={station?.song?.title || 'Album Art'} className="player-thumb-img" onError={() => setImgFailed(true)}/>
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
                            <span>{activeListeners} ppl listening</span>
                        </div>
                        {lyrics?.hasLyrics && (
                            <button
                                type="button"
                                className="lyrics-toggle-btn"
                                onClick={() => setShowLyrics(true)}
                                title="Open fullscreen lyrics"
                            >
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M9 18V5l12-2v13" />
                                    <circle cx="6" cy="18" r="3" />
                                    <circle cx="18" cy="16" r="3" />
                                </svg>
                                Lyrics
                            </button>
                        )}
                        <button type="button" className="leave-btn" onClick={handleLeave} title="pause and return to standby">
                            Leave / Mute
                        </button>
                    </div>
                    <div className="player-skip-container">
                        <SkipVote onRequireLogin={onRequireLogin} songNum={station?.songNum} liveSkipVotes={skipVotes} />
                    </div>
                    {playbackErr && (
                        <p role="alert" className="player-err-msg">{playbackErr}</p>
                    )}
                </section>
            )}

            {showLyrics && lyrics?.hasLyrics && (
                <div className="lyrics-fullscreen-overlay">
                    <div className="lyrics-fullscreen-header">
                        <button type="button" className="lyrics-fullscreen-close-btn" onClick={() => setShowLyrics(false)} title="Close lyrics" aria-label="Close lyrics" >
                            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="6 9 12 15 18 9" />
                            </svg>
                        </button>
                        <div className="lyrics-fullscreen-meta">
                            <span className="lyrics-fullscreen-title">{station?.song?.title || 'Unknown Title'}</span>
                            <span className="lyrics-fullscreen-artist">{station?.song?.artist || 'Unknown Artist'}</span>
                        </div>
                        <div className="lyrics-fullscreen-spacer" />
                    </div>
                    <div className="lyrics-fullscreen-content" ref={lyricsScrollRef}>
                        <div className="lyrics-fullscreen-pad" />
                        {lyrics.lines.map((line, idx) => {
                            const isCurrent = idx === activeIdx;
                            const isPast = idx < activeIdx;
                            return (
                                <p
                                    key={idx}
                                    ref={isCurrent ? activeLineRef : null}
                                    className={`lyric-line ${isCurrent ? 'lyric-line--active' : isPast ? 'lyric-line--past' : 'lyric-line--future'}`}
                                >
                                    {line.text}
                                </p>
                            );
                        })}
                        <div className="lyrics-fullscreen-pad" />
                    </div>

                    <div className="lyrics-fullscreen-footer">
                        <div className="player-progress-wrap">
                            <div className="progress-bar-track">
                                <div className="progress-bar-fill" style={{ width: `${progressPct}%` }} />
                            </div>
                            <div className="player-timestamps">
                                <span className="time-elapsed">{formatTime(pos)}</span>
                                <span className="time-remaining">next song in {formatTime(remaining)}</span>
                            </div>
                        </div>
                        <div className="lyrics-fullscreen-controls">
                            <div className="sync-status-badge">
                                <span className="sync-dot" />
                                <span>{activeListeners} ppl listening</span>
                            </div>
                            <div className="lyrics-offset-controls">
                                <button type="button" className="lyrics-offset-btn" onClick={() => handleNudgeOffset(-0.5)} title="Delay lyrics 0.5s">-0.5s</button>
                                <button type="button" className="lyrics-offset-label" onClick={() => handleNudgeOffset(-userOffset)} title="Reset offset">
                                    {userOffset !== 0 ? `${userOffset > 0 ? '+' : ''}${userOffset}s` : 'Timing'}
                                </button>
                                <button type="button" className="lyrics-offset-btn" onClick={() => handleNudgeOffset(0.5)} title="Advance lyrics 0.5s">+0.5s</button>
                            </div>
                            <button
                                type="button"
                                className="lyrics-fullscreen-exit-btn"
                                onClick={() => setShowLyrics(false)}
                            >
                                Back to player
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
