const default_ttl = 45000;

const listener_id_pattern = /^[A-Za-z0-9_-]{16,128}$/;

export function isValidListenerId(id) {
    return (
        typeof id === 'string' &&
        listener_id_pattern.test(id)
    )
}

export function createListenerReg({
    now = Date.now(),
    ttl = default_ttl,
} = {}) {
    if (!Number.isFinite(ttl) || ttl <= 0) {
        throw new Error(`invalid ttl: ${ttl}`);
    }

    const lastSeen = new Map();

    function prune() {
        const currTime = now();
        for (const [id, timestamp] of lastSeen) {
            if (currTime - timestamp > ttl) {
                lastSeen.delete(id);
            }
        }
    }

    function heartbeat(clientId) {
        if (!isValidListenerId(clientId)) {
            throw new Error(`invalid clientId: ${clientId}`);
        }
        prune();
        lastSeen.set(clientId, now());
        return lastSeen.size;
    }

    function count() {
        prune();
        return lastSeen.size;
    }

    return { heartbeat, count };
}

export const createListenerRegistry = ({
    now = Date.now,
    ttlMs = default_ttl,
} = {}) => createListenerReg({ now, ttl: ttlMs });