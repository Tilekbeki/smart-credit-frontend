import assert from 'node:assert/strict';
import test from 'node:test';
import { chatProgress, guestRecommendation } from '../src/chat-recommendations.js';
import { recommendationInput } from '../src/application-form.js';
import { sendChatApplication } from '../src/services/chat-applications.js';

const form = { purpose: 'stock', requestedAmountRub: '500000', termMonths: '12', monthlyRevenueRub: '1000000', monthlyExpensesRub: '0' };

test('guests get product orientation without financial eligibility or invented terms', () => {
  for (const purpose of ['stock', 'expenses', 'seasonal']) assert.match(guestRecommendation(purpose).title, /оборотный/);
  for (const purpose of ['equipment', 'upgrade']) assert.match(guestRecommendation(purpose).title, /инвестиционный/);
  assert.match(guestRecommendation('other').next, /Измените цель/);
  assert.deepEqual(Object.keys(guestRecommendation('stock')).sort(), ['description', 'next', 'title']);
});

test('sign-in carries guest answers forward but requires missing financial data', () => {
  const history = ['purpose', 'requestedAmountRub', 'termMonths'].map((field) => ({ field, answer: form[field] }));
  const guest = { currentStep: 'complete', history };
  assert.deepEqual(chatProgress(guest, false), guest);
  assert.deepEqual(chatProgress(guest, true), { currentStep: 'monthlyRevenueRub', history });
  const finished = { currentStep: 'complete', history: [...history, { field: 'monthlyRevenueRub' }, { field: 'monthlyExpensesRub' }] };
  assert.deepEqual(chatProgress(finished, true), finished);
});

test('personal recommendation rejects missing or invalid figures instead of coercing blanks to zero', () => {
  assert.deepEqual(recommendationInput(form), { purpose: 'stock', requestedAmountRub: 500000, termMonths: 12, monthlyRevenueRub: 1000000, monthlyExpensesRub: 0 });
  for (const patch of [{ monthlyRevenueRub: '' }, { monthlyExpensesRub: ' ' }, { termMonths: '121' }, { requestedAmountRub: '1.5' }, { monthlyRevenueRub: '-1' }, { requestedAmountRub: '1000000000001' }]) {
    assert.throws(() => recommendationInput({ ...form, ...patch }));
  }
});

test('chat submits the one created draft and preserves server status', async () => {
  const calls = [];
  const result = await sendChatApplication({
    createApplication: async (payload) => { calls.push(['create', payload]); return { applicationId: 'a1', status: 'draft', version: 1 }; },
    submitApplication: async (id) => { calls.push(['submit', id]); return { status: 'submitted', submittedAt: 'now' }; },
  }, form);
  assert.deepEqual(calls, [['create', form], ['submit', 'a1']]);
  assert.equal(result.application.applicationId, 'a1');
  assert.equal(result.application.status, 'submitted');
  assert.equal(result.submitted, true);
});

test('missing documents and uncertain submit failures return the known draft for cabinet handoff', async () => {
  for (const failure of [{ status: 422, details: [{ field: 'documents.BANK_STATEMENT' }] }, new Error('Network error')]) {
    let created = 0;
    const draft = { applicationId: 'a1', status: 'draft' };
    const result = await sendChatApplication({
      createApplication: async () => { created += 1; return draft; },
      submitApplication: async () => { throw failure; },
    }, form);
    assert.equal(created, 1);
    assert.equal(result.application, draft);
    assert.equal(result.failure, failure);
    assert.equal(result.submitted, false);
  }
});

test('draft limit failure stops before submit', async () => {
  let submitted = false;
  await assert.rejects(sendChatApplication({
    createApplication: async () => { throw Object.assign(new Error('Limit'), { code: 'draft_limit_reached' }); },
    submitApplication: async () => { submitted = true; },
  }, form), { code: 'draft_limit_reached' });
  assert.equal(submitted, false);
});
