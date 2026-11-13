import { useState, useEffect } from 'react';
import { createProfile, updateProfile } from '../lib/users.js';
import { loginWithGoogle, loginAnonymously, logout } from '../lib/firebase.js';

export default function ProfileSetup({ user, profile, loading: profileLoading, onComplete }) {
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (profile) {
      setUsername(profile.username || '');
      setDisplayName(profile.displayName || '');
      setBio(profile.bio || '');
    } else if (user) {
      if (user.displayName) {
        setDisplayName(user.displayName);
      }
      if (user.email) {
        const guessed = user.email.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '').slice(0, 20);
        if (guessed && !username) setUsername(guessed);
      }
    }
  }, [user, profile]);

  async function handleGoogleLogin() {
    try {
      setLoading(true);
      setErr(null);
      await loginWithGoogle();
    } catch (error) {
      setErr(error.message || 'failed to login with Google');
    } finally {
      setLoading(false);
    }
  }

  async function handleGuestLogin() {
    try {
      setLoading(true);
      setErr(null);
      await loginAnonymously();
    } catch (error) {
      setErr(error.message || 'Failed to continue as guest');
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    try {
      setLoading(true);
      await logout();
      onComplete?.(null);
      setEditing(false);
    } catch (error) {
      setErr(error.message || 'Failed to logout');
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateProfile(e) {
    e.preventDefault();
    if (loading) return;
    try {
      setLoading(true);
      setErr(null);
      const res = await createProfile({ username, displayName, bio });
      onComplete?.(res);
      setEditing(false);
    } catch (error) {
      setErr(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleUpdateProfile(e) {
    e.preventDefault();
    if (loading) return;
    try {
      setLoading(true);
      setErr(null);
      const res = await updateProfile({ displayName, bio });
      onComplete?.(res);
      setEditing(false);
    } catch (error) {
      setErr(error.message);
    } finally {
      setLoading(false);
    }
  }

  if (profileLoading && !user) {
    return (
      <div className="card profile-setup" style={{ textAlign: 'center', opacity: 0.8 }}>
        <p>Connecting...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="card profile-setup" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ textAlign: 'center' }}>
          <h2 style={{ margin: '0 0 6px' }}>Sign in to OneSong</h2>
          <p style={{ margin: 0, opacity: 0.8, fontSize: '0.9rem' }}>
            Login to create your identity, vote, and put songs in the mix.
          </p>
        </div>

        {err && (
          <p className="profile-setup__error" role="alert" style={{ textAlign: 'center' }}>
            {err}
          </p>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button type="button" onClick={handleGoogleLogin} disabled={loading}style={{   background: '#4285F4',   color: '#fff',   border: 'none',   padding: '10px 18px',   borderRadius: 8,   fontWeight: 600,  cursor: 'pointer',  display: 'flex',  alignItems: 'center',  gap: 8 }} >
            Sign in with Google
          </button>
          <button type="button" onClick={handleGuestLogin} disabled={loading}style={{   background: '#2b2b3b',   color: '#eee',   border: '1px solid #444',   padding: '10px 18px',   borderRadius: 8,   fontWeight: 600,  cursor: 'pointer' }}>
            Continue as Guest
          </button>
        </div>
      </div>
    );
  }
  if (profile && !editing) {
    return (
      <div className="card profile-setup" style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 42, height: 42, borderRadius: '50%', background: 'var(--accent, #ff4d6d)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', fontWeight: 'bold', color: '#fff'}}>
            {(profile.displayName || profile.username || 'U')[0].toUpperCase()}
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: '1rem' }}>
              {profile.displayName || profile.username}
              <span style={{ opacity: 0.6, fontSize: '0.85rem', marginLeft: 8 }}>
                @{profile.username}
              </span>
            </div>
            {profile.bio && (
              <p style={{ margin: '4px 0 0', opacity: 0.75, fontSize: '0.85rem' }}>
                {profile.bio}
              </p>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={() => setEditing(true)}style={{ background: 'transparent', border: '1px solid #555', color: '#eee', padding: '6px 12px', borderRadius: 6,cursor: 'pointer',fontSize: '0.85rem'}}>
            Edit
          </button>
          <button type="button" onClick={handleLogout}disabled={loading}style={{ background: '#222', border: '1px solid #444', color: '#ff708d', padding: '6px 12px', borderRadius: 6,cursor: 'pointer',fontSize: '0.85rem'}}>
            Sign out
          </button>
        </div>
      </div>
    );
  }
  return (
    <form className="card profile-setup" onSubmit={profile ? handleUpdateProfile : handleCreateProfile}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>
          {profile ? 'Edit profile' : 'Create your OneSong identity'}
        </h2>
        <button 
          type="button" 
          onClick={profile ? () => setEditing(false) : handleLogout}
          style={{ background: 'transparent', border: 'none', color: '#888', cursor: 'pointer', fontSize: '0.85rem' }}
        >
          {profile ? 'Cancel' : 'Sign out'}
        </button>
      </div>

      {!profile && (
        <>
          <label htmlFor="username">Username</label>
          <input id="username" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="your_username" minLength={3} maxLength={20} pattern="[A-Za-z0-9_]+" required/>
        </>
      )}

      <label htmlFor="displayName">Display name</label>
      <input id="displayName" value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="wht should people call u?" maxLength={40} required />
      <label htmlFor="bio">Bio</label>
      <textarea id="bio" value={bio} onChange={(event) => setBio(event.target.value)} placeholder="a little abt urself...?" maxLength={160}/>

      {err && (
        <p className="profile-setup__error" role="alert">
          {err}
        </p>
      )}

      <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
        <button type="submit" disabled={loading} style={{ flex: 1 }}>
          {loading 
            ? (profile ? 'Saving...' : 'Creating profile...') 
            : (profile ? 'Save changes' : 'Create profile')}
        </button>
        {profile && (
          <button type="button" onClick={() => setEditing(false)}disabled={loading}style={{ background: '#333', border: 'none', color: '#fff', borderRadius: 8, padding: '10px 16px' }}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}