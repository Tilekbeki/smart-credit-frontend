import { useEffect, useState } from 'react';
import { getProfiles } from '../../../shared/api/client.js';

// Public profiles are needed for sign-in only; a guest recommendation works without this request.
export function useLoginProfiles(enabled) {
  const [profiles, setProfiles] = useState([]);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!enabled || loaded) return undefined;
    let active = true;
    setLoading(true);
    setError('');
    getProfiles().then((response) => {
      if (active) { setProfiles(response.items || []); setLoaded(true); }
    }).catch((failure) => {
      if (active) setError(failure.message || 'Не удалось загрузить профили для входа.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [enabled, loaded, attempt]);

  return {
    profiles,
    loading: enabled && !loaded && (loading || !error),
    error,
    retry: () => { setError(''); setLoaded(false); setAttempt((value) => value + 1); },
  };
}
