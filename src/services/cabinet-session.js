import { ApiError } from '../api.js';

export async function loadCabinetSession(api, accessToken) {
  // Make requests with the token, but persist only after the caller accepts the verified session.
  api.setAccessToken(accessToken, { persist: false });
  const user = await api.getMe();
  if (user.role === 'BANK_EMPLOYEE') return { accessToken, user, company: null, products: [], applications: [], total: 0 };
  if (user.role !== 'CLIENT' || !user.companyId) {
    throw new ApiError('Не удалось подтвердить доступ к кабинету. Войдите ещё раз.', { code: 'invalid_session', status: 401 });
  }
  const [company, productList, page] = await Promise.all([
    api.getCompany(user.companyId), api.getCreditProducts(), api.listApplications({ limit: 20, offset: 0 }),
  ]);
  return { accessToken, user, company, products: productList.items || [], applications: page.items || [], total: page.total || 0 };
}
