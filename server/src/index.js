import fs from "fs";
import path from "path";
import express from "express";

const app = express();
app.get("/api/health", (req, res) => {
  res.json({ ok: true });
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