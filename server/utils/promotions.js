import db from '../db.js';
import { getCurrentSofiaDbTimestamp } from './sofiaTime.js';

/**
 * Get all currently active promotions applicable to a context.
 * @param {'subscriptions'|'purchases'|'all'} appliesTo
 * @returns {Array}
 */
export function getActivePromotions(appliesTo = 'all') {
  const now = getCurrentSofiaDbTimestamp();
  return db.prepare(`
    SELECT *
    FROM promotions
    WHERE is_active = 1
      AND (starts_at IS NULL OR starts_at <= ?)
      AND (ends_at IS NULL OR ends_at >= ?)
      AND (max_uses IS NULL OR uses_count < max_uses)
      AND (applies_to = 'all' OR applies_to = ?)
  `).all(now, now, appliesTo);
}

/**
 * Check if a user qualifies for a specific promotion.
 */
export function userQualifiesForPromotion(userId, promotion) {
  const conditions = promotion.conditions ? JSON.parse(promotion.conditions) : {};

  // Check if user already used this promotion
  const usageCount = db.prepare(
    'SELECT COUNT(*) as count FROM promotion_usages WHERE promotion_id = ? AND user_id = ?'
  ).get(promotion.id, userId)?.count || 0;
  if (usageCount > 0) return false;

  // first_purchase: user must have no confirmed purchases/payments
  if (promotion.type === 'first_purchase') {
    const hasPurchase = db.prepare(
      "SELECT 1 FROM content_purchase_requests WHERE user_id = ? AND status = 'confirmed' LIMIT 1"
    ).get(userId);
    const hasPayment = db.prepare(
      "SELECT 1 FROM payment_references WHERE user_id = ? AND status = 'confirmed' LIMIT 1"
    ).get(userId);
    if (hasPurchase || hasPayment) return false;
  }

  // loyalty: check membership duration
  if (promotion.type === 'loyalty' && conditions.min_membership_days) {
    const user = db.prepare('SELECT created_at FROM users WHERE id = ?').get(userId);
    if (!user) return false;
    const daysSinceJoined = Math.floor((Date.now() - new Date(user.created_at).getTime()) / (1000 * 60 * 60 * 24));
    if (daysSinceJoined < conditions.min_membership_days) return false;
  }

  // loyalty: check min spend
  if (promotion.type === 'loyalty' && conditions.min_spend) {
    const totalSpend = db.prepare(`
      SELECT COALESCE(SUM(final_price), 0) as total
      FROM (
        SELECT final_price FROM payment_references WHERE user_id = ? AND status = 'confirmed'
        UNION ALL
        SELECT final_price FROM content_purchase_requests WHERE user_id = ? AND status = 'confirmed'
      )
    `).get(userId, userId)?.total || 0;
    if (totalSpend < conditions.min_spend) return false;
  }

  return true;
}

/**
 * Find the best applicable discount for a user and context.
 * @returns {{ promotion: object, discountAmount: number } | null}
 */
export function evaluateBestDiscount(userId, appliesTo, price) {
  const promotions = getActivePromotions(appliesTo);
  let best = null;
  let bestDiscount = 0;

  for (const promo of promotions) {
    if (!userQualifiesForPromotion(userId, promo)) continue;

    let discount = 0;
    if (promo.discount_type === 'percent') {
      discount = Math.round(price * (promo.discount_value / 100) * 100) / 100;
    } else {
      discount = Math.min(promo.discount_value, price);
    }

    if (discount > bestDiscount) {
      bestDiscount = discount;
      best = promo;
    }
  }

  return best ? { promotion: best, discountAmount: bestDiscount } : null;
}

/**
 * Record that a user used a promotion.
 */
export function recordPromotionUsage(promotionId, userId, appliedToType, appliedToId, discountAmount) {
  db.prepare(`
    INSERT INTO promotion_usages (promotion_id, user_id, applied_to_type, applied_to_id, discount_amount)
    VALUES (?, ?, ?, ?, ?)
  `).run(promotionId, userId, appliedToType, appliedToId, discountAmount);

  db.prepare('UPDATE promotions SET uses_count = uses_count + 1 WHERE id = ?').run(promotionId);
}
