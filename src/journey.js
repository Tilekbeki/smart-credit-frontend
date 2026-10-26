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
  processing_failed: ['Проверка временно остановилась', 'Обработка остановлена из-за технической ошибки. Требуется проверка на стороне банка; это не отказ по кредиту.', -1],
  awaiting_decision: ['Ожидается решение', 'Результат оценки сохранён. Кредитное решение ещё не опубликовано.', 4],
  manual_review: ['Рассматривает сотрудник банка', 'Заявка передана на ручное рассмотрение. Решение ещё не опубликовано.', 4],
  approved: ['Одобрена', 'Решение готово. Проверьте предложение банка и выберите дальнейшее действие.', 4],
  counter_offer: ['Предложены другие условия', 'Банк предложил другие сумму или срок. Сравните условия с вашей заявкой.', 4],
  rejected: ['Отказано', 'Решение готово. Причины указаны ниже в ответе банка.', 4],
  signed: ['Условия подтверждены', 'Вы подтвердили учебные условия. Этот статус не означает выдачу средств.', 4],
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
      items.push({ id: 'documents.BANK_STATEMENT', label: 'Выписка из другого банка', state: uploaded.has('BANK_STATEMENT') ? 'done' : 'conditional', message: uploaded.has('BANK_STATEMENT') ? '' : 'Подготовьте выписку. Сервис проверит необходимость документа при отправке.' });
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
export function getJourneyStage(application, timeline = [], creditDecision = null) {
  const status = application?.status;
  const events = new Set(asItems(timeline).map((event) => event.eventType));
  const processingStage = creditDecision?.processing?.stage;
  let id;

  if (['manual_review', 'approved', 'counter_offer', 'rejected', 'signed', 'closed'].includes(status)) {
    id = status;
  } else if (status === 'draft') {
    id = 'draft';
  } else if (status === 'submitted' || status === 'processing') {
    if (creditDecision?.processing?.state === 'failed') id = 'processing_failed';
    else if (processingStage === 'decision' || events.has('SCORING_COMPLETED')) id = 'awaiting_decision';
    else if (processingStage === 'scoring') id = 'scoring';
    else if (events.has('SCORING_STARTED')) id = 'scoring';
    else if (events.has('PRECHECKS_COMPLETED')) id = 'awaiting_scoring';
    else if (status === 'processing' || events.has('PROCESSING_STARTED')) id = 'prechecks';
    else id = 'submitted';
  } else {
    id = 'unknown';
  }

  const [title, description, stagePhaseIndex] = STAGES[id];
  const phaseIndex = id === 'processing_failed'
    ? ({ prechecks: 2, scoring: 3, decision: 4 }[processingStage] ?? -1) : stagePhaseIndex;
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
export function getNextAction(application, timeline = [], documents = [], validationDetails = [], product = null, bankRelationship = 'unknown', creditDecision = null) {
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

  const stage = getJourneyStage(application, timeline, creditDecision);
  const waiting = {
    processing_failed: 'Повторно заполнять заявку не нужно. Техническую причину должен устранить банк.',
    submitted: 'Ожидайте начала предварительных проверок.',
    prechecks: 'Предварительные проверки идут автоматически.',
    awaiting_scoring: 'Ожидайте начала оценки заявки.',
    scoring: 'Ожидайте сохранения результата оценки.',
    awaiting_decision: 'Ожидайте публикации кредитного решения.',
    manual_review: 'Ожидайте решения сотрудника банка.',
  };
  if (waiting[stage.id]) return { kind: 'wait', label: stage.id === 'processing_failed' ? 'Ожидается техническая проверка' : 'Следите за статусом', description: waiting[stage.id] };
  if (stage.id === 'approved' || stage.id === 'counter_offer') {
    return {
      kind: creditDecision?.offer?.status === 'active' ? 'review_offer' : 'refresh',
      label: creditDecision?.offer?.status === 'active' ? 'Рассмотреть предложение' : 'Обновить предложение',
      description: creditDecision?.offer?.status === 'active'
        ? bankRelationship === 'external_account'
          ? 'Проверьте сумму, срок и платёж. Для фактической выдачи понадобится счёт бизнеса в Альфа-Банке.'
          : 'Проверьте сумму, срок и платёж, затем примите или отклоните условия.'
        : 'Актуальные условия пока не загрузились. Обновите заявку.',
    };
  }
  if (stage.id === 'rejected') return { kind: 'finished', label: 'Решение банка', description: 'Причины решения приведены ниже. Действий по этой заявке больше нет.' };
  if (stage.id === 'signed' || stage.id === 'closed') return { kind: 'finished', label: 'Действий не требуется', description: stage.description };
  return { kind: 'refresh', label: 'Обновить заявку', description: stage.description };
}
