import { GOALS } from '../../credit/config.js';

const numericLimits = {
  requestedAmountRub: [1, 1e12],
  termMonths: [1, 120],
  monthlyRevenueRub: [0, 1e12],
  monthlyExpensesRub: [0, 1e12],
};
export const numericFields = Object.keys(numericLimits);

// A server reload can leave the visible form clean while a local conflict copy is pending.
export function canSubmitDraft(application, { hasUnsavedChanges, hasConflict, readyToSubmit }) {
  return application?.status === 'draft' && !hasUnsavedChanges && !hasConflict && readyToSubmit;
}

export function isValidNumericValue(field, value) {
  const limits = numericLimits[field];
  return Boolean(limits) && Number.isSafeInteger(value) && value >= limits[0] && value <= limits[1];
}

export const initialForm = () => ({
  productId: null,
  purpose: 'stock',
  purposeDescription: '',
  requestedAmountRub: '1000000',
  termMonths: '24',
  monthlyRevenueRub: '',
  monthlyExpensesRub: '',
});

export const formFromApplication = (application) => ({
  productId: application.productId,
  purpose: application.purpose || '',
  purposeDescription: application.purposeDescription || '',
  ...Object.fromEntries(numericFields.map((field) => [field, application[field] == null ? '' : String(application[field])])),
});

// An empty draft field is absent, not zero. Revenue and expenses may explicitly be zero.
export function payloadFromForm(form) {
  return {
    productId: form.productId || null,
    purpose: form.purpose || null,
    purposeDescription: String(form.purposeDescription ?? '').trim() || null,
    ...Object.fromEntries(numericFields.map((field) => {
      const raw = String(form[field] ?? '').trim();
      return [field, raw === '' ? null : Number(raw)];
    })),
  };
}

export function validateForm(form, { forRecommendation = false } = {}) {
  for (const field of numericFields) {
    const raw = String(form[field] ?? '').trim();
    if (forRecommendation && !raw) return 'Укажите сумму, срок, выручку и расходы для подбора.';
    if (raw && !isValidNumericValue(field, Number(raw))) {
      return 'Проверьте сумму и срок: нужны целые значения в допустимых пределах. Выручка и расходы могут быть нулевыми.';
    }
  }
  const description = String(form.purposeDescription ?? '').trim();
  if ([...description].length > 300 || description.includes('\0')) return 'Описание задачи должно быть не длиннее 300 символов и не содержать нулевой символ.';
  return '';
}

export function recommendationInput(form) {
  const error = validateForm(form, { forRecommendation: true });
  if (error) throw new Error(error);
  const payload = payloadFromForm(form);
  return { purpose: payload.purpose, ...Object.fromEntries(numericFields.map((field) => [field, payload[field]])) };
}

export function selectedLandingPurpose(search) {
  const value = new URLSearchParams(search).get('purpose');
  return GOALS.some(([id]) => id === value && id !== 'other') ? value : null;
}

export function initialFormAfterSignIn(products, search) {
  const form = initialForm();
  const purpose = selectedLandingPurpose(search);
  if (!purpose) return form;
  form.purpose = purpose;
  const preferredProductId = purpose === 'equipment' ? 'investment' : purpose === 'stock' ? 'turnover' : null;
  if (products.some((product) => product.id === preferredProductId && product.purposes?.includes(purpose))) form.productId = preferredProductId;
  return form;
}
