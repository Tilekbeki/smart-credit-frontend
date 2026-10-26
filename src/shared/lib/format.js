export const formatRub = (value) => value == null ? '—' : `${new Intl.NumberFormat('ru-RU').format(value)} ₽`;
export const formatDate = (value) => value ? new Date(value).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' }) : '—';
export const shortId = (id) => id?.slice(0, 8).toUpperCase() || '—';
