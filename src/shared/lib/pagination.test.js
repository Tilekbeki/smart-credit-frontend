import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchVisibleApplications } from './pagination.js';
test('background refresh keeps all visible pages and respects the API limit of 100', async () => {
  const calls = [];
  const result = await fetchVisibleApplications(async (query) => {
    calls.push(query);
    return { total: 240, items: Array.from({ length: query.limit }, (_, i) => ({ id: query.offset + i })) };
  }, 140);
  assert.deepEqual(calls, [{ limit: 100, offset: 0 }, { limit: 40, offset: 100 }]);
  assert.equal(result.items.length, 140);
  assert.equal(result.items[139].id, 139);
});
test('refresh stops at the current total when drafts have been deleted', async () => {
  const result = await fetchVisibleApplications(async () => ({ total: 1, items: [{ id: 1 }] }), 40);
  assert.deepEqual(result, { total: 1, items: [{ id: 1 }] });
});
