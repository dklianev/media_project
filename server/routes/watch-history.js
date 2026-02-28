import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import db from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import {
  normalizeEpisodeGroup, normalizeProductionGroup,
  hasGroupAccess,
} from '../utils/access.js';

const router = Router();

const watchHistoryLimiter = rateLimit({
  windowMs: 60_000,
  max: 20,
  keyGenerator: (req) => `wh-${req.user?.id || 'anon'}`,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Твърде много заявки. Опитай отново след малко.' },
});

function validateEpisodeAccess(episodeId, user) {
  const isAdmin = user.role === 'admin' || user.role === 'superadmin';
  const visibleFilter = isAdmin
    ? ''
    : "AND (e.published_at IS NULL OR e.published_at <= datetime('now'))";

  const episode = db.prepare(`
    SELECT e.id,
           e.access_group as episode_access_group,
           p.required_tier,
           p.access_group as production_access_group
    FROM episodes e
    JOIN productions p ON p.id = e.production_id
    WHERE e.id = ?
      AND e.is_active = 1
      AND p.is_active = 1
      ${visibleFilter}
  `).get(episodeId);

  if (!episode) {
    return { ok: false, status: 404, error: 'Епизодът не е намерен' };
  }

  const prodGroup = normalizeProductionGroup(episode.production_access_group);
  const epGroup = normalizeEpisodeGroup(episode.episode_access_group);
  const effectiveGroup = epGroup === 'inherit' ? prodGroup : epGroup;
  const userTier = user.tier_level || 0;

  if (!hasGroupAccess(effectiveGroup, userTier, isAdmin, episode.required_tier || 0)) {
    return {
      ok: false,
      status: 403,
      error: 'Нямаш достъп до тази страница. Провери дали имаш необходимия абонамент.',
    };
  }

  return { ok: true };
}

// GET /api/watch-history — Get continue watching list
router.get('/', requireAuth, (req, res) => {
  const limit = Math.min(Math.max(1, Number(req.query.limit) || 12), 30);
  const userTier = req.user.tier_level || 0;
  const isAdmin = req.user.role === 'admin' || req.user.role === 'superadmin';
  const publishedFilter = isAdmin ? '' : "AND (e.published_at IS NULL OR e.published_at <= datetime('now'))";

  const rows = db.prepare(`
    SELECT wh.episode_id, wh.progress_seconds, wh.last_watched_at,
           e.title, e.thumbnail_url, e.episode_number, e.access_group, e.published_at,
           p.id as production_id, p.title as production_title, p.slug as production_slug,
           p.required_tier, p.access_group as production_access_group
    FROM watch_history wh
    JOIN episodes e ON e.id = wh.episode_id AND e.is_active = 1 ${publishedFilter}
    JOIN productions p ON p.id = e.production_id AND p.is_active = 1
    WHERE wh.user_id = ?
    ORDER BY wh.last_watched_at DESC
    LIMIT ?
  `).all(req.user.id, limit * 3);

  const result = rows
    .filter((row) => {
      const prodGroup = normalizeProductionGroup(row.production_access_group);
      const epGroup = normalizeEpisodeGroup(row.access_group);
      const effectiveGroup = epGroup === 'inherit' ? prodGroup : epGroup;
      return hasGroupAccess(effectiveGroup, userTier, isAdmin, row.required_tier || 0);
    })
    .slice(0, limit)
    .map((row) => ({
      episode_id: row.episode_id,
      title: row.title,
      thumbnail_url: row.thumbnail_url,
      episode_number: row.episode_number,
      production_id: row.production_id,
      production_title: row.production_title,
      production_slug: row.production_slug,
      progress_seconds: row.progress_seconds,
      last_watched_at: row.last_watched_at,
    }));

  res.json(result);
});

// GET /api/watch-history/:episodeId — Get saved progress for a single episode
router.get('/:episodeId', requireAuth, (req, res) => {
  const episodeId = Number(req.params.episodeId);
  if (!Number.isFinite(episodeId) || episodeId < 1) {
    return res.status(400).json({ error: 'Невалиден епизод' });
  }

  const access = validateEpisodeAccess(episodeId, req.user);
  if (!access.ok) {
    return res.status(access.status).json({ error: access.error });
  }

  const row = db.prepare(`
    SELECT progress_seconds, last_watched_at
    FROM watch_history
    WHERE user_id = ? AND episode_id = ?
  `).get(req.user.id, episodeId);

  res.json({
    episode_id: episodeId,
    progress_seconds: Number(row?.progress_seconds || 0),
    last_watched_at: row?.last_watched_at || null,
  });
});

// PUT /api/watch-history/:episodeId — Update watch progress
router.put('/:episodeId', requireAuth, watchHistoryLimiter, (req, res) => {
  const episodeId = Number(req.params.episodeId);
  if (!Number.isFinite(episodeId) || episodeId < 1) {
    return res.status(400).json({ error: 'Невалиден епизод' });
  }

  const access = validateEpisodeAccess(episodeId, req.user);
  if (!access.ok) {
    return res.status(access.status).json({ error: access.error });
  }

  const progress = Math.max(0, Number(req.body.progress_seconds) || 0);

  db.prepare(`
    INSERT INTO watch_history (user_id, episode_id, progress_seconds, last_watched_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(user_id, episode_id) DO UPDATE SET
      progress_seconds = excluded.progress_seconds,
      last_watched_at = datetime('now')
  `).run(req.user.id, episodeId, progress);

  res.json({ success: true });
});

export default router;
