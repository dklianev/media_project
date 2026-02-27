export function formatMoney(value, locale = 'bg-BG') {
  return `$${Number(value || 0).toLocaleString(locale)}`;
}

export function formatDate(value, locale = 'bg-BG') {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(locale);
}

export function formatDateTime(value, locale = 'bg-BG') {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(locale);
}
