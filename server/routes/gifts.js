import { Router } from 'express';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import db from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { createNotification } from '../utils/notifications.js';
import { getCurrentSofiaDbTimestamp, getShiftedSofiaDbTimestamp } from '../utils/sofiaTime.js';

const router = Router();

const giftLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  keyGenerator: (req) => `gift-create-${req.user?.id || 'anon'}`,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Твърде много заявки за подарък. Опитай отново след малко.' },
});

function generateGiftCode() {
  return 'GIFT-' + crypto.randomBytes(4).toString('hex').toUpperCase();
}

// POST /create - Create a gift
router.post('/create', requireAuth, giftLimiter, (req, res) => {
  try {
    const { gift_type, target_id, plan_id, message } = req.body || {};

    if (!['episode', 'production', 'subscription'].includes(gift_type)) {
      return res.status(400).json({ error: 'Невалиден тип подарък. Допустими: episode, production, subscription.' });
    }

    let resolvedTargetId = null;
    let resolvedPlanId = null;
    let planDurationDays = null;

    if (gift_type === 'episode') {
      if (!target_id) return res.status(400).json({ error: 'Моля посочете епизод.' });
      const episode = db.prepare(`
        SELECT id FROM episodes WHERE id = ? AND is_active = 1
      `).get(target_id);
      if (!episode) return res.status(404).json({ error: 'Епизодът не е намерен или не е активен.' });
      resolvedTargetId = episode.id;
    } else if (gift_type === 'production') {
      if (!target_id) return res.status(400).json({ error: 'Моля посочете продукция.' });
      const production = db.prepare(`
        SELECT id FROM productions WHERE id = ? AND is_active = 1
      `).get(target_id);
      if (!production) return res.status(404).json({ error: 'Продукцията не е намерена или не е активна.' });
      resolvedTargetId = production.id;
    } else if (gift_type === 'subscription') {
      if (!plan_id) return res.status(400).json({ error: 'Моля посочете абонаментен план.' });
      const plan = db.prepare(`
        SELECT id, duration_days FROM subscription_plans WHERE id = ? AND is_active = 1
      `).get(plan_id);
      if (!plan) return res.status(404).json({ error: 'Абонаментният план не е намерен или не е активен.' });
      resolvedPlanId = plan.id;
      planDurationDays = plan.duration_days;
    }

    const now = getCurrentSofiaDbTimestamp();
    const expiresAt = getShiftedSofiaDbTimestamp(30);

    let code = null;
    for (let attempt = 0; attempt < 10; attempt++) {
      const candidate = generateGiftCode();
      try {
        db.prepare(`
          INSERT INTO gift_codes (code, sender_id, gift_type, target_id, plan_id, plan_duration_days, message, status, expires_at, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
        `).run(candidate, req.user.id, gift_type, resolvedTargetId, resolvedPlanId, planDurationDays, message || null, expiresAt, now);
        code = candidate;
        break;
      } catch (err) {
        if (err.code === 'SQLITE_CONSTRAINT_UNIQUE' || (err.message && err.message.includes('UNIQUE'))) {
          continue;
        }
        throw err;
      }
    }

    if (!code) {
      return res.status(500).json({ error: 'Неуспешно генериране на уникален код. Опитайте отново.' });
    }

    return res.json({ success: true, code, gift_type, expires_at: expiresAt });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Грешка при създаване на подарък.' });
  }
});

