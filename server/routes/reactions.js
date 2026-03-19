import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import db from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { getCurrentSofiaDbTimestamp } from '../utils/sofiaTime.js';
import { isUserAdmin } from '../utils/access.js';
import { evaluateEpisodeAccess, getUserPurchaseState } from '../utils/contentPurchases.js';

const router = Router();

const reactionLimiter = rateLimit({
  windowMs: 60_000,
  max: 30,
  keyGenerator: (req) => `react-${req.user?.id || 'anon'}`,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Твърде много реакции. Опитай отново след малко.' },
});
const VALID_REACTIONS = ['like', 'love', 'haha', 'wow', 'sad', 'angry'];

function validateEpisodeAccess(episodeId, user) {
  const admin = isUserAdmin(user);
  const currentTimestamp = getCurrentSofiaDbTimestamp();

  const episode = db.prepare(`
    SELECT e.id,
           e.production_id,
           e.access_group as episode_access_group,
           e.available_from,
           e.available_until,
           p.required_tier,
           p.access_group as production_access_group,
           p.available_from as production_available_from,
           p.available_until as production_available_until
    FROM episodes e
    JOIN productions p ON e.production_id = p.id
    WHERE e.id = ?
      ${admin ? '' : 'AND e.is_active = 1 AND p.is_active = 1 AND (e.published_at IS NULL OR e.published_at <= ?)'}
  `).get(...(admin ? [episodeId] : [episodeId, currentTimestamp]));

  if (!episode) {
    return { ok: false, status: 404, error: 'Епизодът не е намерен' };
  }

  const access = evaluateEpisodeAccess({
    id: episode.id,
    production_id: episode.production_id,
    access_group: episode.episode_access_group,
    available_from: episode.available_from,
    available_until: episode.available_until,
    required_tier: episode.required_tier,
    production_access_group: episode.production_access_group,
    production_available_from: episode.production_available_from,
    production_available_until: episode.production_available_until,
  }, user, getUserPurchaseState(user?.id));

  if (!access.hasAccess) {
    return {
      ok: false,
      status: 403,
      error: 'Нямаш достъп до тази страница. Провери дали имаш необходимия абонамент.',
    };
  }

  return { ok: true };
}

function getReactionSnapshot(episodeId, userId) {
  const reactions = db.prepare(`
    SELECT reaction_type, COUNT(*) as count
    FROM reactions
    WHERE episode_id = ?
    GROUP BY reaction_type
  `).all(episodeId);

  const userReaction = db.prepare(`
    SELECT reaction_type
    FROM reactions
    WHERE episode_id = ? AND user_id = ?
  `).get(episodeId, userId);

  return { reactions, user_reaction: userReaction?.reaction_type || null };
}

// Add or change reaction
router.post('/:episodeId/react', requireAuth, reactionLimiter, (req, res) => {
  const { reaction_type } = req.body || {};
  const { episodeId } = req.params;

  if (!VALID_REACTIONS.includes(reaction_type)) {
    return res.status(400).json({ error: 'Невалиден тип реакция' });
  }

  const access = validateEpisodeAccess(episodeId, req.user);
  if (!access.ok) {
    return res.status(access.status).json({ error: access.error });
  }

  const existing = db.prepare(`
    SELECT id
    FROM reactions
    WHERE user_id = ? AND episode_id = ?
  `).get(req.user.id, episodeId);

  if (existing) {
    db.prepare('UPDATE reactions SET reaction_type = ? WHERE id = ?').run(reaction_type, existing.id);
  } else {
    db.prepare(`
      INSERT INTO reactions (user_id, episode_id, reaction_type)
      VALUES (?, ?, ?)
    `).run(req.user.id, episodeId, reaction_type);
  }

  res.json(getReactionSnapshot(episodeId, req.user.id));
});

// Remove reaction
router.delete('/:episodeId/react', requireAuth, reactionLimiter, (req, res) => {
  const { episodeId } = req.params;
  const access = validateEpisodeAccess(episodeId, req.user);
  if (!access.ok) {
    return res.status(access.status).json({ error: access.error });
  }

  db.prepare(`
    DELETE FROM reactions
    WHERE user_id = ? AND episode_id = ?
  `).run(req.user.id, episodeId);

  res.json(getReactionSnapshot(episodeId, req.user.id));
});

// Get reactions for episode
router.get('/:episodeId/reactions', requireAuth, (req, res) => {
  const { episodeId } = req.params;
  const access = validateEpisodeAccess(episodeId, req.user);
  if (!access.ok) {
    return res.status(access.status).json({ error: access.error });
  }

  res.json(getReactionSnapshot(episodeId, req.user.id));
});

export default router;
