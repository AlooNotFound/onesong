import { useEffect, useState } from 'react';
import { useServerClock } from './hooks/useServerClock.js';
import { useStation } from './hooks/useStation.js';
import { useServerNow } from './hooks/useServerNow.js';
import NowPlaying from './components/NowPlaying.jsx';
import YouTubePlayer from './components/YouTubePlayer.jsx';
import SkipVote from './components/SkipVote.jsx';
import SubmitSrc from './components/SubmitSrc.jsx';
import SyncedPlayer from './components/SyncedAudioPlayer.jsx';
import TrackVote from './components/TrackVote.jsx';
import { useMyProfile } from './hooks/useMyProfile.js';
import ProfileSetup from './components/ProfileSetup.jsx';

export default function App() {
  const clock = useServerClock();
  const { station, error } = useStation( clock.now, clock.ready );
  const nowMs = useServerNow(clock.now);
  const {user, profile, loading, error: profileError, setProfile} = useMyProfile();

  return (
    <main className="app">
      <header className="hero">
        <h1>OneSong</h1>
        <p className="tagline"> One song. Everyone. Right now.</p>
      </header>
      <ProfileSetup onComplete={setProfile}/>
      <NowPlaying station={station} nowMs={nowMs}/>
      {/* <YouTubePlayer station={station} nowMs={nowMs}/> */}
      <SyncedPlayer station={station} nowMs={nowMs}/>
      <SkipVote station={station} />
      <p className="status" role="status" aria-live="polite">
        {error ? 'Lost the signal. Retrying…' : ''}
      </p>
      <SubmitSrc />
    </main>
  );
}