import { useEffect, useState, useCallback } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../lib/firebase.js';
import { getMyProfile } from '../lib/users.js';

export function useMyProfile() {
  const [user, setUser] = useState(auth.currentUser);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refreshProfile = useCallback(async () => {
    if (!auth.currentUser) {
      setProfile(null);
      setLoading(false);
      return null;
    }
    setLoading(true);
    try {
      const res = await getMyProfile();
      setProfile(res);
      setError('');
      return res;
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

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
    return () => { 
      cancelled = true; 
      unsubscribe(); 
    };
  }, []);

  return { user, profile, loading, error, setProfile, refreshProfile };
}
