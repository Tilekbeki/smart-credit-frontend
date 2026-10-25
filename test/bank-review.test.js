import assert from 'node:assert/strict';
import test from 'node:test';
import { canReview, prepareBankDecision } from '../src/bank-review.js';

const application = {
  applicationId: 'test-application', status: 'manual_review', version: 4, availableActions: ['decide'],
  requestedAmountRub: 1000000, termMonths: 24,
  productTerms: { minAmountRub: 100000, maxAmountRub: 5000000, minTermMonths: 6, maxTermMonths: 36 },
};
const form = { decision: 'approved', comment: ' Проверены документы. ', amountRub: '800000', termMonths: '18' };

test('employee approval keeps requested terms; rejection sends explicit null offer', () => {
  assert.deepEqual(prepareBankDecision(application, form), {
    version: 4, decision: 'approved', internalComment: 'Проверены документы.', customerExplanation: '', offer: { amountRub: 1000000, termMonths: 24 },
  });
  assert.deepEqual(prepareBankDecision(application, { ...form, decision: 'rejected' }), {
    version: 4, decision: 'rejected', internalComment: 'Проверены документы.', customerExplanation: '', offer: null,
  });
});

test('public explanation is separate from the internal comment and is validated before sending', () => {
  const result = prepareBankDecision(application, { ...form, internalComment: '  Внутренний анализ  ', customerExplanation: '  Предлагаем исходные условия.  ' });
  assert.equal(result.internalComment, 'Внутренний анализ');
  assert.equal(result.customerExplanation, 'Предлагаем исходные условия.');
  assert.ok(!('comment' in result));
  assert.throws(() => prepareBankDecision(application, { ...form, customerExplanation: 'а'.repeat(1001) }));
});

test('manual decision needs both review status and server permission and an internal reason', () => {
  for (const changed of [{ status: 'approved' }, { availableActions: [] }]) {
    assert.ok(!canReview({ ...application, ...changed }));
    assert.throws(() => prepareBankDecision({ ...application, ...changed }, form));
  }
  assert.throws(() => prepareBankDecision(application, { ...form, comment: '   ' }));
  assert.throws(() => prepareBankDecision(application, { ...form, comment: 'а'.repeat(1001) }));
  assert.throws(() => prepareBankDecision(application, { ...form, decision: 'signed' }));
});

test('counteroffer changes conditions within product limits and never increases requested amount', () => {
  const counter = { ...form, decision: 'counter_offer' };
  assert.deepEqual(prepareBankDecision(application, counter).offer, { amountRub: 800000, termMonths: 18 });
  for (const changed of [
    { amountRub: '1000001' }, { amountRub: '1000000', termMonths: '24' },
    { amountRub: '90000' }, { termMonths: '37' }, { termMonths: '5' },
    { amountRub: '' }, { amountRub: '1.5' }, { termMonths: 'NaN' },
  ]) assert.throws(() => prepareBankDecision(application, { ...counter, ...changed }));
});
