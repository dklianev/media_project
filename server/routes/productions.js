import { Router } from 'express';
import db from '../db.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { optimizeUploadedImages, requireUploadLock, upload } from '../middleware/upload.js';
import { buildPageResult, parsePagination, parseSort, toInt } from '../utils/pagination.js';
import { logAdminAction } from '../utils/audit.js';
import { normalizeManagedMediaUrl, registerUploadedMedia } from '../utils/mediaLibrary.js';
import { getCurrentSofiaDbTimestamp } from '../utils/sofiaTime.js';
import {
  normalizeProductionGroup,
  resolveProductionGroup,
} from '../utils/access.js';
import {
  enrichEpisodeForUser,
  enrichProductionForUser,
  getUserPurchaseState,
  normalizePurchaseMode,
  normalizePurchasePrice,
} from '../utils/contentPurchases.js';

const router = Router();
const PROD_SORT_MAP = {
  sort_order: 'sort_order',
  created_at: 'created_at',
  title: 'title',
  required_tier: 'required_tier',
  access_group: 'access_group',
};

// Alias for backward compat in this file
const normalizeGroup = normalizeProductionGroup;

router.get('/', requireAuth, (req, res) => {
  const genreFilter = req.query.genre ? String(req.query.genre).trim() : null;
  const sortParam = req.query.sort ? String(req.query.sort).trim() : '';

  let orderBy = 'sort_order ASC, created_at DESC';
  if (sortParam === 'newest') orderBy = 'created_at DESC, id DESC';
  if (sortParam === 'popular') orderBy = 'id DESC'; // Assuming lower ID is older, we don't have views per production yet, so fallback or maybe sort by title if alphabet. Let's add 'alphabetical'
  if (sortParam === 'alphabetical') orderBy = 'title ASC';

  const productions = db.prepare(`
    SELECT id, title, slug, description, thumbnail_url, cover_image_url,
           required_tier, access_group, sort_order, purchase_mode, purchase_price, created_at, genres
    FROM productions
    WHERE is_active = 1
    ORDER BY ${orderBy}
  `).all();
  const purchaseState = getUserPurchaseState(req.user.id);

  const result = productions.filter(item => {
    if (!genreFilter) return true;
    try {
      const parsedGenres = JSON.parse(item.genres || '[]');
      return parsedGenres.includes(genreFilter);
    } catch { return false; }
  }).map((item) => {
    const group = resolveProductionGroup(item.access_group, item.required_tier);
    let parsedGenres = [];
    try { parsedGenres = JSON.parse(item.genres || '[]'); } catch { }

    return enrichProductionForUser({
      ...item,
      genres: parsedGenres,
      access_group: group,
    }, req.user, purchaseState);
  });

  res.set('Cache-Control', 'private, max-age=15');
  res.json(result);
});

router.get('/:slug', requireAuth, (req, res) => {
  const production = db.prepare(
    'SELECT * FROM productions WHERE slug = ? AND is_active = 1'
  ).get(req.params.slug);
  if (!production) {
    return res.status(404).json({ error: 'Продукцията не е намерена' });
  }

  const isAdmin = req.user.role === 'admin' || req.user.role === 'superadmin';
  const purchaseState = getUserPurchaseState(req.user.id);

  const currentTimestamp = getCurrentSofiaDbTimestamp();
  const publishedFilter = isAdmin ? '' : 'AND (published_at IS NULL OR published_at <= ?)';
  const statement = db.prepare(`
    SELECT episodes.id, episodes.title, episodes.description, episodes.thumbnail_url, episodes.episode_number,
           episodes.access_group, episodes.purchase_enabled, episodes.purchase_price,
           episodes.published_at, episodes.created_at,
           p.purchase_mode as production_purchase_mode,
           p.purchase_price as production_purchase_price,
           ${isAdmin ? 'episodes.view_count as view_count,' : ''} episodes.is_active as is_active
    FROM episodes
    JOIN productions p ON p.id = episodes.production_id
    WHERE production_id = ? AND episodes.is_active = 1 ${publishedFilter}
    ORDER BY episodes.episode_number ASC, episodes.created_at ASC
  `);
  const baseProduction = {
    ...production,
    purchase_mode: normalizePurchaseMode(production.purchase_mode),
    purchase_price: normalizePurchasePrice(production.purchase_price, null),
  };
  const enrichedProduction = enrichProductionForUser(baseProduction, req.user, purchaseState);
  const episodes = (isAdmin ? statement.all(production.id) : statement.all(production.id, currentTimestamp)).map((episode) => (
    enrichEpisodeForUser({
      ...episode,
      production_id: production.id,
      required_tier: production.required_tier,
      production_access_group: production.access_group,
    }, req.user, purchaseState)
  ));

  res.json({ ...enrichedProduction, episodes });
});

