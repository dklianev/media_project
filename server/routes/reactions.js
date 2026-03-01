import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import db from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import {
  normalizeEpisodeGroup, normalizeProductionGroup, resolveProductionGroup,
  hasGroupAccess, resolveEffectiveGroup, isUserAdmin,
} from '../utils/access.js';

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
  const episode = db.prepare(`
    SELECT e.id,
           e.access_group as episode_access_group,
           p.required_tier,
           p.access_group as production_access_group
    FROM episodes e
    JOIN productions p ON e.production_id = p.id
    WHERE e.id = ?
      AND e.is_active = 1
      AND p.is_active = 1
  `).get(episodeId);

  if (!episode) {
    return { ok: false, status: 404, error: 'Епизодът не е намерен' };
  }

  const userTier = user.tier_level || 0;
  const isAdmin = user.role === 'admin' || user.role === 'superadmin';
  const productionGroup = resolveProductionGroup(episode.production_access_group, episode.required_tier);
  const episodeGroup = normalizeEpisodeGroup(episode.episode_access_group);
  const effectiveGroup = episodeGroup === 'inherit' ? productionGroup : episodeGroup;

  if (!hasGroupAccess(effectiveGroup, userTier, isAdmin, episode.required_tier || 0)) {
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
