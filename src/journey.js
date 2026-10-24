// Client-facing interpretation of the implemented Go API. A checklist is a local
// guide; the backend remains the authority for submit validation and decisions.

const PURPOSES = new Set(['stock', 'expenses', 'seasonal', 'equipment', 'upgrade']);

const PHASES = [
  ['draft', 'Подготовка'],
  ['submitted', 'Отправка'],
  ['prechecks', 'Предварительные проверки'],
  ['scoring', 'Оценка'],
  ['decision', 'Решение'],
];

const STAGES = {
  draft: ['Черновик', 'Заполните данные и приложите документы. Банк увидит заявку только после отправки.', 0],
  submitted: ['Заявка отправлена', 'Заявка получена. Предварительные проверки ещё не завершены.', 1],
  prechecks: ['Идут предварительные проверки', 'Проверяются сведения о компании и кредитная история.', 2],
  awaiting_scoring: ['Ожидается оценка', 'Предварительные проверки завершены. Результат оценки ещё не сохранён.', 3],
  scoring: ['Идёт оценка', 'Оценка началась. Её результат ещё не сохранён; повторные попытки не означают отказ.', 3],
  awaiting_decision: ['Ожидается решение', 'Результат оценки сохранён. Кредитное решение ещё не опубликовано.', 4],
  manual_review: ['Рассматривает сотрудник банка', 'Заявка передана на ручное рассмотрение. Решение ещё не опубликовано.', 4],
  approved: ['Одобрена', 'Банк зарегистрировал решение об одобрении. Проверьте условия предложения, когда они станут доступны.', 4],
  counter_offer: ['Предложены другие условия', 'Банк зарегистрировал альтернативные условия. Подробности предложения пока недоступны в этом кабинете.', 4],
  rejected: ['Отказано', 'Банк зарегистрировал отказ. Подробности решения пока недоступны в этом кабинете.', 4],
  signed: ['Условия подтверждены', 'Условия подтверждены в рамках проекта. Этот статус не подтверждает выдачу средств.', 4],
  closed: ['Заявка закрыта', 'Клиент отклонил предложение; дальнейших действий по этой заявке нет.', 4],
  unknown: ['Статус уточняется', 'Обновите заявку, чтобы увидеть актуальное состояние.', -1],
};

const asItems = (value) => Array.isArray(value) ? value : Array.isArray(value?.items) ? value.items : [];
const hasValue = (value, minimum) => Number.isSafeInteger(value) && value >= minimum;

function checklistItem(id, label, complete, message) {
  return { id, label, state: complete ? 'done' : 'missing', message: complete ? '' : message };
}

/**
 * Check known submit requirements against a saved draft and uploaded document
 * metadata. readyToSubmit means only that no known client-side item is missing:
 * the server can still reject a product limit, company age or conditional bank
 * statement, and returns authoritative 422 details for those cases.
 */
export function getSubmitChecklist(application, documents = [], validationDetails = [], product = null, bankRelationship = 'unknown') {
  if (!application) return { items: [], readyToSubmit: false, conditional: false };

  const uploaded = new Set(asItems(documents).map((document) => document.documentType));
  const amountInRange = hasValue(application.requestedAmountRub, 1)
    && (!product || (application.requestedAmountRub >= product.minAmountRub && application.requestedAmountRub <= product.maxAmountRub));
  const termInRange = hasValue(application.termMonths, 1)
    && (!product || (application.termMonths >= product.minTermMonths && application.termMonths <= product.maxTermMonths));
  const items = [
    checklistItem('purpose', 'Поддерживаемая цель', PURPOSES.has(application.purpose) && (!product || product.purposes.includes(application.purpose)), 'Выберите цель, доступную для продукта.'),
    checklistItem('productId', 'Кредитный продукт', Boolean(application.productId), 'Выберите продукт для заявки.'),
    checklistItem('requestedAmountRub', 'Сумма', amountInRange, product ? `Допустимо от ${new Intl.NumberFormat('ru-RU').format(product.minAmountRub)} до ${new Intl.NumberFormat('ru-RU').format(product.maxAmountRub)} ₽.` : 'Укажите сумму в целых рублях.'),
    checklistItem('termMonths', 'Срок', termInRange, product ? `Допустимо от ${product.minTermMonths} до ${product.maxTermMonths} мес.` : 'Укажите срок в месяцах.'),
    checklistItem('monthlyRevenueRub', 'Выручка', hasValue(application.monthlyRevenueRub, 0), 'Укажите месячную выручку.'),
    checklistItem('monthlyExpensesRub', 'Расходы', hasValue(application.monthlyExpensesRub, 0), 'Укажите месячные расходы.'),
  ];

  if (application.productId === 'investment') {
    items.push(checklistItem('documents.EQUIPMENT_INVOICE', 'Счёт на оборудование', uploaded.has('EQUIPMENT_INVOICE'), 'Загрузите счёт на оборудование.'));
  } else if (application.productId === 'turnover') {
    if (bankRelationship === 'external_account') {
      items.push(checklistItem('documents.BANK_STATEMENT', 'Выписка из другого банка', uploaded.has('BANK_STATEMENT'), 'Загрузите выписку, чтобы подтвердить обороты.'));
    } else {
      items.push(uploaded.has('BANK_STATEMENT')
        ? { id: 'documents.BANK_STATEMENT', label: 'Выписка по счёту', state: 'done', message: '' }
        : { id: 'documents.BANK_STATEMENT', label: 'Выписка по счёту', state: 'conditional', message: 'Может понадобиться при отправке: это зависит от данных, доступных банку.' });
    }
  }

  for (const detail of asItems(validationDetails)) {
    if (!detail || typeof detail.field !== 'string') continue;
    const existing = items.find((item) => item.id === detail.field);
    if (existing) {
      existing.state = 'missing';
      existing.message = detail.message || 'Проверьте это поле.';
    } else {
      items.push({
        id: detail.field,
        label: detail.field === 'company.registrationDate' ? 'Срок работы компании' : 'Проверка заявки',
        state: 'missing',
        message: detail.message || 'Проверьте данные и попробуйте снова.',
      });
    }
  }

  return {
    items,
    readyToSubmit: application.status === 'draft' && items.every((item) => item.state !== 'missing'),
    conditional: items.some((item) => item.state === 'conditional'),
  };
}

