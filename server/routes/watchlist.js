import { Router } from 'express';
import db from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// GET /api/watchlist — Get user's watchlist production IDs
router.get('/', requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT w.production_id, w.created_at
    FROM watchlist w
    JOIN productions p ON p.id = w.production_id AND p.is_active = 1
    WHERE w.user_id = ?
    ORDER BY w.created_at DESC
  `).all(req.user.id);

  res.json(rows.map((r) => r.production_id));
});

// POST /api/watchlist/:productionId — Add to watchlist
router.post('/:productionId', requireAuth, (req, res) => {
  const productionId = Number(req.params.productionId);
  if (!Number.isFinite(productionId) || productionId < 1) {
    return res.status(400).json({ error: 'Невалидна продукция' });
  }

  const prod = db.prepare('SELECT id FROM productions WHERE id = ? AND is_active = 1').get(productionId);
  if (!prod) {
    return res.status(404).json({ error: 'Продукцията не е намерена' });
  }

  try {
    db.prepare('INSERT OR IGNORE INTO watchlist (user_id, production_id) VALUES (?, ?)').run(req.user.id, productionId);
  } catch {
    // UNIQUE constraint — already in watchlist, ignore
  }

  res.json({ success: true, in_watchlist: true });
});

// DELETE /api/watchlist/:productionId — Remove from watchlist
router.delete('/:productionId', requireAuth, (req, res) => {
  const productionId = Number(req.params.productionId);
  db.prepare('DELETE FROM watchlist WHERE user_id = ? AND production_id = ?').run(req.user.id, productionId);
  res.json({ success: true, in_watchlist: false });
});

export default router;
