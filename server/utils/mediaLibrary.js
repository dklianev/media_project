import sharp from 'sharp';
import db from '../db.js';

const MANAGED_UPLOAD_URL_REGEX = /^\/uploads\/[A-Za-z0-9][A-Za-z0-9._/-]*$/;

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
