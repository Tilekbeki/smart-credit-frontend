import { isValidNumericValue } from '../../applications/model/form.js';

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
  if (authenticated && value.currentStep === 'complete') {
    const missing = ['monthlyRevenueRub', 'monthlyExpensesRub'].find((field) => !value.history.some((item) => item.field === field));
    if (missing) return { currentStep: missing, history: value.history };
  }
  return { currentStep: value.currentStep, history: value.history };
}

export function parseChatNumber(raw, field) {
  let value = String(raw).trim().toLocaleLowerCase('ru-RU').replace(/\s|₽/g, '');
  if (field === 'termMonths') value = value.replace(/мес(?:яц(?:ев|а)?)?\.?$/, '');
  const match = value.match(/^(\d+(?:[.,]\d+)?)(млн\.?|тыс(?:яч)?\.?)?$/);
  if (!match) return null;
  const multiplier = match[2]?.startsWith('млн') ? 1000000 : match[2] ? 1000 : 1;
  const number = Number(match[1].replace(',', '.')) * multiplier;
  return isValidNumericValue(field, number) ? number : null;
}
