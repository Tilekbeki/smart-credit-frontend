// Guests receive product orientation only. Personal limits and payments come from the API after sign-in.
export function guestRecommendation(purpose) {
  if (['stock', 'expenses', 'seasonal'].includes(purpose)) return {
    title: 'Для этой задачи подойдёт оборотный кредит',
    description: 'Он помогает закупать товары и сырьё, покрывать текущие расходы и готовиться к сезону.',
    next: 'Сравните срок кредита с тем, когда вложения вернутся в бизнес. Так будет проще спланировать возврат денег.',
  };
  if (['equipment', 'upgrade'].includes(purpose)) return {
    title: 'Рассмотрите инвестиционный кредит',
    description: 'Он подходит для покупки оборудования и модернизации бизнеса — вложений, которые окупаются постепенно.',
    next: 'Подготовьте счёт на оборудование и оцените, когда покупка начнёт приносить дополнительную выручку.',
  };
  return {
    title: 'Сначала уточним, во что вы вкладываете деньги',
    description: 'Для товаров и текущих расходов обычно выбирают оборотный кредит, для оборудования и модернизации — инвестиционный.',
    next: 'Измените цель выше на ближайший вариант. Это поможет подобрать продукт точнее.',
  };
}

export function chatProgress(value, authenticated) {
  if (!value?.currentStep || !Array.isArray(value.history)) return { currentStep: 'purpose', history: [] };
  if (authenticated && value.currentStep === 'complete' && !value.history.some((item) => item.field === 'monthlyRevenueRub')) {
    return { currentStep: 'monthlyRevenueRub', history: value.history };
  }
  return { currentStep: value.currentStep, history: value.history };
}

export function recommendationInput(form) {
  const input = { purpose: form.purpose };
  for (const field of ['requestedAmountRub', 'termMonths', 'monthlyRevenueRub', 'monthlyExpensesRub']) {
    const raw = String(form[field] ?? '').trim();
    const value = Number(raw);
    const minimum = ['requestedAmountRub', 'termMonths'].includes(field) ? 1 : 0;
    if (!raw || !Number.isSafeInteger(value) || value < minimum || value > (field === 'termMonths' ? 120 : 1e12)) {
      throw new Error('Проверьте сумму, срок, выручку и расходы. Все четыре значения нужны для расчёта.');
    }
    input[field] = value;
  }
  return input;
}

// A known draft is handed off to the cabinet even if submit fails: never create a second draft on retry.
export async function sendChatApplication(api, payload) {
  const draft = await api.createApplication(payload);
  try {
    const submitted = await api.submitApplication(draft.applicationId);
    return { application: { ...draft, ...submitted }, submitted: true, failure: null };
  } catch (failure) {
    return { application: draft, submitted: false, failure };
  }
}
