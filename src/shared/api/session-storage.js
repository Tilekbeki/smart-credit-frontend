import { tokenExpiresAt } from './token.js';

export const SESSION_STORAGE_KEY = 'smart-credit-session:v1';

const browserStorage = () => typeof window === 'undefined' ? null : window.localStorage;

export function clearStoredSession(storage) {
  try { (storage ?? browserStorage())?.removeItem(SESSION_STORAGE_KEY); }
  catch { /* Session cleanup must also work when browser storage is unavailable. */ }
}

export function readStoredSession(storage, now = Date.now()) {
  try {
    const saved = (storage ?? browserStorage())?.getItem(SESSION_STORAGE_KEY);
    if (!saved) return null;
    const { accessToken } = JSON.parse(saved);
    const expiresAt = tokenExpiresAt(accessToken);
    if (!expiresAt || expiresAt <= now) { clearStoredSession(storage); return null; }
    return { accessToken, expiresAt };
  } catch {
    clearStoredSession(storage);
    return null;
  }
}

export function storeSession(token, storage, now = Date.now()) {
  const expiresAt = tokenExpiresAt(token);
  if (!expiresAt || expiresAt <= now) { clearStoredSession(storage); return false; }
  try {
    const target = storage ?? browserStorage();
    if (!target) return false;
    // Role, company, contact details and financial figures are fetched fresh rather than persisted.
    target.setItem(SESSION_STORAGE_KEY, JSON.stringify({ accessToken: token }));
    return true;
  } catch { clearStoredSession(storage); return false; }
}
