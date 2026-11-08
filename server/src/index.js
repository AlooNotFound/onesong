import fs from "fs";
import path from "path";
import express from "express";
import { Station } from "./station.js";
import { loadCatalogue } from "./catalogue.js";
import { createListenerRegistry, isValidListenerId } from "./listeners.js";
import { createSkipSrv } from "./skipVotes.js";
import subRouter from "./routes/submissions.js";
import audioRouter from "./routes/audio.js";
import stationRouter from "./routes/station.js";
import tracksRouter from "./routes/tracks.js";
import skipRouter from './routes/skip.js';
import historyRouter from './routes/history.js';
import eventsRouter from './routes/events.js';
import usersRouter from './routes/users.js';

const app = express();
app.use(express.json({ limit: '16kb' }));
app.use('/api/submissions', subRouter);
app.use('/api/audio', audioRouter);
app.use('/api/station', stationRouter);
app.use('/api/tracks', tracksRouter);
app.use('/api/skip', skipRouter);
app.use('/api/history', historyRouter);
app.use('/api/events', eventsRouter);
app.use('/api/users', usersRouter);
const station = new Station({ catalog: loadCatalogue() });
const listenerReg = createListenerRegistry();
const skipSrv = createSkipSrv({
  getStation: () => station.snapshot(),
  getActiveListenerCount: () => listenerReg.count(),
  isListenerActive: (clientId) => listenerReg.isActive(clientId),
  advStation: (expectedKey) => station.advanceIfCurr(expectedKey),
})

app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

app.get('/api/time', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ serverTime: station.now() });
});

app.get('/api/now', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(station.snapshot());
});

app.post('/api/listeners/heartbeat', (req, res) => {
  const { clientId } = req.body ?? {};
  if (!isValidListenerId(clientId)) {
    return res.status(400).json({ error: 'Invalid listener ID' });
  }
  const count = listenerReg.heartbeat(clientId);
  res.set('Cache-Control', 'no-store');
  return res.json({ count, serverTime: Date.now() });
});

app.get('/api/listeners', (_req, res) => {
  res.set('Cache-Control', 'no-store');

  return res.json({ count: listenerReg.count(), serverTime: Date.now() });
});

app.get('/api/skip-vote', (req, res) => {
  res.set('Cache-Control', 'no-store');
  const curr = skipSrv.snapshot();
  return res.json({
    stationKey: curr.stationKey ? curr.stationKey : null, ...skipSrv.snapshot(),
  });
});

app.post('/api/skip-vote', async (req, res, next) => {
  try {
    const { clientId, stationKey } = req.body ?? {};
    if ( typeof clientId !== 'string' || !isValidListenerId(clientId) ) {
      return res.status(400).json({ error: 'Invalid listener ID' });
    }
    if ( typeof stationKey !== 'string' || !/^\d+:\d+$/.test(stationKey) ) {
      return res.status(400).json({ error: 'Invalid station key' });
    }
    const res = await skipSrv.submitVote(clientId, stationKey);
    res.set('Cache-Control', 'no-store');
    if (res.error) {
      return res.status(400).json({ error: res.error });
    }
    return res.json({ ...res, serverTime: Date.now() });
  } catch (err) {
    next(err);
  }
});

const dist = path.resolve(import.meta.dirname, '../../client/dist');
if (fs.existsSync(dist)) {
    app.use(express.static(dist));
    app.use((req, res, next) => {
        if (req.method !== 'GET' || req.path.startsWith('/api')) return next();
        res.sendFile(path.join(dist, 'index.html'));
    });
}

app.listen(3000, () => {
  console.log("Server is running on http://localhost:3000");
});