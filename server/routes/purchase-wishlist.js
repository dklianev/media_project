import { Router } from 'express';
import db from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import {
  evaluateEpisodeAccess,
  evaluateProductionAccess,
  getEpisodePurchaseConfig,
  getProductionPurchaseConfig,
  getUserPurchaseState,
} from '../utils/contentPurchases.js';
import { getCurrentSofiaDbTimestamp } from '../utils/sofiaTime.js';

const router = Router();
const VALID_TYPES = ['episode', 'production'];

function resolveWishlistTarget(targetType, targetId, user) {
  const purchaseState = getUserPurchaseState(user?.id);

  if (targetType === 'production') {
    const production = db.prepare(`
      SELECT id, title, slug, purchase_mode, purchase_price, required_tier, access_group,
             available_from, available_until
      FROM productions
      WHERE id = ? AND is_active = 1
    `).get(targetId);

    if (!production) {
      return { ok: false, status: 404, error: 'Продукцията не е намерена.' };
    }

    const purchaseConfig = getProductionPurchaseConfig(production);
    const access = evaluateProductionAccess(production, user, purchaseState);
    if (!purchaseConfig.isEnabled || !access.canPurchase) {
      return { ok: false, status: 400, error: 'Тази продукция не може да бъде добавена в wishlist в момента.' };
    }

    return { ok: true };
  }

  const currentTimestamp = getCurrentSofiaDbTimestamp();
  const episode = db.prepare(`
    SELECT e.id, e.production_id, e.purchase_enabled, e.purchase_price,
           e.access_group, e.available_from, e.available_until,
           p.purchase_mode as production_purchase_mode,
           p.purchase_price as production_purchase_price,
           p.required_tier,
           p.access_group as production_access_group,
           p.available_from as production_available_from,
           p.available_until as production_available_until
    FROM episodes e
    JOIN productions p ON p.id = e.production_id
    WHERE e.id = ? AND e.is_active = 1 AND p.is_active = 1
      AND (e.published_at IS NULL OR e.published_at <= ?)
  `).get(targetId, currentTimestamp);

  if (!episode) {
    return { ok: false, status: 404, error: 'Епизодът не е намерен.' };
  }

  const purchaseConfig = getEpisodePurchaseConfig(episode, {
    purchase_mode: episode.production_purchase_mode,
  });
  const access = evaluateEpisodeAccess(episode, user, purchaseState);
  if (!purchaseConfig.isEnabled || !access.canPurchaseEpisode) {
    return { ok: false, status: 400, error: 'Този епизод не може да бъде добавен в wishlist в момента.' };
  }

  return { ok: true };
}

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

  const target = resolveWishlistTarget(target_type, id, req.user);
  if (!target.ok) {
    return res.status(target.status).json({ error: target.error });
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
