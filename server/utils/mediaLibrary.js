import sharp from 'sharp';
import { promises as fs } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import db from '../db.js';

const MANAGED_UPLOAD_URL_REGEX = /^\/uploads\/[A-Za-z0-9][A-Za-z0-9._/-]*$/;
const __dirname = dirname(fileURLToPath(import.meta.url));
const uploadsDir = resolve(__dirname, '..', '..', 'public', 'uploads');
const SETTINGS_LABELS = {
  hero_image: 'Начален банер',
  site_logo: 'Лого',
  site_favicon: 'Favicon',
};

function toNullableInt(value) {
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function normalizeFileList(filesLike) {
  if (!filesLike) return [];
  if (Array.isArray(filesLike)) return filesLike.filter(Boolean);
  if (filesLike.file) return [filesLike.file].filter(Boolean);
  if (filesLike.files && Array.isArray(filesLike.files)) return filesLike.files.filter(Boolean);
  if (typeof filesLike === 'object') {
    return Object.values(filesLike)
      .flatMap((value) => (Array.isArray(value) ? value : [value]))
      .filter((file) => file && file.filename);
  }
  return [];
}

export function normalizeManagedMediaUrl(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  if (!MANAGED_UPLOAD_URL_REGEX.test(raw)) return null;
  if (raw.includes('..') || raw.includes('//')) return null;
  return raw;
}

export function parseManagedMediaUrlList(value, { maxItems = 5 } = {}) {
  if (value === undefined) {
    return { provided: false, urls: [] };
  }

  const raw = String(value ?? '').trim();
  if (!raw) {
    return { provided: true, urls: [] };
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { provided: true, error: 'Невалиден списък със снимки' };
  }

  if (!Array.isArray(parsed)) {
    return { provided: true, error: 'Невалиден списък със снимки' };
  }

  if (parsed.length > maxItems) {
    return { provided: true, error: `Можеш да избереш до ${maxItems} снимки` };
  }

  const urls = [];
  for (const item of parsed) {
    const url = normalizeManagedMediaUrl(item);
    if (!url) {
      return { provided: true, error: 'Списъкът със снимки съдържа невалиден URL' };
    }
    urls.push(url);
  }

  return { provided: true, urls };
}

export async function registerUploadedMedia(req, filesLike, options = {}) {
  const files = normalizeFileList(filesLike);
  if (files.length === 0) return [];

  const source = String(options.source || 'upload').slice(0, 80);
  const insert = db.prepare(`
    INSERT OR IGNORE INTO media_assets (
      original_name,
      stored_name,
      url,
      mime_type,
      size_bytes,
      width,
      height,
      source,
      created_by
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const selectByUrl = db.prepare('SELECT * FROM media_assets WHERE url = ?');

  const items = [];
  for (const file of files) {
    const url = normalizeManagedMediaUrl(`/uploads/${file.filename}`);
    if (!url) continue;

    let width = null;
    let height = null;
    try {
      const metadata = await sharp(file.path, { failOn: 'none' }).metadata();
      width = toNullableInt(metadata.width);
      height = toNullableInt(metadata.height);
    } catch {
      width = null;
      height = null;
    }

    insert.run(
      String(file.originalname || file.filename || 'image').slice(0, 255),
      String(file.filename || '').slice(0, 255),
      url,
      String(file.mimetype || 'application/octet-stream').slice(0, 120),
      Math.max(0, Number(file.size || 0)),
      width,
      height,
      source,
      req?.user?.id ?? null
    );

    const stored = selectByUrl.get(url);
    if (stored) items.push(stored);
  }

  return items;
}

function formatEpisodeUsageLabel(item) {
  const episodeNumber = Number.isFinite(Number(item.episode_number))
    ? `Еп. ${Number(item.episode_number)}`
    : 'Епизод';
  const title = String(item.title || '').trim();
  const production = String(item.production_title || '').trim();
  return [production, `${episodeNumber}${title ? `: ${title}` : ''}`].filter(Boolean).join(' / ');
}

function formatSettingUsageLabel(key) {
  return SETTINGS_LABELS[key] || key;
}

export function getMediaAssetById(id) {
  return db.prepare('SELECT * FROM media_assets WHERE id = ?').get(id);
}

export function getMediaAssetUsage(url) {
  const usages = [];

  const productionThumbnails = db.prepare(`
    SELECT id, title, slug
    FROM productions
    WHERE thumbnail_url = ?
    ORDER BY id DESC
  `).all(url);
  for (const item of productionThumbnails) {
    usages.push({
      type: 'production.thumbnail',
      entity_type: 'production',
      entity_id: item.id,
      label: String(item.title || item.slug || `Production #${item.id}`),
      location: 'Каталог корица',
    });
  }

  const productionCovers = db.prepare(`
    SELECT id, title, slug
    FROM productions
    WHERE cover_image_url = ?
    ORDER BY id DESC
  `).all(url);
  for (const item of productionCovers) {
    usages.push({
      type: 'production.cover',
      entity_type: 'production',
      entity_id: item.id,
      label: String(item.title || item.slug || `Production #${item.id}`),
      location: 'Голямо изображение',
    });
  }

  const episodeThumbnailMatches = db.prepare(`
    SELECT e.id, e.title, e.episode_number, p.title as production_title
    FROM episodes e
    JOIN productions p ON p.id = e.production_id
    WHERE e.thumbnail_url = ?
    ORDER BY e.id DESC
  `).all(url);
  for (const item of episodeThumbnailMatches) {
    usages.push({
      type: 'episode.thumbnail',
      entity_type: 'episode',
      entity_id: item.id,
      label: formatEpisodeUsageLabel(item),
      location: 'Кадър',
    });
  }

  const episodeBannerMatches = db.prepare(`
    SELECT e.id, e.title, e.episode_number, p.title as production_title
    FROM episodes e
    JOIN productions p ON p.id = e.production_id
    WHERE e.ad_banner_url = ?
    ORDER BY e.id DESC
  `).all(url);
  for (const item of episodeBannerMatches) {
    usages.push({
      type: 'episode.ad_banner',
      entity_type: 'episode',
      entity_id: item.id,
      label: formatEpisodeUsageLabel(item),
      location: 'Банер',
    });
  }

  const sideImageCandidates = db.prepare(`
    SELECT e.id, e.title, e.episode_number, e.side_images, p.title as production_title
    FROM episodes e
    JOIN productions p ON p.id = e.production_id
    WHERE e.side_images LIKE ?
    ORDER BY e.id DESC
  `).all(`%${url}%`);
  for (const item of sideImageCandidates) {
    try {
      const sideImages = JSON.parse(item.side_images || '[]');
      if (!Array.isArray(sideImages) || !sideImages.includes(url)) continue;
      usages.push({
        type: 'episode.side_image',
        entity_type: 'episode',
        entity_id: item.id,
        label: formatEpisodeUsageLabel(item),
        location: 'Странично изображение',
      });
    } catch {
      // Ignore malformed legacy values when building usage info.
    }
  }

  const settingsMatches = db.prepare(`
    SELECT key
    FROM site_settings
    WHERE value = ?
    ORDER BY key ASC
  `).all(url);
  for (const item of settingsMatches) {
    usages.push({
      type: 'site_setting',
      entity_type: 'site_setting',
      entity_id: item.key,
      label: formatSettingUsageLabel(item.key),
      location: 'Настройки',
    });
  }

  return {
    in_use: usages.length > 0,
    usage_count: usages.length,
    usages,
  };
}

