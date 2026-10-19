import fs from "fs";
import path from "path";
import express from "express";
import { Station } from "./station.js";
import { loadCatalogue } from "./catalogue.js";

const app = express();
const station = new Station({ catalog: loadCatalogue() });
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