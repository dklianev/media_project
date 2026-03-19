import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import db from '../db.js';
import { requireAuth } from '../middleware/auth.js';

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

// Create or update rating
router.post('/', requireAuth, ratingLimiter, (req, res) => {
  const { target_type, target_id, score } = req.body || {};

  if (!VALID_TARGET_TYPES.includes(target_type)) {
    return res.status(400).json({ error: 'Невалиден тип на целта' });
  }

  if (!Number.isInteger(score) || score < 1 || score > 5) {
    return res.status(400).json({ error: 'Оценката трябва да е цяло число от 1 до 5' });
  }

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

  if (!VALID_TARGET_TYPES.includes(targetType)) {
    return res.status(400).json({ error: 'Невалиден тип на целта' });
  }

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

  db.prepare(`
    DELETE FROM ratings
    WHERE user_id = ? AND target_type = ? AND target_id = ?
  `).run(req.user.id, targetType, targetId);

  res.json({ success: true });
});

export default router;
