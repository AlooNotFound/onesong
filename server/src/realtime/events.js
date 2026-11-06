import { EventEmitter } from 'events';

const events = new EventEmitter();
events.setMaxListeners(0);

export function publishEvent(type, data) {
    events.emit('event', {
        type, data, timestamp: Date.now(),
    });
}

export function subscribeEvents(callback) {
    events.on('event', callback);
    return () => {
        events.off('event', callback);
    };
}