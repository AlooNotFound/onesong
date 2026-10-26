import { useCallback, useEffect, useRef, useState } from 'react';
import { loadYTApi } from '../lib/yt';
import { shouldSeek, targertPosSecs } from '../lib/drift';

const sync_interval_ms = 2500;
const playing = 1;
const paused = 2;
const buffering = 3;
const ended = 0;

function getVidId(station) {
    const id = station?.song?.id;
    return typeof id === 'string' && id.trim() ? id.trim() : null;
}

function getStationKey(station) {
    const vidId = getVidId(station);
    if (!vidId || !station?.startedAt) return null;
    return `${station.songNumber ?? 'unknown'}:${vidId}:${station.startedAt}`;
}

function errorMessage(code) {
  if (code === 2) {
    return 'Error: vid id rejected.';
  }

  if (code === 5) {
    return 'Error: player has issues.';
  }

  if (code === 100) {
    return 'Error: vid not found.';
  }

  if (code === 101 || code === 150) {
    return 'Error: embedded player not allowed.';
  }

  return `Error: (code ${String(code)}).`;
}

export function useSyncedPlayer(station, nowMs) {
    const hostRef = useRef(null);
    const playerRef = useRef(null);
    const stationRef = useRef(station);
    const nowMsRef = useRef(nowMs);
    const loadedKeyRef = useRef(null);

    const [enabled, setEnabled] = useState(false);
    const [attempt, setAttempt] = useState(0);
    const [status, setStatus] = useState('not tuned');

    stationRef.current = station;
    nowMsRef.current = nowMs;
    const tuneIn = useCallback(() => {
        setEnabled(true);
        setStatus('loading...');
        setAttempt((a) => a + 1);
    }, []);

    const  syncPllayer = useCallback((player, snapshot, timeMs, forceload = false) => {
        if (!player || !snapshot) return;
        const vidId = getVidId(snapshot);
        if (!vidId) {
            setStatus('no song');
            return;
        }
        const key = getStationKey(snapshot);
        const targetSec = targertPosSecs(snapshot, timeMs);
        if (forceload || loadedKeyRef.current !== key) {
            loadedKeyRef.current = key;
            setStatus('loading...');
            player.loadVideoById({ videoId: vidId, startSeconds: targetSec,});
            return;
        }
        let actualSec;
        try {
            actualSec = player.getCurrentTime();
        } catch (error) {
            console.error(error);
            return;
        }

        if (shouldSeek(targetSec, actualSec)) {
            player.seekTo(targetSec, true);
        }
        const state = player.getPlayerState();
        if (state === playing) {
            setStatus('playing');
        } else if (state === paused) {
            setStatus('paused');
        } else if (state === buffering) {
            setStatus('buffering');
        } else if (state === ended) {
            setStatus('ended');
        } else {
            setStatus('unknown');
        }
    }, []);

    useEffect(() => {
        if (!enabled) return undefined;
        const host = hostRef.current;
        if (!host) return undefined;
        let cancelled = false;
        let player = null;
        const mount = document.createElement('div');
        host.replaceChildren(mount);
        setStatus('loading...');

        loadYTApi().then((YT) => {
            if (cancelled) return;
            player = new YT.Player(mount, {
                width: '100%',
                height: '100%',
                playerVars: {
                    autoplay: 1,
                    controls: 1,
                    playsinline: 1,
                    rel: 0,
                    origin: window.location.origin,
                },
                events: {
                    onReady() {
                        if (cancelled) return;
                        playerRef.current = event.target;
                        const currStation = stationRef.current;
                        if (currStation) {
                            syncPllayer(player, currStation, nowMsRef.current, true);
                        } else {
                            setStatus('waiting for station...');
                        }
                    },
                    onStateChange(event) {
                        if (cancelled) return;
                        if (event.data === playing) {
                            setStatus('playing');
                        } else if (event.data === paused) {
                            setStatus('paused');
                        } else if (event.data === buffering) {
                            setStatus('buffering');
                        } else if (event.data === ended) {
                            setStatus('ended');
                        } else {
                            setStatus('unknown');
                        }
                    },
                    onError(event) {
                        if (cancelled) return;
                        const msg = errorMessage(event.data);
                        console.error(msg);
                        setStatus(msg);
                    }
                }
            })
        }).catch((error) => {
            if (!cancelled) {
                setStatus(`yt api error: ${error.message}`);
            }
        })
        return() => {
            cancelled = true;
            if (playerRef.current === player) {
                playerRef.current = null;
            }

            try {
                player?.destroy();
            } catch (error) {
                console.error('Error destroying player:', error);
            }
            loadedKeyRef.current = null;
            host.replaceChildren();
        }
    }, [enabled, attempt, syncPllayer]);

    useEffect(() => {
        if (!enabled || !station) return;
        const player = playerRef.current;
        if (!player) return;
        syncPllayer(player, stationRef.current, nowMsRef.current);
    }, [enabled, station?.song?.vidId, station?.startedAt, syncPllayer]);

    useEffect(() => {
        if (!enabled) return;
        const timer = window.setInterval(() => {
            const player = playerRef.current;
            const currStation = stationRef.current;
            if (!player || !currStation) return;
            syncPllayer(player, currStation, nowMsRef.current);
        }, 1000);

        const onVisible = () => {
            if (document.visibilityState === 'visible') {
                const player = playerRef.current;
                const currStation = stationRef.current;
                if (!player || !currStation) return;
                syncPllayer(player, currStation, nowMsRef.current);
            }
        }
        document.addEventListener('visibilitychange', onVisible);
        return () => {
            window.clearInterval(timer);
            document.removeEventListener('visibilitychange', onVisible);
        }
    }, [enabled, syncPllayer]);

    return { hostRef,enabled, status, tuneIn };
}