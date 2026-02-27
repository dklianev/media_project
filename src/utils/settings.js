import { api } from './api';

const SETTINGS_CACHE_KEY = 'public_settings_cache_v1';
const SETTINGS_CACHE_TTL_MS = 60 * 1000;
let memoryCache = null;
let memoryCacheAt = 0;
let inflight = null;

function readSessionCache() {
  try {
    const raw = sessionStorage.getItem(SETTINGS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    if (Date.now() - Number(parsed.at || 0) > SETTINGS_CACHE_TTL_MS) return null;
    return parsed.data || null;
  } catch {
    return null;
  }
}

function writeSessionCache(data) {
  try {
    sessionStorage.setItem(SETTINGS_CACHE_KEY, JSON.stringify({ at: Date.now(), data }));
  } catch {
    // ignore storage failures
  }
}

export async function getPublicSettings(force = false) {
  if (!force && memoryCache && Date.now() - memoryCacheAt < SETTINGS_CACHE_TTL_MS) {
    return memoryCache;
  }

  if (!force) {
    const cached = readSessionCache();
    if (cached) {
      memoryCache = cached;
      memoryCacheAt = Date.now();
      return cached;
    }
  }

  if (inflight && !force) return inflight;

  inflight = api.get('/settings/public')
    .then((result) => {
      memoryCache = result || {};
      memoryCacheAt = Date.now();
      writeSessionCache(memoryCache);
      return memoryCache;
    })
    .finally(() => {
      inflight = null;
    });

  return inflight;
}
