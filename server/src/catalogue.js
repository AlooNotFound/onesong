import fs from 'fs';
import path from 'path';

const dir = path.resolve(import.meta.dirname, '../data');

export function validate(entries, src) {
    if (!Array.isArray(entries) || entries.length === 0) {
        throw new Error(`Invalid ${src} data: expected a non-empty array`);
    }

    const seen = new Set();
    entries.forEach((s, i) => {
        const where = `${source}[${i}]`;
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
    })
    return entries;
}

export function loadCatalogue() {
    const candidates = [process.env.SEED_FILE, path.join(dir, 'seed.json')].filter(Boolean);
    const f = candidates.find(f => fs.existsSync(f));
    if (!f) {
        throw new Error(`No seed file found. Tried: ${candidates.join(', ')}`);
    }
    const entries = validate(JSON.parse(fs.readFileSync(f, 'utf-8')), f);
    const placeholders = entries.filter(s => s.id.startsWith('REPLACE_'));
    if(placeholders.length > 0) {
        console.warn(`Warning: ${placeholders.length} placeholder entries found in ${f}. Please replace them with real data.`);
    }
    return entries;
}