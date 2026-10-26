import { clamp, formatTime } from "../lib/format.js";

export default function NowPlaying({ station, nowMs }) {
    if (!station) {
        return (
            <section className="card" aria-label="Now playing">
                <p className="eyebrow">Song -</p>
                <h2 className="song-title">Connecting to server...</h2>
                </section>
        )
    }
    const { song, songNumber, startedAt } = station;
    const pos = clamp(nowMs - startedAt, 0, song.duration);
    const remaining = song.duration - pos;

    return (
        <section className="card" aria-label="Now playing">
            <p className="eyebrow">Song {songNumber} - {formatTime(remaining)}</p>
            <h2 className="song-title">{song.title}</h2>
            <p className="song-artist">{song.artist}</p>

            <progress className="song-progress" value={pos} max={song.duration} aria-label="Song progress" />
            <div className="times">
                <span className="time-elapsed">{formatTime(pos)}</span>
                <span className="time-remaining">next song in {formatTime(remaining)}</span>
            </div>
        </section>
    )
}