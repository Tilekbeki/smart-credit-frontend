import assert from 'node:assert/strict';
import test from 'node:test';
import { getJourneyStage, getNextAction, getSubmitChecklist } from '../src/journey.js';

const completeDraft = {
  status: 'draft',
  productId: 'investment',
  purpose: 'equipment',
  requestedAmountRub: 1_000_000,
  termMonths: 24,
  monthlyRevenueRub: 2_400_000,
  monthlyExpensesRub: 1_500_000,
};

test('investment draft needs an uploaded invoice before local submit readiness', () => {
  const missing = getSubmitChecklist(completeDraft, []);
  assert.equal(missing.readyToSubmit, false);
  assert.deepEqual(missing.items.find((item) => item.id === 'documents.EQUIPMENT_INVOICE'), {
    id: 'documents.EQUIPMENT_INVOICE',
    label: 'Счёт на оборудование',
    state: 'missing',
    message: 'Загрузите счёт на оборудование.',
  });
  assert.deepEqual(getNextAction(completeDraft).kind, 'upload_document');

  const uploaded = [{ documentType: 'EQUIPMENT_INVOICE', documentId: 'document-1' }];
  assert.equal(getSubmitChecklist(completeDraft, uploaded).readyToSubmit, true);
  assert.equal(getNextAction(completeDraft, [], uploaded).kind, 'review_and_submit');
});

test('turnover statement remains conditional until the server requires it', () => {
  const turnover = { ...completeDraft, productId: 'turnover', purpose: 'stock' };
  const beforeSubmit = getSubmitChecklist(turnover);
  assert.equal(beforeSubmit.readyToSubmit, true);
  assert.equal(beforeSubmit.conditional, true);
  assert.equal(beforeSubmit.items.find((item) => item.id === 'documents.BANK_STATEMENT').state, 'conditional');

  const details = [{
    field: 'documents.BANK_STATEMENT',
    code: 'required_document_missing',
    message: 'Загрузите выписку по счёту.',
  }];
  const after422 = getSubmitChecklist(turnover, [], details);
  assert.equal(after422.readyToSubmit, false);
  assert.equal(after422.items.find((item) => item.id === 'documents.BANK_STATEMENT').message, details[0].message);
  assert.deepEqual(getNextAction(turnover, [], [], details), {
    kind: 'upload_document',
    label: 'Загрузить документ',
    description: 'Загрузите выписку по счёту.',
    field: 'documents.BANK_STATEMENT',
  });
});

test('company without an Alfa account prepares external turnover evidence before submit', () => {
  const turnover = { ...completeDraft, productId: 'turnover', purpose: 'stock' };
  const withoutStatement = getSubmitChecklist(turnover, [], [], null, 'external_account');
  assert.equal(withoutStatement.readyToSubmit, false);
  assert.deepEqual(withoutStatement.items.find((item) => item.id === 'documents.BANK_STATEMENT'), {
    id: 'documents.BANK_STATEMENT',
    label: 'Выписка из другого банка',
    state: 'missing',
    message: 'Загрузите выписку, чтобы подтвердить обороты.',
  });
  assert.equal(getNextAction(turnover, [], [], [], null, 'external_account').kind, 'upload_document');
  assert.equal(getSubmitChecklist(turnover, [{ documentType: 'BANK_STATEMENT' }], [], null, 'external_account').readyToSubmit, true);
  const activeOffer = { offer: { status: 'active' } };
  assert.match(getNextAction({ status: 'approved' }, [], [], [], null, 'external_account', activeOffer).description, /фактической выдачи/);
});

