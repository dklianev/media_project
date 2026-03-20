import { Router } from 'express';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import db from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { createNotification } from '../utils/notifications.js';
import { getCurrentSofiaDbTimestamp, getShiftedSofiaDbTimestamp } from '../utils/sofiaTime.js';
import {
  evaluateEpisodeAccess,
  evaluateProductionAccess,
  getEpisodePurchaseConfig,
  getProductionPurchaseConfig,
} from '../utils/contentPurchases.js';

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

function generateReferenceCode(prefix) {
  const random = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `GIFT-${prefix}-${random}`;
}

function getIbanAndPaymentInfo() {
  const iban = db.prepare("SELECT value FROM site_settings WHERE key = 'iban'").get()?.value || '';
  const paymentInfo =
    db.prepare("SELECT value FROM site_settings WHERE key = 'payment_info'").get()?.value || '';
  return { iban, paymentInfo };
}

// POST /create - Create a gift (requires payment)
router.post('/create', requireAuth, giftLimiter, (req, res) => {
  try {
    const { gift_type, target_id, plan_id, message } = req.body || {};

    if (!['episode', 'production', 'subscription'].includes(gift_type)) {
      return res.status(400).json({ error: 'Невалиден тип подарък. Допустими: episode, production, subscription.' });
    }

    let resolvedTargetId = null;
    let resolvedPlanId = null;
    let planDurationDays = null;
    let price = null;
    let targetTitle = null;
    let productionTitle = null;
    let productionSlug = null;
    let episodeNumber = null;

    if (gift_type === 'episode') {
      if (!target_id) return res.status(400).json({ error: 'Моля посочете епизод.' });
      const currentTimestamp = getCurrentSofiaDbTimestamp();
      const episode = db.prepare(`
        SELECT e.id, e.title, e.episode_number, e.purchase_price, e.purchase_enabled,
               e.access_group, e.available_from, e.available_until,
               p.title as production_title, p.slug as production_slug,
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
      `).get(target_id, currentTimestamp);
      if (!episode) return res.status(404).json({ error: 'Епизодът не е намерен или не е активен.' });
      const epPurchase = getEpisodePurchaseConfig(episode, { purchase_mode: episode.production_purchase_mode });
      if (!epPurchase.isEnabled) {
        return res.status(400).json({ error: 'Този епизод не може да бъде закупен индивидуално и не може да бъде подарен.' });
      }
      const episodeAccess = evaluateEpisodeAccess(episode, req.user);
      if (!episodeAccess.isAvailable) {
        return res.status(400).json({ error: 'Този епизод в момента не е наличен и не може да бъде подарен.' });
      }
      resolvedTargetId = episode.id;
      price = episode.purchase_price;
      targetTitle = episode.title;
      productionTitle = episode.production_title;
      productionSlug = episode.production_slug;
      episodeNumber = episode.episode_number;
    } else if (gift_type === 'production') {
      if (!target_id) return res.status(400).json({ error: 'Моля посочете продукция.' });
      const production = db.prepare(`
        SELECT id, title, slug, purchase_price, purchase_mode,
               required_tier, access_group, available_from, available_until
        FROM productions WHERE id = ? AND is_active = 1
      `).get(target_id);
      if (!production) return res.status(404).json({ error: 'Продукцията не е намерена или не е активна.' });
      const prodPurchase = getProductionPurchaseConfig(production);
      if (!prodPurchase.isEnabled) {
        return res.status(400).json({ error: 'Тази продукция не може да бъде закупена и не може да бъде подарена.' });
      }
      const productionAccess = evaluateProductionAccess(production, req.user);
      if (!productionAccess.isAvailable) {
        return res.status(400).json({ error: 'Тази продукция в момента не е налична и не може да бъде подарена.' });
      }
      resolvedTargetId = production.id;
      price = production.purchase_price;
      targetTitle = production.title;
      productionTitle = production.title;
      productionSlug = production.slug;
    } else if (gift_type === 'subscription') {
      if (!plan_id) return res.status(400).json({ error: 'Моля посочете абонаментен план.' });
      const plan = db.prepare(`
        SELECT id, name, duration_days, price FROM subscription_plans WHERE id = ? AND is_active = 1
      `).get(plan_id);
      if (!plan) return res.status(404).json({ error: 'Абонаментният план не е намерен или не е активен.' });
      if (!plan.price || plan.price <= 0) {
        return res.status(400).json({ error: 'Този план няма зададена цена и не може да бъде подарен.' });
      }
      resolvedPlanId = plan.id;
      planDurationDays = plan.duration_days;
      price = plan.price;
      targetTitle = plan.name;
    }

    const now = getCurrentSofiaDbTimestamp();
    const expiresAt = getShiftedSofiaDbTimestamp(30);

    if (gift_type === 'episode' || gift_type === 'production') {
      // Create a content_purchase_requests row for payment tracking
      const insertRequest = db.prepare(`
        INSERT INTO content_purchase_requests (
          user_id, target_type, target_id,
          target_title_snapshot, production_title_snapshot, production_slug_snapshot,
          episode_number_snapshot, reference_code, original_price, final_price
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      let referenceCode = null;
      let requestId = null;
      let hasPendingRequestConflict = false;

      for (let attempt = 0; attempt < 15; attempt++) {
        referenceCode = generateReferenceCode(gift_type === 'episode' ? 'EPI' : 'PRO');
        try {
          const result = insertRequest.run(
            req.user.id,
            gift_type,
            resolvedTargetId,
            targetTitle,
            productionTitle,
            productionSlug,
            episodeNumber ?? null,
            referenceCode,
            price,
            price
          );
          requestId = result.lastInsertRowid;
          break;
        } catch (err) {
          if (
            err.message?.includes('idx_content_purchase_requests_pending_target')
            || err.message?.includes('content_purchase_requests.user_id, content_purchase_requests.target_type, content_purchase_requests.target_id')
          ) {
            hasPendingRequestConflict = true;
            break;
          }
          if (err.code === 'SQLITE_CONSTRAINT_UNIQUE' || err.message?.includes('UNIQUE')) {
            continue;
          }
          throw err;
        }
      }

      if (hasPendingRequestConflict) {
        return res.status(409).json({ error: 'Вече има активна заявка за подарък или покупка за това съдържание.' });
      }

      if (!requestId) {
        return res.status(500).json({ error: 'Неуспешно генериране на заявка за покупка. Опитайте отново.' });
      }

      // Create the gift code linked to the purchase request
      let code = null;
      for (let attempt = 0; attempt < 10; attempt++) {
        const candidate = generateGiftCode();
        try {
          db.prepare(`
            INSERT INTO gift_codes (code, sender_id, gift_type, target_id, plan_id, plan_duration_days, message, status, source_request_id, expires_at, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'pending_payment', ?, ?, ?)
          `).run(candidate, req.user.id, gift_type, resolvedTargetId, resolvedPlanId, planDurationDays, message || null, requestId, expiresAt, now);
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

      const { iban, paymentInfo } = getIbanAndPaymentInfo();

      return res.status(201).json({
        success: true,
        code,
        gift_type,
        reference_code: referenceCode,
        price,
        iban,
        payment_info: paymentInfo,
        expires_at: expiresAt,
      });

    } else if (gift_type === 'subscription') {
      // Create a payment_references row for subscription gift payment tracking
      const insertRef = db.prepare(`
        INSERT INTO payment_references
          (user_id, plan_id, reference_code, original_price, discount_percent, final_price)
        VALUES (?, ?, ?, ?, 0, ?)
      `);

      let referenceCode = null;
      let paymentRefId = null;

      for (let attempt = 0; attempt < 15; attempt++) {
        referenceCode = generateReferenceCode('SUB');
        try {
          const result = insertRef.run(
            req.user.id,
            resolvedPlanId,
            referenceCode,
            price,
            price
          );
          paymentRefId = result.lastInsertRowid;
          break;
        } catch (err) {
          if (err.code === 'SQLITE_CONSTRAINT_UNIQUE' || err.message?.includes('UNIQUE')) {
            continue;
          }
          throw err;
        }
      }

      if (!paymentRefId) {
        return res.status(500).json({ error: 'Неуспешно генериране на заявка за плащане. Опитайте отново.' });
      }

      // Create the gift code linked to the payment reference
      let code = null;
      for (let attempt = 0; attempt < 10; attempt++) {
        const candidate = generateGiftCode();
        try {
          db.prepare(`
            INSERT INTO gift_codes (code, sender_id, gift_type, target_id, plan_id, plan_duration_days, message, status, source_request_id, expires_at, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'pending_payment', ?, ?, ?)
          `).run(candidate, req.user.id, gift_type, resolvedTargetId, resolvedPlanId, planDurationDays, message || null, paymentRefId, expiresAt, now);
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

      const { iban, paymentInfo } = getIbanAndPaymentInfo();

      return res.status(201).json({
        success: true,
        code,
        gift_type,
        reference_code: referenceCode,
        price,
        iban,
        payment_info: paymentInfo,
        expires_at: expiresAt,
      });
    }
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
      WHERE code = ? AND status = 'redeemable' AND expires_at > ?
    `).get(String(code).trim().toUpperCase(), now);

    if (!gift) return res.status(404).json({ error: 'Невалиден или изтекъл код за подарък.' });

    if (gift.sender_id === req.user.id) {
      return res.status(400).json({ error: 'Не можете да използвате собствен подарък.' });
    }

    // Verify payment has been confirmed before allowing redemption
    if (gift.gift_type === 'episode' || gift.gift_type === 'production') {
      if (gift.source_request_id) {
        const purchaseRequest = db.prepare(`
          SELECT status FROM content_purchase_requests WHERE id = ?
        `).get(gift.source_request_id);
        if (!purchaseRequest || purchaseRequest.status !== 'confirmed') {
          return res.status(400).json({ error: 'Подаръкът все още не е платен.' });
        }
      } else {
        return res.status(400).json({ error: 'Подаръкът все още не е платен.' });
      }
    } else if (gift.gift_type === 'subscription') {
      if (gift.source_request_id) {
        const paymentRef = db.prepare(`
          SELECT status FROM payment_references WHERE id = ?
        `).get(gift.source_request_id);
        if (!paymentRef || paymentRef.status !== 'confirmed') {
          return res.status(400).json({ error: 'Подаръкът все още не е платен.' });
        }
      } else {
        return res.status(400).json({ error: 'Подаръкът все още не е платен.' });
      }
    }

    const redeem = db.transaction(() => {
      if (gift.gift_type === 'episode' || gift.gift_type === 'production') {
        const targetType = gift.gift_type;
        const targetExists = targetType === 'episode'
          ? db.prepare('SELECT 1 FROM episodes WHERE id = ?').get(gift.target_id)
          : db.prepare('SELECT 1 FROM productions WHERE id = ?').get(gift.target_id);

        if (!targetExists) {
          throw new Error('Подареното съдържание вече не е налично.');
        }

        const existing = db.prepare(`
          SELECT 1 FROM content_entitlements
          WHERE user_id = ? AND target_type = ? AND target_id = ?
        `).get(req.user.id, targetType, gift.target_id);

        if (existing) {
          throw new Error('Вече притежавате достъп до това съдържание.');
        }

        db.prepare(`
          INSERT INTO content_entitlements (user_id, target_type, target_id, source_request_id)
          VALUES (?, ?, ?, ?)
        `).run(req.user.id, targetType, gift.target_id, gift.source_request_id);
      } else if (gift.gift_type === 'subscription') {
        const giftedPlan = db.prepare(`
          SELECT id, is_active, tier_level
          FROM subscription_plans
          WHERE id = ?
        `).get(gift.plan_id);

        if (!giftedPlan || Number(giftedPlan.is_active) !== 1) {
          throw new Error('Подареният абонаментен план вече не е активен.');
        }

        const recipientSubscription = db.prepare(`
          SELECT
            u.subscription_plan_id,
            u.subscription_expires_at,
            sp.tier_level AS current_tier_level
          FROM users u
          LEFT JOIN subscription_plans sp ON sp.id = u.subscription_plan_id
          WHERE u.id = ?
        `).get(req.user.id);

        const currentExpiryRaw = recipientSubscription?.subscription_expires_at;
        const hasActiveSubscription = Boolean(
          recipientSubscription?.subscription_plan_id
          && currentExpiryRaw
          && db.prepare(`
            SELECT datetime(replace(replace(?, 'T', ' '), 'Z', '')) > datetime('now') AS is_active
          `).get(currentExpiryRaw)?.is_active
        );

        const currentTierLevel = Number(recipientSubscription?.current_tier_level || 0);
        const giftedTierLevel = Number(giftedPlan.tier_level || 0);

        if (hasActiveSubscription && currentTierLevel > giftedTierLevel) {
          throw new Error('Вече имате по-висок активен абонамент и не можете да използвате този подарък.');
        }

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
        gc.recipient_id, gc.source_request_id,
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
