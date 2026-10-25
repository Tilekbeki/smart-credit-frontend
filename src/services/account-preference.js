export const accountPath = (value) => ['alfa_account', 'external_account'].includes(value) ? value : 'unknown';
export const storedAccountPath = (companyId) => {
  try { return accountPath(localStorage.getItem(`smart-credit-account:${companyId}`)); }
  catch { return 'unknown'; }
};

export function saveAccountPath(companyId, value) {
  try { localStorage.setItem(`smart-credit-account:${companyId}`, accountPath(value)); }
  catch { /* The optional preference still works in memory. */ }
}
