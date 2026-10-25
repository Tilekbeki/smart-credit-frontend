import assert from 'node:assert/strict';
import test from 'node:test';
import { tokenExpiresAt } from '../src/utils/token.js';
import { SESSION_STORAGE_KEY, readStoredSession, storeSession, clearStoredSession } from '../src/services/session-storage.js';
import { loadCabinetSession } from '../src/services/cabinet-session.js';

const now = 1700000000000;
// Unsigned fixtures are expiration hints only; /me remains the authority for a real session.
const token = (claims) => `header.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.signature`;
function memoryStorage() {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
}

test('saved session contains only the access token and survives a new read before expiry', () => {
  const storage = memoryStorage();
  const accessToken = token({ exp: now / 1000 + 28800 });
  assert.equal(storeSession(accessToken, storage, now), true);
  assert.deepEqual(JSON.parse(storage.getItem(SESSION_STORAGE_KEY)), { accessToken });
  assert.deepEqual(readStoredSession(storage, now + 1000), { accessToken, expiresAt: now + 28800000 });
  clearStoredSession(storage);
  assert.equal(readStoredSession(storage, now), null);
});

test('expired or corrupt storage is cleared instead of restoring an authenticated flag', () => {
  const storage = memoryStorage();
  for (const saved of ['not-json', 'null', '{"loggedIn":true,"role":"BANK_EMPLOYEE"}', JSON.stringify({ accessToken: 'broken' }), JSON.stringify({ accessToken: token({ exp: now / 1000 }) }), JSON.stringify({ accessToken: token({ exp: '9999999999' }) })]) {
    storage.setItem(SESSION_STORAGE_KEY, saved);
    assert.equal(readStoredSession(storage, now), null);
    assert.equal(storage.getItem(SESSION_STORAGE_KEY), null);
  }
  for (const malformed of ['a.b.c', '', token({}), token({ exp: Infinity })]) assert.equal(tokenExpiresAt(malformed), null);
});

test('storage errors never break sign-in and failed writes remove an older account session', () => {
  const unavailable = { getItem() { throw new Error('Blocked'); }, setItem() { throw new Error('Blocked'); }, removeItem() { throw new Error('Blocked'); } };
  const accessToken = token({ exp: now / 1000 + 100 });
  assert.equal(readStoredSession(unavailable, now), null);
  assert.equal(storeSession(accessToken, unavailable, now), false);
  assert.doesNotThrow(() => clearStoredSession(unavailable));
  const storage = memoryStorage();
  storage.setItem(SESSION_STORAGE_KEY, 'previous-account');
  storage.setItem = () => { throw new Error('Quota'); };
  assert.equal(storeSession(accessToken, storage, now), false);
  assert.equal(storage.getItem(SESSION_STORAGE_KEY), null);
});

test('client restoration resolves identity and company through /me before loading protected data', async () => {
  const calls = [];
  const user = { role: 'CLIENT', companyId: 'server-company', id: 'server-user' };
  const context = await loadCabinetSession({
    setAccessToken: (...args) => calls.push(['token', ...args]),
    getMe: async () => { calls.push(['me']); return user; },
    getCompany: async (id) => { calls.push(['company', id]); return { id }; },
    getCreditProducts: async () => ({ items: [{ id: 'turnover' }] }),
    listApplications: async (query) => { calls.push(['list', query]); return { items: [{ applicationId: 'a1' }], total: 1 }; },
  }, 'saved-token');
  assert.deepEqual(calls.slice(0, 3), [['token', 'saved-token', { persist: false }], ['me'], ['company', 'server-company']]);
  assert.deepEqual(context.user, user);
  assert.equal(context.company.id, user.companyId);
  assert.deepEqual(context.products, [{ id: 'turnover' }]);
  assert.equal(context.total, 1);
});

test('employee restoration does not call client company, products or application APIs', async () => {
  const user = { id: 'staff', role: 'BANK_EMPLOYEE', companyId: null };
  const snapshot = await loadCabinetSession({ setAccessToken() {}, getMe: async () => user }, 'token');
  assert.equal(snapshot.user, user);
  assert.equal(snapshot.company, null);
  assert.deepEqual(snapshot.applications, []);
});

test('unknown roles and clients without a company cannot restore a cabinet', async () => {
  for (const user of [{ role: 'ADMIN' }, { role: 'CLIENT', companyId: null }]) {
    await assert.rejects(loadCabinetSession({ setAccessToken() {}, getMe: async () => user }, 'token'), { status: 401, code: 'invalid_session' });
  }
});

test('a restore network failure does not erase the saved credential or repeat OTP automatically', async () => {
  const storage = memoryStorage();
  const accessToken = token({ exp: now / 1000 + 100 });
  storeSession(accessToken, storage, now);
  const failure = Object.assign(new Error('offline'), { code: 'network_error' });
  await assert.rejects(loadCabinetSession({ setAccessToken() {}, getMe: async () => { throw failure; } }, accessToken), failure);
  assert.equal(readStoredSession(storage, now).accessToken, accessToken);
});
