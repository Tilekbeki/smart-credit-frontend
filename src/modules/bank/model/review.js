export const BANK_STATUSES = {
  submitted: 'Отправлена', processing: 'На проверке', manual_review: 'Ручное рассмотрение',
  approved: 'Одобрена', counter_offer: 'Другие условия', rejected: 'Отказано',
  signed: 'Условия приняты', closed: 'Закрыта',
};

export const canReview = (application) => application?.status === 'manual_review'
  && application.availableActions?.includes('decide');

export function prepareBankDecision(application, form) {
  if (!canReview(application)) throw new Error('Решение доступно только для заявки на ручном рассмотрении. Обновите её состояние.');
  if (!['approved', 'counter_offer', 'rejected'].includes(form.decision)) throw new Error('Выберите результат рассмотрения.');
  const comment = (form.internalComment ?? form.comment ?? '').trim();
  if (!comment || [...comment].length > 1000) throw new Error('Добавьте внутренний комментарий от 1 до 1000 символов.');
  const customerExplanation = (form.customerExplanation || '').trim();
  if ([...customerExplanation].length > 1000) throw new Error('Пояснение клиенту должно содержать не больше 1000 символов.');
  let offer = null;
  if (form.decision === 'approved') {
    offer = { amountRub: application.requestedAmountRub, termMonths: application.termMonths };
  }
  if (form.decision === 'counter_offer') {
    const amountRub = Number(form.amountRub);
    const termMonths = Number(form.termMonths);
    const terms = application.productTerms;
    if (!Number.isSafeInteger(amountRub) || amountRub < 1 || !Number.isSafeInteger(termMonths) || termMonths < 1) {
      throw new Error('Сумма и срок должны быть целыми положительными числами.');
    }
    if (amountRub > application.requestedAmountRub) throw new Error('Предложенная сумма не может превышать запрошенную.');
    if (amountRub === application.requestedAmountRub && termMonths === application.termMonths) throw new Error('Измените сумму или срок либо выберите одобрение исходных условий.');
    if (terms && (amountRub < terms.minAmountRub || amountRub > terms.maxAmountRub
      || termMonths < terms.minTermMonths || termMonths > terms.maxTermMonths)) {
      throw new Error('Сумма или срок выходят за пределы кредитного продукта.');
    }
    offer = { amountRub, termMonths };
  }
  return { version: application.version, decision: form.decision, internalComment: comment, customerExplanation, offer };
}
