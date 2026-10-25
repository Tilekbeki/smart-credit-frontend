import { clearStoredSession, storeSession } from './services/session-storage.js';

const API_ROOT = '/api/v1';

let accessToken = null;
let unauthorizedHandler = null;

export class ApiError extends Error {
  constructor(message, { status = 0, code = 'request_failed', details = [] } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = Array.isArray(details) ? details : [];
  }
}

// The backend has no refresh operation. Remember a verified token until it expires or the user signs out.
export function setAccessToken(token, { persist = true } = {}) {
  accessToken = typeof token === 'string' && token.length > 0 ? token : null;
  if (persist) {
    if (accessToken) storeSession(accessToken);
    else clearStoredSession();
  }
}

export function getAccessToken() {
  return accessToken;
}

export function setUnauthorizedHandler(handler) {
  unauthorizedHandler = typeof handler === 'function' ? handler : null;
}

async function readJson(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

export async function requestApi(path, options = {}) {
  const { auth = true, responseType = 'json', ...fetchOptions } = options;
  const headers = new Headers(fetchOptions.headers);
  const tokenForRequest = auth ? accessToken : null;

  if (tokenForRequest) headers.set('Authorization', `Bearer ${tokenForRequest}`);

  let response;
  try {
    response = await fetch(`${API_ROOT}${path}`, { ...fetchOptions, headers });
  } catch (cause) {
    if (cause?.name === 'AbortError') throw cause;
    throw new ApiError('Не удалось связаться с сервисом. Проверьте соединение и попробуйте ещё раз.', {
      code: 'network_error',
    });
  }

  if (!response.ok) {
    let payload;
    try {
      payload = await readJson(response);
    } catch {
      payload = undefined;
    }

    if (response.status === 401 && auth && tokenForRequest && accessToken === tokenForRequest) {
      setAccessToken(null);
      try {
        unauthorizedHandler?.();
      } catch {
        // UI notification must never hide the original HTTP error.
      }
    }

    throw new ApiError(
      typeof payload?.message === 'string' && payload.message
        ? payload.message
        : 'Не удалось выполнить действие. Попробуйте ещё раз.',
      {
        status: response.status,
        code: typeof payload?.error === 'string' ? payload.error : 'http_error',
        details: payload?.details,
      },
    );
  }

  if (responseType === 'blob') return response.blob();
  if (response.status === 204) return null;

  let payload;
  try {
    payload = await readJson(response);
  } catch {
    payload = undefined;
  }
  if (payload === undefined || payload === null) {
    throw new ApiError('Сервис вернул некорректный ответ. Попробуйте ещё раз.', {
      status: response.status,
      code: 'invalid_response',
    });
  }
  return payload;
}

function jsonRequest(path, method, data, options = {}) {
  return requestApi(path, {
    ...options,
    method,
    headers: { 'Content-Type': 'application/json', ...options.headers },
    body: JSON.stringify(data),
  });
}

const pathId = (id) => encodeURIComponent(String(id));
const applicationPath = (id) => `/applications/${pathId(id)}`;

export const getProfiles = () => requestApi('/demo/profiles', { auth: false });
export const requestOtp = (profileId) => jsonRequest('/auth/otp/request', 'POST', { profileId }, { auth: false });
export const verifyOtp = (otpRequestId, code) =>
  jsonRequest('/auth/otp/verify', 'POST', { otpRequestId, code }, { auth: false });

export const getMe = () => requestApi('/me');
export const updateMe = (patch) => jsonRequest('/me', 'PATCH', patch);
export const getCompany = (companyId) => requestApi(`/companies/${pathId(companyId)}`);
export const updateCompanyContacts = (companyId, patch) => jsonRequest(`/companies/${pathId(companyId)}`, 'PATCH', patch);
export const getCreditProducts = () => requestApi('/credit-products');
export const getCreditProduct = (productId) => requestApi(`/credit-products/${pathId(productId)}`);
export const getRecommendations = (data) => jsonRequest('/recommendations', 'POST', data);

export const createApplication = (data = {}) => jsonRequest('/applications', 'POST', data);
export function listApplications({ status, limit, offset } = {}) {
  const query = new URLSearchParams();
  if (status !== undefined && status !== null) query.set('status', status);
  if (limit !== undefined && limit !== null) query.set('limit', String(limit));
  if (offset !== undefined && offset !== null) query.set('offset', String(offset));
  return requestApi(`/applications${query.size ? `?${query}` : ''}`);
}
export const getApplication = (id) => requestApi(applicationPath(id));
export const updateApplication = (id, patch) => jsonRequest(applicationPath(id), 'PATCH', patch);
export const deleteApplication = (id, version) => requestApi(`${applicationPath(id)}?version=${encodeURIComponent(version)}`, { method: 'DELETE' });
export const getApplicationTimeline = (id) => requestApi(`${applicationPath(id)}/timeline`);
export const getApplicationDecision = (id) => requestApi(`${applicationPath(id)}/decision`);

function offerAction(id, action, { version, offerId }, idempotencyKey) {
  return jsonRequest(`${applicationPath(id)}/${action}`, 'POST', { version, offerId }, {
    headers: { 'Idempotency-Key': idempotencyKey },
  });
}

export const acceptOffer = (id, input, idempotencyKey) => offerAction(id, 'accept', input, idempotencyKey);
export const declineOffer = (id, input, idempotencyKey) => offerAction(id, 'decline', input, idempotencyKey);

export function uploadDocument(id, documentType, file) {
  const body = new FormData();
  body.append('documentType', documentType);
  body.append('file', file);
  // Do not set Content-Type: fetch adds the multipart boundary.
  return requestApi(`${applicationPath(id)}/documents`, { method: 'POST', body });
}

export const listDocuments = (id) => requestApi(`${applicationPath(id)}/documents`);
export const downloadDocument = (id, documentId) =>
  requestApi(`${applicationPath(id)}/documents/${pathId(documentId)}`, { responseType: 'blob' });

// Submit rejects even an empty JSON body; it also needs no Idempotency-Key.
export const submitApplication = (id) => requestApi(`${applicationPath(id)}/submit`, { method: 'POST' });

const bankApplicationPath = (id) => `/bank/applications/${pathId(id)}`;
export function listBankApplications({ status, companyId, limit, offset } = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries({ status, companyId, limit, offset })) {
    if (value !== undefined && value !== null && value !== '') query.set(key, String(value));
  }
  return requestApi(`/bank/applications${query.size ? `?${query}` : ''}`);
}
export const getBankApplication = (id) => requestApi(bankApplicationPath(id));
export const getBankAssessment = (id) => requestApi(`${bankApplicationPath(id)}/assessment`);
export const makeBankDecision = (id, input, idempotencyKey) =>
  jsonRequest(`${bankApplicationPath(id)}/decisions`, 'POST', input, {
    headers: { 'Idempotency-Key': idempotencyKey },
  });
