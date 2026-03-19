import { Router } from 'express';
import db from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
const VALID_TYPES = ['episode', 'production'];

// List user's wishlist with current prices
router.get('/', requireAuth, (req, res) => {
  const items = db.prepare(`
    SELECT pw.*,
      CASE
        WHEN pw.target_type = 'episode' THEN e.title
        WHEN pw.target_type = 'production' THEN p.title
      END as title,
      CASE
        WHEN pw.target_type = 'episode' THEN e.purchase_price
        WHEN pw.target_type = 'production' THEN p.purchase_price
      END as current_price,
      CASE
        WHEN pw.target_type = 'episode' THEN ep.title
        ELSE NULL
      END as production_title,
      CASE
        WHEN pw.target_type = 'episode' THEN ep.slug
        WHEN pw.target_type = 'production' THEN p.slug
      END as production_slug
    FROM purchase_wishlist pw
    LEFT JOIN episodes e ON pw.target_type = 'episode' AND pw.target_id = e.id
    LEFT JOIN productions ep ON pw.target_type = 'episode' AND e.production_id = ep.id
    LEFT JOIN productions p ON pw.target_type = 'production' AND pw.target_id = p.id
    WHERE pw.user_id = ?
    ORDER BY pw.created_at DESC
    LIMIT 100
  `).all(req.user.id);
  res.json(items);
});

// Add to wishlist
router.post('/', requireAuth, (req, res) => {
  const { target_type, target_id } = req.body || {};
  if (!VALID_TYPES.includes(target_type)) {
    return res.status(400).json({ error: 'Невалиден тип съдържание.' });
  }
  const id = Number(target_id);
  if (!Number.isFinite(id) || id <= 0) {
    return res.status(400).json({ error: 'Невалиден идентификатор.' });
  }

  try {
    db.prepare(`
      INSERT INTO purchase_wishlist (user_id, target_type, target_id)
      VALUES (?, ?, ?)
    `).run(req.user.id, target_type, id);
    res.status(201).json({ success: true });
  } catch (err) {
    if (err.message?.includes('UNIQUE constraint')) {
      return res.status(200).json({ success: true, already_exists: true });
    }
    throw err;
  }
});

// Remove from wishlist
router.delete('/:targetType/:targetId', requireAuth, (req, res) => {
  const { targetType, targetId } = req.params;
  if (!VALID_TYPES.includes(targetType)) {
    return res.status(400).json({ error: 'Невалиден тип.' });
  }
  db.prepare(`
    DELETE FROM purchase_wishlist
    WHERE user_id = ? AND target_type = ? AND target_id = ?
  `).run(req.user.id, targetType, Number(targetId));
  res.json({ success: true });
});

export default router;
