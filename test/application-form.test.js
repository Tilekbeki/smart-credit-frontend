import assert from 'node:assert/strict';
import test from 'node:test';
import { initialForm, formFromApplication, payloadFromForm, validateForm, recommendationInput, initialFormAfterSignIn, selectedLandingPurpose } from '../src/application-form.js';
import { parseChatNumber, chatProgress } from '../src/chat-recommendations.js';

const complete = { ...initialForm(), requestedAmountRub: '500000', termMonths: '12', monthlyRevenueRub: '2000000', monthlyExpensesRub: '0' };

test('draft conversion preserves absent fields as null and explicit zero finances as zero', () => {
  const form = { ...initialForm(), requestedAmountRub: '   ', termMonths: '', monthlyRevenueRub: '0', monthlyExpensesRub: ' 0 ', purposeDescription: '  ' };
  assert.equal(validateForm(form), '');
  assert.deepEqual(payloadFromForm(form), {
    productId: null, purpose: 'stock', purposeDescription: null,
    requestedAmountRub: null, termMonths: null, monthlyRevenueRub: 0, monthlyExpensesRub: 0,
  });
  assert.throws(() => recommendationInput(form));
});

test('incomplete saved drafts round-trip without filling fields or producing false edits', () => {
  const saved = { productId: null, purpose: null, purposeDescription: null, requestedAmountRub: null, termMonths: null, monthlyRevenueRub: 0, monthlyExpensesRub: null };
  assert.deepEqual(payloadFromForm(formFromApplication(saved)), saved);
});

test('chat and form use identical integer and range limits including boundary values', () => {
  for (const [field, minimum, maximum] of [['requestedAmountRub', 1, 1e12], ['termMonths', 1, 120], ['monthlyRevenueRub', 0, 1e12], ['monthlyExpensesRub', 0, 1e12]]) {
    for (const value of [minimum, maximum]) {
      assert.equal(validateForm({ ...complete, [field]: String(value) }, { forRecommendation: true }), '');
      assert.equal(parseChatNumber(String(value), field), value);
    }
    for (const value of [minimum - 1, maximum + 1, 1.5, Infinity]) {
      assert.notEqual(validateForm({ ...complete, [field]: String(value) }), '');
      assert.equal(parseChatNumber(String(value), field), null);
    }
  }
  assert.equal(parseChatNumber('1,5 млн ₽', 'requestedAmountRub'), 1500000);
  assert.equal(parseChatNumber('500 тыс.', 'requestedAmountRub'), 500000);
  assert.equal(parseChatNumber('24 месяца', 'termMonths'), 24);
});

test('description validation follows backend Unicode character limits and normalizes surrounding space', () => {
  assert.equal(validateForm({ ...complete, purposeDescription: `  ${'🌷'.repeat(300)}  ` }), '');
  assert.notEqual(validateForm({ ...complete, purposeDescription: '🌷'.repeat(301) }), '');
  assert.notEqual(validateForm({ ...complete, purposeDescription: 'test\0text' }), '');
  assert.equal(payloadFromForm({ ...complete, purposeDescription: '  Оборудование  ' }).purposeDescription, 'Оборудование');
});

test('recommendation input uses only the supported numeric DTO fields', () => {
  assert.deepEqual(recommendationInput({ ...complete, productId: 'turnover', purposeDescription: 'Описание', version: 3 }), {
    purpose: 'stock', requestedAmountRub: 500000, termMonths: 12, monthlyRevenueRub: 2000000, monthlyExpensesRub: 0,
  });
});

test('landing intent is parsed with URLSearchParams and never selects an unavailable product', () => {
  const products = [{ id: 'investment', purposes: ['equipment'] }];
  assert.equal(selectedLandingPurpose('?purpose=equipment&extra=a%3Db'), 'equipment');
  assert.equal(selectedLandingPurpose('?purpose=other'), null);
  assert.equal(selectedLandingPurpose('?purpose=equipment%26stock'), null);
  assert.equal(initialFormAfterSignIn(products, '?purpose=equipment').productId, 'investment');
  assert.equal(initialFormAfterSignIn([], '?purpose=equipment').productId, null);
});

test('partial authenticated history asks for missing expenses instead of calculating an incomplete form', () => {
  const history = ['purpose', 'requestedAmountRub', 'termMonths', 'monthlyRevenueRub'].map((field) => ({ field }));
  assert.deepEqual(chatProgress({ currentStep: 'complete', history }, true), { currentStep: 'monthlyExpensesRub', history });
});
