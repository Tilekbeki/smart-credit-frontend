const API_ROOT = '/api/v1';

export async function requestApi(path, options = {}) {
  let response;
  try {
    response = await fetch(`${API_ROOT}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
  } catch {
    throw new Error('Не удалось связаться с сервисом заявок. Проверьте, что backend и scoring запущены.');
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error('Сервис заявок вернул некорректный ответ. Попробуйте ещё раз.');
  }
  if (!response.ok) {
    const error = new Error(payload.message || 'Не удалось выполнить действие. Попробуйте ещё раз.');
    error.status = response.status;
    throw error;
  }
  return payload;
}

export const createApplication = (data) => requestApi('/applications', { method: 'POST', body: JSON.stringify(data) });
export const getApplication = (id) => requestApi(`/applications/${encodeURIComponent(id)}`);
export const evaluateApplication = (id) => requestApi(`/applications/${encodeURIComponent(id)}/evaluate`, { method: 'POST', body: '{}' });
export const acceptApplication = (id) => requestApi(`/applications/${encodeURIComponent(id)}/accept`, { method: 'POST', body: JSON.stringify({ accepted: true }) });
export const disburseApplication = (id) => requestApi(`/applications/${encodeURIComponent(id)}/disburse`, { method: 'POST', body: '{}' });
