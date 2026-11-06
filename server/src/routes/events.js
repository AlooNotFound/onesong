import { Router } from "express";
import { subscribeEvents } from "../realtime/events.js";
import { getStationSnap } from "../station/service.js";
import { getPlayHistory } from "../history/service.js";

const router = Router();

router.get('/', async (_req, res) => {
    res.set({
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();
    let closed = false;
    function send(type, data) {
        if (closed || res.writableEnded) return;
        res.write(`event: ${type}\n`);
        res.write(`data: ${JSON.stringify(data)}\n\n`);
    }
    try {
        const [station, history] = await Promise.all([
            getStationSnap(),
            getPlayHistory(20)
        ]);
        send('station', station);
        send('history', history);
    } catch (err) {
        console.error(err);
        send('error', { message: 'Failed to fetch initial data' });
    }
    const unsub = subscribeEvents(({ type, data }) => {
        send(type, data);
    });

    const heartbeat = setInterval(() => {
        if (!closed && !res.writableEnded) {
            res.write(': heartbeat\n\n');
        }
    }, 20000);
    _req.on('close', () => {
        closed = true;
        clearInterval(heartbeat);
        unsub();
    });
});

export default router;