import { useEffect, useState } from 'react';
import { useServerClock } from './hooks/useServerClock.js';
import { useStation } from './hooks/useStation.js';
import { useServerNow } from './hooks/useServerNow.js';
import NowPlaying from './components/NowPlaying.jsx';
import YouTubePlayer from './components/YouTubePlayer.jsx';

export default function App() {
  const clock = useServerClock();
  const { station, error } = useStation( clock.now, clock.ready );
  const nowMs = useServerNow(clock.now);

  return (
    <main className="app">
      <header className="hero">
        <h1>OneSong</h1>
        <p className="tagline"> One song. Everyone. Right now.</p>
      </header>

      <NowPlaying station={station} nowMs={nowMs}/>
      <YouTubePlayer station={station} nowMs={nowMs}/>

      <p className="status" role="status" aria-live="polite">
        {error ? 'Lost the signal. Retrying…' : ''}
      </p>
    </main>
  );
}