// Expiration is only a local hint. The backend verifies the signature and resolves identity via /me.
export function tokenExpiresAt(token) {
  try {
    if (typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length !== 3 || parts.some((part) => !part)) return null;
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const { exp } = JSON.parse(atob(payload.padEnd(Math.ceil(payload.length / 4) * 4, '=')));
    const expiresAt = exp * 1000;
    return typeof exp === 'number' && Number.isSafeInteger(expiresAt) && expiresAt > 0 ? expiresAt : null;
  } catch { return null; }
}