router.get('/admin/all', requireAdmin, (req, res) => {
  const { page, pageSize, offset } = parsePagination(req.query, { defaultPageSize: 20, maxPageSize: 100 });
  const { sortBy, sortColumn, sortDir } = parseSort(req.query, PROD_SORT_MAP, 'sort_order', 'asc');

  const q = String(req.query.q || '').trim();
  const accessGroup = normalizeGroup(req.query.access_group, '');
  const activeRaw = String(req.query.is_active || '').trim().toLowerCase();

  const where = [];
  const params = [];

  if (q) {
    where.push('(title LIKE ? OR description LIKE ? OR slug LIKE ?)');
    const pattern = `%${q}%`;
    params.push(pattern, pattern, pattern);
  }

  if (accessGroup) {
    where.push('access_group = ?');
    params.push(accessGroup);
  }

  if (activeRaw === '1' || activeRaw === '0') {
    where.push('is_active = ?');
    params.push(activeRaw === '1' ? 1 : 0);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = db.prepare(`SELECT COUNT(*) as count FROM productions ${whereSql}`).get(...params)?.count || 0;

  const productions = db.prepare(`
    SELECT *
    FROM productions
    ${whereSql}
    ORDER BY ${sortColumn} ${sortDir}, id DESC
    LIMIT ? OFFSET ?
  `).all(...params, pageSize, offset).map((item) => ({
    ...item,
    access_group: resolveProductionGroup(item.access_group, item.required_tier),
    purchase_mode: normalizePurchaseMode(item.purchase_mode),
    purchase_price: normalizePurchasePrice(item.purchase_price, null),
  }));

  res.json(
    buildPageResult(productions, page, pageSize, total, {
      sort_by: sortBy,
      sort_dir: sortDir.toLowerCase(),
    })
  );
});

router.post(
  '/admin',
  requireAdmin,
  requireUploadLock,
  upload.fields([
    { name: 'thumbnail', maxCount: 1 },
    { name: 'cover_image', maxCount: 1 },
  ]),
  optimizeUploadedImages,
  async (req, res, next) => {
    try {
    const {
      title,
      description,
      required_tier,
      access_group,
      purchase_mode,
      purchase_price,
      sort_order,
      is_active,
      genres,
      thumbnail_url,
      cover_image_url,
    } = req.body;

    if (!title || title.trim().length < 2) {
      return res.status(400).json({ error: 'Заглавието е задължително' });
    }

    const slug =
      title
        .toLowerCase()
        .replace(/[^a-z0-9\u0400-\u04ff]+/g, '-')
        .replace(/(^-|-$)/g, '') + '-' + Date.now().toString(36);

    const selectedThumbnailUrl = thumbnail_url !== undefined && String(thumbnail_url).trim()
      ? normalizeManagedMediaUrl(thumbnail_url)
      : null;
    const selectedCoverUrl = cover_image_url !== undefined && String(cover_image_url).trim()
      ? normalizeManagedMediaUrl(cover_image_url)
      : null;

    if (thumbnail_url !== undefined && String(thumbnail_url).trim() && !selectedThumbnailUrl) {
      return res.status(400).json({ error: 'Невалиден URL за корица в каталог' });
    }
    if (cover_image_url !== undefined && String(cover_image_url).trim() && !selectedCoverUrl) {
      return res.status(400).json({ error: 'Невалиден URL за голямо изображение' });
    }

    const thumbnailUrl = req.files?.thumbnail?.[0]
      ? `/uploads/${req.files.thumbnail[0].filename}`
      : selectedThumbnailUrl;
    const coverUrl = req.files?.cover_image?.[0]
      ? `/uploads/${req.files.cover_image[0].filename}`
      : selectedCoverUrl;

    const group = resolveProductionGroup(access_group, required_tier);
    const tier = group === 'subscription' ? toInt(required_tier, 1) : 0;
    const normalizedPurchaseMode = normalizePurchaseMode(purchase_mode);
    const normalizedPurchasePrice =
      normalizedPurchaseMode === 'production' || normalizedPurchaseMode === 'both'
        ? normalizePurchasePrice(purchase_price, null)
        : null;

    if ((normalizedPurchaseMode === 'production' || normalizedPurchaseMode === 'both') && normalizedPurchasePrice === null) {
      return res.status(400).json({ error: 'Посочете валидна цена за покупка на продукцията.' });
    }

    const result = db.prepare(`
      INSERT INTO productions (
        title, slug, description, thumbnail_url, cover_image_url,
        required_tier, access_group, sort_order, purchase_mode, purchase_price, is_active, genres
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      title.trim(),
      slug,
      description || '',
      thumbnailUrl,
      coverUrl,
      tier,
      group,
      toInt(sort_order, 0),
      normalizedPurchaseMode,
      normalizedPurchasePrice,
      is_active === 'false' ? 0 : 1,
      genres || '[]'
    );

    const production = db.prepare('SELECT * FROM productions WHERE id = ?').get(result.lastInsertRowid);
    await registerUploadedMedia(req, req.files, { source: 'production.create' });
    logAdminAction(req, {
      action: 'production.create',
      entity_type: 'production',
      entity_id: production.id,
      metadata: {
        title: production.title,
        slug: production.slug,
        required_tier: production.required_tier,
        access_group: production.access_group,
        purchase_mode: production.purchase_mode,
        purchase_price: production.purchase_price,
        is_active: production.is_active,
        sort_order: production.sort_order,
      },
    });
    res.status(201).json({
      ...production,
      access_group: normalizeGroup(production.access_group),
      purchase_mode: normalizePurchaseMode(production.purchase_mode),
      purchase_price: normalizePurchasePrice(production.purchase_price, null),
    });
    } catch (err) {
      next(err);
    }
  }
);

router.put(
  '/admin/:id',
  requireAdmin,
  requireUploadLock,
  upload.fields([
    { name: 'thumbnail', maxCount: 1 },
    { name: 'cover_image', maxCount: 1 },
  ]),
  optimizeUploadedImages,
  async (req, res, next) => {
    try {
    const existing = db.prepare('SELECT * FROM productions WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Продукцията не е намерена' });
    }

    const {
      title,
      description,
      required_tier,
      access_group,
      purchase_mode,
      purchase_price,
      sort_order,
      is_active,
      genres,
      thumbnail_url,
      cover_image_url,
    } = req.body;

    const hasThumbnailUrl = Object.prototype.hasOwnProperty.call(req.body || {}, 'thumbnail_url');
    const hasCoverUrl = Object.prototype.hasOwnProperty.call(req.body || {}, 'cover_image_url');
    const selectedThumbnailUrl = hasThumbnailUrl && String(thumbnail_url).trim()
      ? normalizeManagedMediaUrl(thumbnail_url)
      : null;
    const selectedCoverUrl = hasCoverUrl && String(cover_image_url).trim()
      ? normalizeManagedMediaUrl(cover_image_url)
      : null;

    if (hasThumbnailUrl && String(thumbnail_url).trim() && !selectedThumbnailUrl) {
      return res.status(400).json({ error: 'Невалиден URL за корица в каталог' });
    }
    if (hasCoverUrl && String(cover_image_url).trim() && !selectedCoverUrl) {
      return res.status(400).json({ error: 'Невалиден URL за голямо изображение' });
    }

    const thumbnailUrl = req.files?.thumbnail?.[0]
      ? `/uploads/${req.files.thumbnail[0].filename}`
      : hasThumbnailUrl
        ? selectedThumbnailUrl
        : existing.thumbnail_url;
    const coverUrl = req.files?.cover_image?.[0]
      ? `/uploads/${req.files.cover_image[0].filename}`
      : hasCoverUrl
        ? selectedCoverUrl
        : existing.cover_image_url;

    const group = resolveProductionGroup(
      access_group,
      required_tier,
      resolveProductionGroup(existing.access_group, existing.required_tier)
    );
    const tier =
      group === 'subscription'
        ? toInt(required_tier, existing.required_tier || 1)
        : 0;
    const nextPurchaseMode = Object.prototype.hasOwnProperty.call(req.body || {}, 'purchase_mode')
      ? normalizePurchaseMode(purchase_mode)
      : normalizePurchaseMode(existing.purchase_mode);
    const incomingPurchasePrice = Object.prototype.hasOwnProperty.call(req.body || {}, 'purchase_price')
      ? normalizePurchasePrice(purchase_price, null)
      : normalizePurchasePrice(existing.purchase_price, null);
    const nextPurchasePrice =
      nextPurchaseMode === 'production' || nextPurchaseMode === 'both'
        ? incomingPurchasePrice
        : null;

    if ((nextPurchaseMode === 'production' || nextPurchaseMode === 'both') && nextPurchasePrice === null) {
      return res.status(400).json({ error: 'Посочете валидна цена за покупка на продукцията.' });
    }

    db.prepare(`
      UPDATE productions SET
        title = ?,
        description = ?,
        thumbnail_url = ?,
        cover_image_url = ?,
        required_tier = ?,
        access_group = ?,
        sort_order = ?,
        purchase_mode = ?,
        purchase_price = ?,
        is_active = ?,
        genres = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(
      title ? String(title).trim() : existing.title,
      description ?? existing.description,
      thumbnailUrl,
      coverUrl,
      tier,
      group,
      toInt(sort_order, existing.sort_order),
      nextPurchaseMode,
      nextPurchasePrice,
      is_active === undefined ? existing.is_active : (is_active === 'false' ? 0 : 1),
      genres ?? existing.genres,
      req.params.id
    );

    const updated = db.prepare('SELECT * FROM productions WHERE id = ?').get(req.params.id);
    await registerUploadedMedia(req, req.files, { source: 'production.update' });
    logAdminAction(req, {
      action: 'production.update',
      entity_type: 'production',
      entity_id: req.params.id,
      metadata: {
        previous: {
          title: existing.title,
          slug: existing.slug,
          required_tier: existing.required_tier,
          access_group: resolveProductionGroup(existing.access_group, existing.required_tier),
          purchase_mode: normalizePurchaseMode(existing.purchase_mode),
          purchase_price: normalizePurchasePrice(existing.purchase_price, null),
          is_active: existing.is_active,
          sort_order: existing.sort_order,
        },
        next: {
          title: updated.title,
          slug: updated.slug,
          required_tier: updated.required_tier,
          access_group: resolveProductionGroup(updated.access_group, updated.required_tier),
          purchase_mode: normalizePurchaseMode(updated.purchase_mode),
          purchase_price: normalizePurchasePrice(updated.purchase_price, null),
          is_active: updated.is_active,
          sort_order: updated.sort_order,
        },
      },
    });
    res.json({
      ...updated,
      access_group: resolveProductionGroup(updated.access_group, updated.required_tier),
      purchase_mode: normalizePurchaseMode(updated.purchase_mode),
      purchase_price: normalizePurchasePrice(updated.purchase_price, null),
    });
    } catch (err) {
      next(err);
    }
  }
);

router.put('/admin/:id/reorder', requireAdmin, (req, res) => {
  const direction = String(req.body?.direction || '').toLowerCase();
  if (!['up', 'down'].includes(direction)) {
    return res.status(400).json({ error: 'Невалидна посока' });
  }

  const current = db.prepare('SELECT id, sort_order FROM productions WHERE id = ?').get(req.params.id);
  if (!current) {
    return res.status(404).json({ error: 'Продукцията не е намерена' });
  }

  const target = direction === 'up'
    ? db.prepare(`
      SELECT id, sort_order
      FROM productions
      WHERE (sort_order < ? OR (sort_order = ? AND id < ?))
      ORDER BY sort_order DESC, id DESC
      LIMIT 1
    `).get(current.sort_order, current.sort_order, current.id)
    : db.prepare(`
      SELECT id, sort_order
      FROM productions
      WHERE (sort_order > ? OR (sort_order = ? AND id > ?))
      ORDER BY sort_order ASC, id ASC
      LIMIT 1
    `).get(current.sort_order, current.sort_order, current.id);

  if (!target) {
    return res.json({ success: true, moved: false });
  }

  const swap = db.transaction(() => {
    db.prepare('UPDATE productions SET sort_order = ? WHERE id = ?').run(target.sort_order, current.id);
    db.prepare('UPDATE productions SET sort_order = ? WHERE id = ?').run(current.sort_order, target.id);
  });
  swap();

  logAdminAction(req, {
    action: 'production.reorder',
    entity_type: 'production',
    entity_id: req.params.id,
    metadata: {
      direction,
      from_sort_order: current.sort_order,
      to_sort_order: target.sort_order,
      swapped_with_id: target.id,
    },
  });
  res.json({ success: true, moved: true });
});

router.delete('/admin/:id', requireAdmin, (req, res) => {
  const production = db.prepare('SELECT id, title, slug FROM productions WHERE id = ?').get(req.params.id);
  if (!production) {
    return res.status(404).json({ error: 'Продукцията не е намерена' });
  }

  const episodesCount = db.prepare(`
    SELECT COUNT(*) as count
    FROM episodes
    WHERE production_id = ?
  `).get(req.params.id)?.count || 0;

  if (episodesCount > 0) {
    return res.status(400).json({
      error: `Първо премахнете епизодите на тази продукция (${episodesCount})`,
    });
  }

  db.prepare('DELETE FROM productions WHERE id = ?').run(req.params.id);
  logAdminAction(req, {
    action: 'production.delete',
    entity_type: 'production',
    entity_id: req.params.id,
    metadata: {
      title: production.title,
      slug: production.slug,
    },
  });
  res.json({ success: true });
});

router.put('/admin/:id/status', requireAdmin, (req, res) => {
  const { is_active } = req.body;
  if (is_active === undefined) {
    return res.status(400).json({ error: 'Липсва is_active параметър' });
  }

  const production = db.prepare('SELECT id, title, is_active FROM productions WHERE id = ?').get(req.params.id);
  if (!production) {
    return res.status(404).json({ error: 'Продукцията не е намерена' });
  }

  const newValue = is_active ? 1 : 0;
  if (production.is_active === newValue) {
    return res.json({ success: true, updated: false });
  }

  db.prepare('UPDATE productions SET is_active = ?, updated_at = datetime(\'now\') WHERE id = ?').run(newValue, req.params.id);

  logAdminAction(req, {
    action: 'production.status_update',
    entity_type: 'production',
    entity_id: req.params.id,
    metadata: {
      title: production.title,
      from_is_active: production.is_active,
      to_is_active: newValue,
    },
  });

  res.json({ success: true, updated: true, is_active: newValue });
});

export default router;
