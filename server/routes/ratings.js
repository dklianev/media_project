import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import db from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { evaluateEpisodeAccess, evaluateProductionAccess, getUserPurchaseState } from '../utils/contentPurchases.js';
import { isUserAdmin } from '../utils/access.js';
import { getCurrentSofiaDbTimestamp } from '../utils/sofiaTime.js';

const router = Router();

const ratingLimiter = rateLimit({
  windowMs: 60_000,
  max: 30,
  keyGenerator: (req) => `rating-${req.user?.id || 'anon'}`,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Твърде много заявки. Опитай отново след малко.' },
});

const VALID_TARGET_TYPES = ['episode', 'production'];

/**
 * Validate that the target exists and the user has access to it.
 * Returns { ok: true } or { ok: false, status, error }.
 */
function validateTargetAccess(targetType, targetId, user) {
  if (!VALID_TARGET_TYPES.includes(targetType)) {
    return { ok: false, status: 400, error: 'Невалиден тип на целта' };
  }
  const purchaseState = getUserPurchaseState(user.id);
  const admin = isUserAdmin(user);
  const currentTimestamp = getCurrentSofiaDbTimestamp();

  if (targetType === 'episode') {
    const episode = db.prepare(`
      SELECT e.id, e.production_id, e.access_group, e.published_at,
             e.available_from, e.available_until,
             p.required_tier, p.access_group as production_access_group,
             p.available_from as production_available_from,
             p.available_until as production_available_until
      FROM episodes e
      JOIN productions p ON p.id = e.production_id
      WHERE e.id = ?
        ${admin ? '' : 'AND e.is_active = 1 AND p.is_active = 1 AND (e.published_at IS NULL OR e.published_at <= ?)'}
    `).get(...(admin ? [targetId] : [targetId, currentTimestamp]));
    if (!episode) return { ok: false, status: 404, error: 'Епизодът не е намерен.' };
    const access = evaluateEpisodeAccess(episode, user, purchaseState);
    if (!access.hasAccess) return { ok: false, status: 403, error: 'Нямаш достъп до този епизод.' };
  } else {
    const production = db.prepare(`
      SELECT id, required_tier, access_group, available_from, available_until
      FROM productions WHERE id = ?
        ${admin ? '' : 'AND is_active = 1'}
    `).get(targetId);
    if (!production) return { ok: false, status: 404, error: 'Продукцията не е намерена.' };
    const access = evaluateProductionAccess(production, user, purchaseState);
    if (!access.hasAccess) return { ok: false, status: 403, error: 'Нямаш достъп до тази продукция.' };
  }
  return { ok: true };
}

// Create or update rating
router.post('/', requireAuth, ratingLimiter, (req, res) => {
  const { target_type, target_id, score } = req.body || {};

  if (!VALID_TARGET_TYPES.includes(target_type)) {
    return res.status(400).json({ error: 'Невалиден тип на целта' });
  }

  if (!Number.isInteger(score) || score < 1 || score > 5) {
    return res.status(400).json({ error: 'Оценката трябва да е цяло число от 1 до 5' });
  }

  const check = validateTargetAccess(target_type, target_id, req.user);
  if (!check.ok) return res.status(check.status).json({ error: check.error });

  db.prepare(`
    INSERT INTO ratings (user_id, target_type, target_id, score)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, target_type, target_id)
    DO UPDATE SET score = ?, updated_at = datetime('now')
  `).run(req.user.id, target_type, target_id, score, score);

  res.json({ success: true, score });
});

// Get rating summary
router.get('/:targetType/:targetId', requireAuth, (req, res) => {
  const { targetType, targetId } = req.params;

  const check = validateTargetAccess(targetType, targetId, req.user);
  if (!check.ok) return res.status(check.status).json({ error: check.error });

  const summary = db.prepare(`
    SELECT ROUND(AVG(score), 1) as average, COUNT(*) as count
    FROM ratings
    WHERE target_type = ? AND target_id = ?
  `).get(targetType, targetId);

  const userRating = db.prepare(`
    SELECT score
    FROM ratings
    WHERE user_id = ? AND target_type = ? AND target_id = ?
  `).get(req.user.id, targetType, targetId);

  res.json({
    average: summary.average ?? 0,
    count: summary.count,
    user_score: userRating?.score || null,
  });
});

// Remove user's rating
router.delete('/:targetType/:targetId', requireAuth, (req, res) => {
  const { targetType, targetId } = req.params;

  const check = validateTargetAccess(targetType, targetId, req.user);
  if (!check.ok) return res.status(check.status).json({ error: check.error });

  db.prepare(`
    DELETE FROM ratings
    WHERE user_id = ? AND target_type = ? AND target_id = ?
  `).run(req.user.id, targetType, targetId);

  res.json({ success: true });
});

export default router;
