import fs from 'fs';
import path from 'path';

const dir = path.resolve(import.meta.dirname, '../data');

export function validate(entries, src = 'seed') {
    if (!Array.isArray(entries) || entries.length === 0) {
        throw new Error(`Invalid ${src} data: expected a non-empty array`);
    }

    const seen = new Set();
    entries.forEach((s, i) => {
        const where = `${src}[${i}]`;
        if (!s || typeof s.id !== 'string' || s.id.trim() === '') {
            throw new Error(`Invalid ${where}: missing or empty 'id'`);
        }
        if (typeof s.title !== 'string' || s.title.trim() === '') {
            throw new Error(`Invalid ${where}: missing or empty 'title'`);
        }
        if (typeof s.artist !== 'string' || s.artist.trim() === '') {
            throw new Error(`Invalid ${where}: missing or empty 'artist'`);
        }
        if (typeof s.duration !== 'number' || s.duration <= 0 || !Number.isFinite(s.duration)) {
            throw new Error(`Invalid ${where}: 'duration' must be a positive number`);
        }
        if (seen.has(s.id)) {
            throw new Error(`Invalid ${where}: duplicate 'id'`);
        }
        seen.add(s.id);
    });
    return entries;
}

export function loadCatalogue() {
    const candidates = [process.env.SEED_FILE, path.join(dir, 'seed.json')].filter(Boolean);
    const f = candidates.find((file) => fs.existsSync(file));
    if (f) {
        try {
            const content = fs.readFileSync(f, 'utf-8').trim();
            if (content) {
                const parsed = JSON.parse(content);
                return validate(parsed, f);
            }
        } catch (err) {
            console.warn(`Could not load seed catalog from ${f}: ${err.message}`);
        }
    }
    return [
        {
            id: 'dQw4w9WgXcQ',
            title: 'Never Gonna Give You Up',
            artist: 'Rick Astley',
            duration: 213,
        },
    ];
}
