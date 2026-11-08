import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../lib/firebase.js';
import { getMyProfile } from '../lib/users.js';

export function useMyProfile() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const unsubscribe = onAuthStateChanged(auth, async (fUser) => {
      if (cancelled) return;
      setUser(fUser);
      setProfile(null);
      setError('');
      if (!fUser) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const res = await getMyProfile();
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
    });
    return () => { cancelled = true; unsubscribe(); };
  }, []);

  return { user, profile, loading, error, setProfile,};
}