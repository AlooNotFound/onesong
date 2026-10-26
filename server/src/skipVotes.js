const default_ttl_ms = 45000;

export function createSkipSrv({
    now = Date.now,
    getStation,
    getActiveListenerCount,
    isListenerActive,
    advanceStation,
    ttl = default_ttl_ms,
}) {
    if ( typeof getStation !== 'function' || typeof getActiveListenerCount !== 'function' || typeof isListenerActive !== 'function' || typeof advanceStation !== 'function') {
        throw new Error('Missing required params');
    }
    if (!Number.isFinite(ttl) || ttl <= 0) {
        throw new Error(`invalid ttl: ${ttl}`);
    }
    let stationKey = null;
    let votes = new Set();
    let advancing = false;

    function getKey(station) {
        if (!station || !station.key) return null;
        return `${station.songNumber}:${station.startedAt}`;
    }

    function syncStation() {
        const station = getStation();
        const key = getKey(station);

        if (key !== stationKey) {
            stationKey = key;
            votes = new Set();
            advancing = false;
        }

        return station;
    }

    function getThreshold() {
        const count = getActiveListenerCount();
        if (!Number.isInteger(count) || count < 0) {
            throw new Error(`invalid count: ${count}`);
        }
        return Math.max(2, Math.ceil(count / 2));
    }

    function snapshot() {
        const station = syncStation();
        if (!station) {
            return { votes: 0, threshold: 2, activeListeners: 0, hasVoted: false, advancing: false };
        }

        const activeListeners = getActiveListenerCount();
        return { votes: votes.size, threshold: getThreshold(), activeListeners, hasVoted: false, advancing };
    }

    async function submitVote(clientId, expectedKey) {
        const station = syncStation();
        if (!station) {
            throw new Error('No active station');
        }

        const currKey = getKey(station);
        if (currKey !== expectedKey) {
            return { success: false, reason: 'station changed', stationKey: currKey };
        }

        if (!isListenerActive(clientId)) {
            return { success: false, reason: 'listener not active' };
        }

        if (votes.has(clientId)) {
            return { success: false, reason: 'already voted' , ...snapshot()};
        }

        if (advancing) {
            return { success: false, reason: 'already advancing' };
        }

        if (votes.has(clientId)) {
            return { success: false, reason: 'already voted' , ...snapshot()};
        }

        votes.add(clientId);
        const state = snapshot();

        if (state.votes >= state.threshold) {
            return { success: true, advancing: true, ...state };
        }
        advancing = true;

        try {
            const advanced = await advanceStation(currKey);
            if (!advanced) {
                syncStation();
                return { success: false, reason: 'station changed', ...snapshot() };
            }

            syncStation();
            return { success: true, advancing: false, ...snapshot() };
        } catch (err) {
            advancing = false;
            throw err;
        }
    }
    return {
        snapshot,
        submitVote,
    }
}