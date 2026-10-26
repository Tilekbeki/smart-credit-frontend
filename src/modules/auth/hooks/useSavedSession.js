import { useEffect, useState } from 'react';
import * as api from '../../../shared/api/client.js';
import { readStoredSession } from '../../../shared/api/session-storage.js';
import { loadCabinetSession } from '../services/cabinet-session.js';

export function useSavedSession(onRestored) {
  const [session, setSession] = useState(readStoredSession);
  const [status, setStatus] = useState(() => session ? 'loading' : 'idle');
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!session) return undefined;
    let active = true;
    setStatus('loading'); setError('');
    loadCabinetSession(api, session.accessToken).then((snapshot) => {
      if (!active) return;
      onRestored(snapshot);
      setSession(null); setStatus('idle');
    }).catch((failure) => {
      if (!active) return;
      if (failure.status === 401) {
        api.setAccessToken(null); setSession(null); setStatus('expired');
      } else {
        // A network outage does not mean the user has signed out; allow retry without another OTP.
        setError(failure.message || 'Не удалось восстановить сессию.'); setStatus('error');
      }
    });
    return () => { active = false; };
  }, [session, attempt, onRestored]);

  return {
    status, error,
    retry: () => setAttempt((value) => value + 1),
    dismiss: () => { api.setAccessToken(null); setSession(null); setStatus('idle'); setError(''); },
  };
}
