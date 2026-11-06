import { useState, useEffect } from 'react';
import {createProfile} from '../lib/users.js';

export default function ProfileSetup({ onComplete }) {
    const [username, setUsername] = useState('');
    const [displayName, setDisplayName] = useState('');
    const [bio, setBio] = useState('');
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState(null);
    
    async function handleSubmit(e) {
        e.preventDefault();
        if (loading) return;
        try {
            setLoading(true);
            setErr(null);
            const profile = await createProfile({ username, displayName, bio });
            onComplete?.(profile);
        } catch (error) {
            setErr(error.message);
        } finally {
            setLoading(false);
        }
    }
    return (
    <form className="profile-setup" onSubmit={handleSubmit}>
      <h2>Create your OneSong identity</h2>
      <label htmlFor="username">Username</label>
      <input id="username" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="your_username" minLength={3} maxLength={20} pattern="[A-Za-z0-9_]+" required/>
      <label htmlFor="displayName">Display name</label>
      <input id="displayName" value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="What should people call you?" maxLength={40} required />
      <label htmlFor="bio">Bio</label>
      <textarea id="bio" value={bio} onChange={(event) => setBio(event.target.value)} placeholder="A little about yourself..." maxLength={160}/>
      {err && (
        <p className="profile-setup__error" role="alert">
          {err}
        </p>
      )}
      <button type="submit" disabled={loading}>
        {loading ? 'Creating profile...' : 'Create profile'}
      </button>
    </form>
  );
}