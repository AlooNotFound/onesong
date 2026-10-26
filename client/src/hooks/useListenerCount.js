import { useEffect, useState } from 'react';

const heartbeat = 15000;
const poll = 5000;
const storage_key = 'onesong:listener-id';
const listener_id_pattern = /^[A-Za-z0-9_-]{16,128}$/;

function createListenerId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }

    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
        const bytes = crypto.getRandomValues(new Uint8Array(24));
        return `listener_${Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')}`;
    }
    return `listener_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
}

async function readJson(resp) {
    if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}`);
    }
    return resp.json();
}

function getListenerId() {
    try {
        const existing = window.sessionStorage.getItem(storage_key);
        if (existing && listener_id_pattern.test(existing)) {
            return existing;
        }
        const id = createListenerId();
        window.sessionStorage.setItem(storage_key, id);
        return id;
    } catch {
        return createListenerId();
    }
}

async function readJson(resp) {
    if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}`);
    }
    const data = await resp.json();
    if (!Number.isInteger(data.count) || data.count < 0) {
        throw new Error('Invalid listener count');
    }
    return data;
}

export function useListenerCount(enabled) {
    const [clientId] = useState(getListenerId);
    const [state, setState] = useState({ count: null, online: false });

    useEffect(() => {
        if (!enabled) {
            setState({ count: null, online: false });
            return undefined;
        }

        let stopped = false;
        const markOffline = () => {
            if (!stopped) setState(previous => ({ ...previous, online: false }));
        };
        const applyCount = data => {
            if (!stopped) setState({ count: data.count, online: true });
        };
        const heartbeatNow = async () => {
            try {
                const response = await fetch('/api/listeners/heartbeat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    cache: 'no-store',
                    body: JSON.stringify({ clientId }),
                });
                applyCount(await readJson(response));
            } catch {
                markOffline();
            }
        };
        const refreshCount = async () => {
            try {
                const response = await fetch('/api/listeners', { cache: 'no-store' });
                applyCount(await readJson(response));
            } catch {
                markOffline();
            }
        };
        const onVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                void heartbeatNow();
                void refreshCount();
            }
        };

        void heartbeatNow();
        const heartbeatTimer = window.setInterval(() => void heartbeatNow(), heartbeat);
        const pollTimer = window.setInterval(() => void refreshCount(), poll);
        document.addEventListener('visibilitychange', onVisibilityChange);

        return () => {
            stopped = true;
            window.clearInterval(heartbeatTimer);
            window.clearInterval(pollTimer);
            document.removeEventListener('visibilitychange', onVisibilityChange);
        };
    }, [enabled, clientId]);

    return state;
}