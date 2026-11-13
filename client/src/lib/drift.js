export const seek_th_secs = 1.25;

export function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

export function targertPosSecs(station, nowMs) {
    const startedAt = station?.startedAt ?? 0;
    const durSec = station?.song?.duration ?? 0;

    if (!Number.isFinite(startedAt) || !Number.isFinite(durSec) || !Number.isFinite(nowMs)) {
        return 0;
    }
    return clamp((nowMs - startedAt) / 1000, 0, durSec);
}

export function driftSecs(targetSec, actualSec) {
    if (!Number.isFinite(targetSec) || !Number.isFinite(actualSec)) {
        return null;
    }
    return targetSec - actualSec;
}

export function shouldSeek(targetSec, actualSec, threshold = seek_th_secs) {
    if (!Number.isFinite(targetSec) || !Number.isFinite(actualSec) || !Number.isFinite(threshold)) {
        return false;
    }
    return Math.abs(targetSec - actualSec) >= threshold;
}