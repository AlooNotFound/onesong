import { useState, useEffect } from 'react';
import { useServerClock } from './hooks/useServerClock.js';
import { useStation } from './hooks/useStation.js';
import { useMyProfile } from './hooks/useMyProfile.js';
import SyncedPlayer from './components/SyncedAudioPlayer.jsx';
import ProfileSetup from './components/ProfileSetup.jsx';
import SubmitSrc from './components/SubmitSrc.jsx';
import AdminAudHandling from './components/AdminAudHandling.jsx';
import LiveChat from './components/LiveChat.jsx';

export default function App() {
  const clock = useServerClock();
  const { station, error } = useStation(clock.now, clock.ready);
  const { user, profile, loading: profileLoading, setProfile } = useMyProfile();
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [showAdminModal, setShowAdminModal] = useState(() => typeof window !== 'undefined' && window.location.hash === '#admin');
  const [isAdminRoute, setIsAdminRoute] = useState(() => typeof window !== 'undefined' && (window.location.hash === '#admin' || new URLSearchParams(window.location.search).has('admin')));
  const isAdmin = Boolean(profile?.isAdmin || profile?.role === 'admin' || isAdminRoute);

  useEffect(() => {
    const handleHash = () => {
      const match = window.location.hash === '#admin' || new URLSearchParams(window.location.search).has('admin');
      if (match) {
        setIsAdminRoute(true);
        setShowAdminModal(true);
      }
    };
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  return (
    <div className="app-shell">
      <header className="navbar">
        <div className="navbar__brand">
          <span className="brand-title">OneSong</span>
          <span className="brand-pill">
            <span className="brand-dot" /> LIVE
          </span>
        </div>
        <div className="navbar__actions">
          <button type="button" className="btn-nav btn-suggest" onClick={() => setShowSubmitModal(true)}>
            + Suggest Song
          </button>

          {user ? (
            <button type="button" className="btn-profile" onClick={() => setShowProfileModal(true)}title="your Profile">
              <div className="avatar-circle">
                {(profile?.displayName || profile?.username || user.displayName || 'U')[0].toUpperCase()}
              </div>
              <span className="profile-name">
                {profile?.displayName || profile?.username || 'Profile'}
              </span>
            </button>
          ) : (
            <button type="button" className="btn-nav btn-signin" onClick={() => setShowProfileModal(true)} title="Sign In">
              Sign In
            </button>
          )}
        </div>
      </header>

      <main className="main-stage">
        <div className="hero-banner">
          <h1 className="hero-title">one song.</h1>
          <p className="hero-tagline">worldwide synced radio - controlled by you all.</p>
        </div>

        <SyncedPlayer station={station} clock={clock} onRequireLogin={() => setShowProfileModal(true)}/>
        {error && (
          <p className="reconnect-status" role="status">
            Reconnecting to broadcast…
          </p>
        )}
      </main>

      <footer className="footer">
        <p>&copy; 2026 OneSong. All rights reserved.</p>
        {isAdmin && (
          <button type="button" className="admin-link-btn" onClick={() => setShowAdminModal(true)}>
            Audio Storage & Admin
          </button>
        )}
      </footer>

      {showProfileModal && (
        <div className="modal-overlay" onClick={() => setShowProfileModal(false)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="modal-close-btn" onClick={() => setShowProfileModal(false)} aria-label="Close">
              X
            </button>
            <ProfileSetup user={user} profile={profile} loading={profileLoading} onComplete={(newProf) => {
                setProfile(newProf);
                if (newProf) setShowProfileModal(false);
              }}/>
          </div>
        </div>
      )}

      {showSubmitModal && (
        <div className="modal-overlay" onClick={() => setShowSubmitModal(false)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="modal-close-btn" onClick={() => setShowSubmitModal(false)} aria-label="Close">
              X
            </button>
            <div className="modal-header">
              <h2>suggest a Song</h2>
              <p>paste the YT link to add it to the broadcast rotation queue.</p>
            </div>
            <SubmitSrc onRequireLogin={() => setShowProfileModal(true)} />
          </div>
        </div>
      )}

      {showAdminModal && isAdmin && (
        <div className="modal-overlay" onClick={() => setShowAdminModal(false)}>
          <div className="modal-dialog modal-dialog--wide" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="modal-close-btn" onClick={() => setShowAdminModal(false)} aria-label="Close">
              X
            </button>
            <AdminAudHandling />
          </div>
        </div>
      )}
      <LiveChat user={user} profile={profile} onRequireLogin={() => setShowProfileModal(true)} />
    </div>
  );
}