/** Derive a truthful journey stage from the persisted status and event types. */
export function getJourneyStage(application, timeline = []) {
  const status = application?.status;
  const events = new Set(asItems(timeline).map((event) => event.eventType));
  let id;

  if (['manual_review', 'approved', 'counter_offer', 'rejected', 'signed', 'closed'].includes(status)) {
    id = status;
  } else if (status === 'draft') {
    id = 'draft';
  } else if (status === 'submitted' || status === 'processing') {
    if (events.has('SCORING_COMPLETED')) id = 'awaiting_decision';
    else if (events.has('SCORING_STARTED')) id = 'scoring';
    else if (events.has('PRECHECKS_COMPLETED')) id = 'awaiting_scoring';
    else if (status === 'processing' || events.has('PROCESSING_STARTED')) id = 'prechecks';
    else id = 'submitted';
  } else {
    id = 'unknown';
  }

  const [title, description, phaseIndex] = STAGES[id];
  const final = ['approved', 'counter_offer', 'rejected', 'signed', 'closed'].includes(id);
  return {
    id,
    title,
    description,
    steps: PHASES.map(([stepId, label], index) => ({
      id: stepId,
      label,
      state: final || index < phaseIndex ? 'done' : index === phaseIndex ? 'current' : 'upcoming',
    })),
  };
}

/** One actionable next step, or an explicit wait state where no action exists. */
export function getNextAction(application, timeline = [], documents = [], validationDetails = [], product = null, bankRelationship = 'unknown') {
  if (!application) return { kind: 'start', label: 'Начать заявку', description: 'Укажите цель, сумму и срок.' };

  if (application.status === 'draft') {
    const checklist = getSubmitChecklist(application, documents, validationDetails, product, bankRelationship);
    const missing = checklist.items.filter((item) => item.state === 'missing');
    const missingField = missing.find((item) => !item.id.startsWith('documents.'));
    const missingDocument = missing.find((item) => item.id.startsWith('documents.'));
    if (missingField?.id === 'company.registrationDate') {
      return { kind: 'review_eligibility', label: 'Проверить условия продукта', description: missingField.message, field: missingField.id };
    }
    if (missingField) return { kind: 'complete_draft', label: 'Дополнить заявку', description: missingField.message, field: missingField.id };
    if (missingDocument) return { kind: 'upload_document', label: 'Загрузить документ', description: missingDocument.message, field: missingDocument.id };
    return {
      kind: 'review_and_submit',
      label: 'Проверить и отправить',
      description: checklist.conditional
        ? 'Проверьте данные. При отправке сервис может запросить выписку по счёту.'
        : 'Проверьте данные и отправьте заявку на рассмотрение.',
    };
  }

  const stage = getJourneyStage(application, timeline);
  const waiting = {
    submitted: 'Ожидайте начала предварительных проверок.',
    prechecks: 'Предварительные проверки идут автоматически.',
    awaiting_scoring: 'Ожидайте начала оценки заявки.',
    scoring: 'Ожидайте сохранения результата оценки.',
    awaiting_decision: 'Ожидайте публикации кредитного решения.',
    manual_review: 'Ожидайте решения сотрудника банка.',
  };
  if (waiting[stage.id]) return { kind: 'wait', label: 'Следите за статусом', description: waiting[stage.id] };
  if (stage.id === 'approved' || stage.id === 'counter_offer') {
    return {
      kind: 'offer_unavailable',
      label: 'Ожидайте доступа к условиям',
      description: bankRelationship === 'external_account'
        ? 'Для выдачи понадобится счёт бизнеса в Альфа-Банке; открыть его можно после одобрения. Просмотр и принятие предложения пока недоступны.'
        : 'Просмотр и принятие предложения в этом кабинете пока недоступны.',
    };
  }
  if (stage.id === 'rejected') return { kind: 'decision_unavailable', label: 'Решение зарегистрировано', description: 'Подробности решения в этом кабинете пока недоступны.' };
  if (stage.id === 'signed' || stage.id === 'closed') return { kind: 'finished', label: 'Действий не требуется', description: stage.description };
  return { kind: 'refresh', label: 'Обновить заявку', description: stage.description };
}