// POST /redeem - Redeem a gift code
router.post('/redeem', requireAuth, giftLimiter, (req, res) => {
  try {
    const { code } = req.body || {};
    if (!code) return res.status(400).json({ error: 'Моля въведете код за подарък.' });

    const now = getCurrentSofiaDbTimestamp();

    const gift = db.prepare(`
      SELECT * FROM gift_codes
      WHERE code = ? AND status = 'pending' AND expires_at > ?
    `).get(String(code).trim().toUpperCase(), now);

    if (!gift) return res.status(404).json({ error: 'Невалиден или изтекъл код за подарък.' });

    if (gift.sender_id === req.user.id) {
      return res.status(400).json({ error: 'Не можете да използвате собствен подарък.' });
    }

    const redeem = db.transaction(() => {
      if (gift.gift_type === 'episode' || gift.gift_type === 'production') {
        const targetType = gift.gift_type;
        const existing = db.prepare(`
          SELECT 1 FROM content_entitlements
          WHERE user_id = ? AND target_type = ? AND target_id = ?
        `).get(req.user.id, targetType, gift.target_id);

        if (existing) {
          throw new Error('Вече притежавате достъп до това съдържание.');
        }

        db.prepare(`
          INSERT INTO content_entitlements (user_id, target_type, target_id)
          VALUES (?, ?, ?)
        `).run(req.user.id, targetType, gift.target_id);
      } else if (gift.gift_type === 'subscription') {
        const durationDays = Math.max(1, Number(gift.plan_duration_days) || 30);
        db.prepare(`
          UPDATE users SET
            subscription_plan_id = ?,
            subscription_expires_at = datetime(
              CASE
                WHEN subscription_expires_at IS NOT NULL
                  AND datetime(replace(replace(subscription_expires_at, 'T', ' '), 'Z', '')) > datetime('now')
                THEN datetime(replace(replace(subscription_expires_at, 'T', ' '), 'Z', ''))
                ELSE datetime('now')
              END,
              '+' || ? || ' days'
            ),
            updated_at = datetime('now')
          WHERE id = ?
        `).run(gift.plan_id, durationDays, req.user.id);
      }

      db.prepare(`
        UPDATE gift_codes
        SET status = 'redeemed', recipient_id = ?, redeemed_at = ?
        WHERE id = ?
      `).run(req.user.id, now, gift.id);
    });

    redeem();

    createNotification(gift.sender_id, {
      type: 'gift_redeemed',
      title: 'Подаръкът ви беше използван',
      message: `Вашият подарък (${gift.code}) беше използван успешно.`,
      link: '/profile',
      metadata: { gift_id: gift.id, gift_type: gift.gift_type, recipient_id: req.user.id },
    });

    return res.json({ success: true, gift_type: gift.gift_type });
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Грешка при използване на подарък.' });
  }
});

// GET /sent - List gifts sent by user
router.get('/sent', requireAuth, (req, res) => {
  try {
    const gifts = db.prepare(`
      SELECT
        gc.id, gc.code, gc.gift_type, gc.target_id, gc.plan_id, gc.plan_duration_days,
        gc.message, gc.status, gc.expires_at, gc.created_at, gc.redeemed_at,
        gc.recipient_id,
        u.discord_username AS recipient_username,
        u.character_name AS recipient_display_name
      FROM gift_codes gc
      LEFT JOIN users u ON u.id = gc.recipient_id
      WHERE gc.sender_id = ?
      ORDER BY gc.created_at DESC
      LIMIT 50
    `).all(req.user.id);

    return res.json(gifts);
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Грешка при зареждане на изпратени подаръци.' });
  }
});

// GET /received - List gifts received by user
router.get('/received', requireAuth, (req, res) => {
  try {
    const gifts = db.prepare(`
      SELECT
        gc.id, gc.code, gc.gift_type, gc.target_id, gc.plan_id, gc.plan_duration_days,
        gc.message, gc.status, gc.expires_at, gc.created_at, gc.redeemed_at,
        gc.sender_id,
        u.discord_username AS sender_username,
        u.character_name AS sender_display_name
      FROM gift_codes gc
      LEFT JOIN users u ON u.id = gc.sender_id
      WHERE gc.recipient_id = ?
      ORDER BY gc.redeemed_at DESC
      LIMIT 50
    `).all(req.user.id);

    return res.json(gifts);
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Грешка при зареждане на получени подаръци.' });
  }
});

export default router;
