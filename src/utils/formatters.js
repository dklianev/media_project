export function formatMoney(value, locale = 'bg-BG') {
  return `$${Number(value || 0).toLocaleString(locale)}`;
}

export const SOFIA_TIME_ZONE = 'Europe/Sofia';

function normalizeUtcDateValue(value) {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : new Date(value.getTime());
  }

  const raw = String(value).trim();
  if (!raw) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return new Date(`${raw}T00:00:00Z`);
  }

  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}$/.test(raw)) {
    return new Date(`${raw.replace(' ', 'T')}:00Z`);
  }

  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}$/.test(raw)) {
    return new Date(`${raw.replace(' ', 'T')}Z`);
  }

  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeSofiaLocalValue(value) {
  if (!value) return null;

  const raw = String(value).trim().replace('T', ' ');
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!match) return null;

  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4] || '0'),
    minute: Number(match[5] || '0'),
    second: Number(match[6] || '0'),
  };
}

function partsToUtcProxyDate(parts) {
  if (!parts) return null;
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second));
}

function getSofiaDateTimeParts(value) {
  const date = normalizeUtcDateValue(value);
  if (!date) return null;

  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: SOFIA_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);

  const values = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
  };
}

function formatSofiaParts(parts, formatter) {
  const proxyDate = partsToUtcProxyDate(parts);
  if (!proxyDate) return '—';
  return formatter(proxyDate);
}

export function formatDate(value, locale = 'bg-BG', options = {}) {
  const date = normalizeUtcDateValue(value);
  if (!date) return '—';
  return date.toLocaleDateString(locale, { timeZone: SOFIA_TIME_ZONE, ...options });
}

export function formatDateTime(value, locale = 'bg-BG', options = {}) {
  const date = normalizeUtcDateValue(value);
  if (!date) return '—';
  return date.toLocaleString(locale, { timeZone: SOFIA_TIME_ZONE, ...options });
}

export function getSofiaDateKey(value = new Date()) {
  const parts = getSofiaDateTimeParts(value);
  if (!parts) return '';
  return `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

export function getSofiaDateTimeInputValue(value = new Date()) {
  const parts = getSofiaDateTimeParts(value);
  if (!parts) return '';
  return `${getSofiaDateKey(value)}T${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`;
}

export function formatSofiaLocalDate(value, locale = 'bg-BG', options = {}) {
  const parts = normalizeSofiaLocalValue(value);
  return formatSofiaParts(parts, (proxyDate) => proxyDate.toLocaleDateString(locale, { timeZone: 'UTC', ...options }));
}

export function formatSofiaLocalDateTime(value, locale = 'bg-BG', options = {}) {
  const parts = normalizeSofiaLocalValue(value);
  return formatSofiaParts(parts, (proxyDate) => proxyDate.toLocaleString(locale, { timeZone: 'UTC', ...options }));
}

export function getSofiaLocalDateKey(value) {
  const parts = normalizeSofiaLocalValue(value);
  if (!parts) return '';
  return `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

export function toSofiaLocalDateTimeInputValue(value) {
  const parts = normalizeSofiaLocalValue(value);
  if (!parts) return '';
  return `${getSofiaLocalDateKey(value)}T${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`;
}

export function isFutureSofiaLocalDateTime(value) {
  const normalizedValue = toSofiaLocalDateTimeInputValue(value);
  if (!normalizedValue) return false;
  return normalizedValue > getSofiaDateTimeInputValue(new Date());
}
