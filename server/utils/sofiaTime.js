export const SOFIA_TIME_ZONE = 'Europe/Sofia';

function getSofiaParts(date) {
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

  return Object.fromEntries(
    parts
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value])
  );
}

function pad(value) {
  return String(value).padStart(2, '0');
}

function toDbTimestamp(parts) {
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

export function getCurrentSofiaDbTimestamp(date = new Date()) {
  return toDbTimestamp(getSofiaParts(date));
}

export function getShiftedSofiaDbTimestamp(days = 0, baseDate = new Date()) {
  const shifted = new Date(baseDate.getTime() + days * 24 * 60 * 60 * 1000);
  return getCurrentSofiaDbTimestamp(shifted);
}

export function normalizePublishedAtToSofia(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;

  const explicitTimezone = /(?:Z|[+-]\d{2}:\d{2})$/i.test(raw);
  if (explicitTimezone) {
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : getCurrentSofiaDbTimestamp(parsed);
  }

  const cleaned = raw
    .replace('T', ' ')
    .replace(/\.\d+/, '')
    .trim();

  const match = cleaned.match(/^(\d{4}-\d{2}-\d{2}) (\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return null;

  return `${match[1]} ${match[2]}:${match[3]}:${match[4] || '00'}`;
}