export function enrichMediaAsset(asset) {
  if (!asset) return null;
  return {
    ...asset,
    ...getMediaAssetUsage(asset.url),
  };
}

export function enrichMediaAssets(items) {
  return Array.isArray(items) ? items.map((item) => enrichMediaAsset(item)) : [];
}

export function renameMediaAsset(id, originalName) {
  const nextName = String(originalName || '').trim();
  if (!nextName) {
    return { error: 'Името е задължително' };
  }
  if (nextName.length > 255) {
    return { error: 'Името е твърде дълго' };
  }

  const existing = getMediaAssetById(id);
  if (!existing) {
    return { error: 'Файлът не е намерен', status: 404 };
  }

  db.prepare(`
    UPDATE media_assets
    SET original_name = ?
    WHERE id = ?
  `).run(nextName, id);

  return {
    item: enrichMediaAsset(getMediaAssetById(id)),
    previous_name: existing.original_name,
  };
}

function resolveStoredFilePath(storedName) {
  const normalized = String(storedName || '').trim();
  if (!normalized || normalized.includes('..') || normalized.includes('/') || normalized.includes('\\')) {
    return null;
  }
  return resolve(uploadsDir, normalized);
}

async function unlinkFileWithRetry(filePath, attempts = 4) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      await fs.unlink(filePath);
      return;
    } catch (err) {
      if (err?.code === 'ENOENT') {
        return;
      }
      const shouldRetry = err?.code === 'EBUSY' || err?.code === 'EPERM';
      if (!shouldRetry || attempt === attempts - 1) {
        throw err;
      }
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 80 * (attempt + 1)));
    }
  }
}

function scheduleDeferredCleanup(filePath) {
  const timer = setTimeout(() => {
    unlinkFileWithRetry(filePath, 8).catch(() => {});
  }, 600);
  timer.unref?.();
}

export async function deleteMediaAsset(id) {
  const existing = getMediaAssetById(id);
  if (!existing) {
    return { error: 'Файлът не е намерен', status: 404 };
  }

  const usage = getMediaAssetUsage(existing.url);
  if (usage.in_use) {
    return {
      error: 'Файлът се използва и не може да бъде изтрит',
      status: 409,
      ...usage,
    };
  }

  const filePath = resolveStoredFilePath(existing.stored_name);
  let cleanupPending = false;
  if (filePath) {
    try {
      await unlinkFileWithRetry(filePath);
    } catch (err) {
      const isTransientLock = err?.code === 'EBUSY' || err?.code === 'EPERM';
      if (!isTransientLock) {
        throw err;
      }
      cleanupPending = true;
      scheduleDeferredCleanup(filePath);
    }
  }

  db.prepare('DELETE FROM media_assets WHERE id = ?').run(id);
  return {
    item: existing,
    deleted: true,
    cleanup_pending: cleanupPending,
  };
}
