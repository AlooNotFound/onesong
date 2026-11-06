import { useEffect, useState } from 'react';
import { getPublicProfile } from '../lib/users.js';

export function usePublicProfile(username) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  useEffect(() => {
    let cancelled = false;
    async function loadProfile() {
      setLoading(true);
      setError('');
      try {
        const res = await getPublicProfile(username);
        if (!cancelled) {
          setProfile(res);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }
    loadProfile();
    return () => { cancelled = true; };
  }, [username]);

  if (loading) return <div>Loading profile...</div>;
  if (error) return <div>Error loading profile: {error}</div>;
  if (!profile) return <div>Profile not found</div>;

  return (
    <section className="public-profile">
      <div className="public-profile__avatar">
        {profile.photoURL ? (
          <img src={profile.photoURL} alt="" />
        ) : (
          <span>
            {profile.displayName?.charAt(0)?.toUpperCase() ?? '?'}
          </span>
        )}
      </div>
      <h2>{profile.displayName}</h2>
      <p>@{profile.username}</p>
      {profile.bio && (
        <p className="public-profile__bio">{profile.bio}</p>
      )}
    </section>
  );
}