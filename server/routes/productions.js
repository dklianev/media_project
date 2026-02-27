import { Router } from 'express';
import db from '../db.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { optimizeUploadedImages, upload } from '../middleware/upload.js';
import { buildPageResult, parsePagination, parseSort, toInt } from '../utils/pagination.js';
import { logAdminAction } from '../utils/audit.js';
import {
  normalizeEpisodeGroup, normalizeProductionGroup,
  hasGroupAccess, isUserAdmin,
} from '../utils/access.js';

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
  const productions = db.prepare(`
    SELECT id, title, slug, description, thumbnail_url, cover_image_url,
           required_tier, access_group, sort_order, created_at
    FROM productions
    WHERE is_active = 1
    ORDER BY sort_order ASC, created_at DESC
  `).all();

  const userTier = req.user.tier_level || 0;
  const isAdmin = req.user.role === 'admin' || req.user.role === 'superadmin';

  const result = productions.map((item) => {
    const group = normalizeGroup(item.access_group);
    return {
      ...item,
      access_group: group,
      has_access: hasGroupAccess(group, userTier, isAdmin, item.required_tier || 0),
    };
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

  const userTier = req.user.tier_level || 0;
  const isAdmin = req.user.role === 'admin' || req.user.role === 'superadmin';
  const productionGroup = normalizeGroup(production.access_group);
  const hasProductionAccess = hasGroupAccess(
    productionGroup,
    userTier,
    isAdmin,
    production.required_tier || 0
  );

  const publishedFilter = isAdmin ? '' : "AND (published_at IS NULL OR published_at <= datetime('now'))";
  const episodes = db.prepare(`
    SELECT id, title, description, thumbnail_url, episode_number,
           access_group, published_at, created_at, ${isAdmin ? 'view_count,' : ''} is_active
    FROM episodes
    WHERE production_id = ? AND is_active = 1 ${publishedFilter}
    ORDER BY episode_number ASC, created_at ASC
  `).all(production.id).map((episode) => {
    const episodeGroupRaw = normalizeEpisodeGroup(episode.access_group);
    const effectiveGroup = episodeGroupRaw === 'inherit' ? productionGroup : episodeGroupRaw;
    return {
      ...episode,
      access_group: episodeGroupRaw,
      effective_access_group: effectiveGroup,
      has_access: hasGroupAccess(effectiveGroup, userTier, isAdmin, production.required_tier || 0),
    };
  });

  res.json({
    ...production,
    access_group: productionGroup,
    has_access: hasProductionAccess,
    episodes,
  });
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
    access_group: normalizeGroup(item.access_group),
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
  upload.fields([
    { name: 'thumbnail', maxCount: 1 },
    { name: 'cover_image', maxCount: 1 },
  ]),
  optimizeUploadedImages,
  (req, res) => {
    const {
      title,
      description,
      required_tier,
      access_group,
      sort_order,
      is_active,
    } = req.body;

    if (!title || title.trim().length < 2) {
      return res.status(400).json({ error: 'Заглавието е задължително' });
    }

    const slug =
      title
        .toLowerCase()
        .replace(/[^a-z0-9\u0400-\u04ff]+/g, '-')
        .replace(/(^-|-$)/g, '') + '-' + Date.now().toString(36);

    const thumbnailUrl = req.files?.thumbnail?.[0]
      ? `/uploads/${req.files.thumbnail[0].filename}`
      : null;
    const coverUrl = req.files?.cover_image?.[0]
      ? `/uploads/${req.files.cover_image[0].filename}`
      : null;

    const group = normalizeGroup(access_group);
    const tier = group === 'subscription' ? toInt(required_tier, 1) : 0;

    const result = db.prepare(`
      INSERT INTO productions (
        title, slug, description, thumbnail_url, cover_image_url,
        required_tier, access_group, sort_order, is_active
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      title.trim(),
      slug,
      description || '',
      thumbnailUrl,
      coverUrl,
      tier,
      group,
      toInt(sort_order, 0),
      is_active === 'false' ? 0 : 1
    );

    const production = db.prepare('SELECT * FROM productions WHERE id = ?').get(result.lastInsertRowid);
    logAdminAction(req, {
      action: 'production.create',
      entity_type: 'production',
      entity_id: production.id,
      metadata: {
        title: production.title,
        slug: production.slug,
        required_tier: production.required_tier,
        access_group: production.access_group,
        is_active: production.is_active,
        sort_order: production.sort_order,
      },
    });
    res.status(201).json({ ...production, access_group: normalizeGroup(production.access_group) });
  }
);

router.put(
  '/admin/:id',
  requireAdmin,
  upload.fields([
    { name: 'thumbnail', maxCount: 1 },
    { name: 'cover_image', maxCount: 1 },
  ]),
  optimizeUploadedImages,
  (req, res) => {
    const existing = db.prepare('SELECT * FROM productions WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Продукцията не е намерена' });
    }

    const {
      title,
      description,
      required_tier,
      access_group,
      sort_order,
      is_active,
    } = req.body;

    const thumbnailUrl = req.files?.thumbnail?.[0]
      ? `/uploads/${req.files.thumbnail[0].filename}`
      : existing.thumbnail_url;
    const coverUrl = req.files?.cover_image?.[0]
      ? `/uploads/${req.files.cover_image[0].filename}`
      : existing.cover_image_url;

    const group = normalizeGroup(access_group, normalizeGroup(existing.access_group));
    const tier =
      group === 'subscription'
        ? toInt(required_tier, existing.required_tier || 1)
        : 0;

    db.prepare(`
      UPDATE productions SET
        title = ?,
        description = ?,
        thumbnail_url = ?,
        cover_image_url = ?,
        required_tier = ?,
        access_group = ?,
        sort_order = ?,
        is_active = ?,
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
      is_active === undefined ? existing.is_active : (is_active === 'false' ? 0 : 1),
      req.params.id
    );

    const updated = db.prepare('SELECT * FROM productions WHERE id = ?').get(req.params.id);
    logAdminAction(req, {
      action: 'production.update',
      entity_type: 'production',
      entity_id: req.params.id,
      metadata: {
        previous: {
          title: existing.title,
          slug: existing.slug,
          required_tier: existing.required_tier,
          access_group: normalizeGroup(existing.access_group),
          is_active: existing.is_active,
          sort_order: existing.sort_order,
        },
        next: {
          title: updated.title,
          slug: updated.slug,
          required_tier: updated.required_tier,
          access_group: normalizeGroup(updated.access_group),
          is_active: updated.is_active,
          sort_order: updated.sort_order,
        },
      },
    });
    res.json({ ...updated, access_group: normalizeGroup(updated.access_group) });
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

export default router;