test('missing fields and server-reported company age are actionable without claiming eligibility', () => {
  const incomplete = { ...completeDraft, productId: null, requestedAmountRub: null, monthlyRevenueRub: null };
  assert.equal(getSubmitChecklist(incomplete).readyToSubmit, false);
  assert.equal(getNextAction(incomplete).kind, 'complete_draft');
  assert.equal(getNextAction({ ...completeDraft, requestedAmountRub: null }).kind, 'complete_draft');

  const details = [{
    field: 'company.registrationDate',
    code: 'business_too_young',
    message: 'Компания работает меньше необходимого срока.',
  }];
  const checklist = getSubmitChecklist(completeDraft, [{ documentType: 'EQUIPMENT_INVOICE' }], details);
  assert.equal(checklist.readyToSubmit, false);
  assert.equal(checklist.items.at(-1).label, 'Срок работы компании');
  assert.equal(getNextAction(completeDraft, [], [{ documentType: 'EQUIPMENT_INVOICE' }], details).kind, 'review_eligibility');
});

test('unsupported other purpose can be drafted but is not presented as ready to submit', () => {
  const other = { ...completeDraft, productId: null, purpose: 'other', purposeDescription: 'Новая точка' };
  const checklist = getSubmitChecklist(other);
  assert.equal(checklist.readyToSubmit, false);
  assert.equal(checklist.items.find((item) => item.id === 'purpose').state, 'missing');
});

test('visible product limits prevent a late submit attempt with an invalid amount or term', () => {
  const turnover = { ...completeDraft, productId: 'turnover', purpose: 'stock', requestedAmountRub: 3_100_000, termMonths: 30 };
  const product = { id: 'turnover', purposes: ['stock', 'expenses'], minAmountRub: 100_000, maxAmountRub: 3_000_000, minTermMonths: 6, maxTermMonths: 24 };
  const checklist = getSubmitChecklist(turnover, [], [], product);
  assert.equal(checklist.readyToSubmit, false);
  assert.equal(checklist.items.find((item) => item.id === 'requestedAmountRub').state, 'missing');
  assert.equal(checklist.items.find((item) => item.id === 'termMonths').state, 'missing');
  assert.equal(getNextAction(turnover, [], [], [], product).kind, 'complete_draft');
});

test('timeline events advance the explanation without treating scoring as a loan decision', () => {
  const application = { status: 'processing' };
  const checks = [{ eventType: 'PRECHECKS_COMPLETED' }];
  const scoring = [...checks, { eventType: 'SCORING_STARTED' }];
  const stored = [...scoring, { eventType: 'SCORING_COMPLETED' }];

  assert.equal(getJourneyStage(application, []).id, 'prechecks');
  assert.equal(getJourneyStage(application, checks).id, 'awaiting_scoring');
  assert.equal(getJourneyStage(application, scoring).id, 'scoring');
  const afterScoring = getJourneyStage(application, stored);
  assert.equal(afterScoring.id, 'awaiting_decision');
  assert.match(afterScoring.description, /ещё не опубликовано/);
  assert.equal(afterScoring.steps.find((step) => step.id === 'scoring').state, 'done');
  assert.equal(afterScoring.steps.find((step) => step.id === 'decision').state, 'current');
  assert.equal(getNextAction(application, stored).kind, 'wait');
});

test('submitted, manual review and final statuses have truthful next steps', () => {
  assert.equal(getJourneyStage({ status: 'submitted' }).id, 'submitted');
  assert.equal(getNextAction({ status: 'manual_review' }).kind, 'wait');
  assert.equal(getNextAction({ status: 'approved' }, [], [], [], null, 'unknown', { offer: { status: 'active' } }).kind, 'review_offer');
  assert.equal(getNextAction({ status: 'counter_offer' }).kind, 'refresh');
  assert.equal(getNextAction({ status: 'rejected' }).kind, 'finished');
  const signed = getJourneyStage({ status: 'signed' });
  assert.match(signed.description, /не означает выдачу средств/);
  assert.equal(getNextAction({ status: 'closed' }).kind, 'finished');
});

test('live processing stage from the decision endpoint guides the timeline', () => {
  assert.equal(getJourneyStage({ status: 'processing' }, [], { processing: { stage: 'scoring' } }).id, 'scoring');
  assert.equal(getJourneyStage({ status: 'processing' }, [], { processing: { stage: 'decision' } }).id, 'awaiting_decision');
});
