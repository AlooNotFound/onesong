export function format(totalSec) {
    const sec = Number.isFinite(totalSec) ? Math.max(0, Math.floor(totalSec)) : 0;
    return `${Math.floor(sec/60)}:${String(sec%60).padStart(2, '0')}`;
}

export function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}