import assert from 'node:assert/strict';
import test from 'node:test';
import { companyContactPatch, userContactPatch } from '../src/contacts.js';
const company = { version: 7, contact: { phone: '+79990000001', email: 'old@example.test', address: 'Москва' } };

test('additional email can be cleared and user version remains separate from company version', () => {
  assert.deepEqual(userContactPatch({ version: 3 }, '  '), { version: 3, additionalEmail: null });
  assert.deepEqual(userContactPatch({ version: 3 }, ' owner@example.test '), { version: 3, additionalEmail: 'owner@example.test' });
  assert.throws(() => userContactPatch({ version: 3 }, 'Owner <owner@example.test>'));
});
test('company update sends only changed contact fields and rejects empty or invalid values', () => {
  assert.deepEqual(companyContactPatch(company, { ...company.contact, email: ' new@example.test ' }), { version: 7, contact: { email: 'new@example.test' } });
  for (const invalid of [{ phone: '89990000001' }, { email: 'bad email' }, { address: '' }, { address: 'ab\ncd' }, { address: 'a'.repeat(301) }]) {
    assert.throws(() => companyContactPatch(company, { ...company.contact, ...invalid }));
  }
  assert.throws(() => companyContactPatch(company, company.contact));
});
