export class Station {
    constructor({ catalog, now = Date.now, rand = Math.random }) {
        if( !Array.isArray(catalog) || catalog.length === 0 ) {
            throw new Error('Station requires a non-empty catalog array');
        }
        this.catalog = catalog;
        this.now = now;
        this.rand = rand;
        this.played = new Set();
        this.songNumber = 0;
        this.curr = null;
        this.#start(this.now());
    }
    #start(startedAt) {
        const song = this.#pickNext();
        this.played.add(song.id);
        this.songNumber++;
        this.curr = {
            song,
            startedAt,
            endsAt: startedAt + song.duration * 1000
        };
    }
    #pickNext() {
        let pool = this.catalog.filter(song => !this.played.has(song.id));
        if (pool.length === 0) {
            this.played.clear();
            pool = this.catalog.filter((s) => song.id !== this.current?.song.id);
            if (pool.length === 0) pool = this.catalog;
        }
        return pool[Math.floor(this.rand() * pool.length)];
    }
    tick() {
        const t = this.now();
        while (t >= this.curr.endsAt) {
            this.#start(this.curr.endsAt);
        }
    }
    snapshot() {
        this.tick();
        const serverTime = this.now();
        const { song, startedAt, endsAt } = this.curr;
        return {
            serverTime,
            songNumber: this.songNumber,
            song: {
                id: song.id,
                title: song.title,
                artist: song.artist,
                duration: song.duration,
            },
            startedAt,
            endsAt,
            position: (serverTime - startedAt) / 1000,
            remaining: (endsAt - serverTime) / 1000
        }
    }

}