import { Router } from 'express';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import db from '../db.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { buildPageResult, parsePagination, parseSort, toInt } from '../utils/pagination.js';
import { logAdminAction } from '../utils/audit.js';
import { createNotification } from '../utils/notifications.js';

const router = Router();
const PAYMENT_STATUSES = ['pending', 'confirmed', 'rejected', 'cancelled'];
const PAYMENT_SORT_MAP = {
  created_at: 'pr.created_at',
  final_price: 'pr.final_price',
  original_price: 'pr.original_price',
  discount_percent: 'pr.discount_percent',
  status: 'pr.status',
  plan_name: 'sp.name',
};
const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const PENDING_PAYMENT_TTL_HOURS = 24;
const PENDING_PAYMENT_EXPIRE_REASON = `Автоматично анулирано след ${PENDING_PAYMENT_TTL_HOURS} часа без потвърждение`;

const subscribeLimiter = rateLimit({
  windowMs: 60_000,
  max: 12,
  keyGenerator: (req) => `subscribe-${req.user?.id || 'anon'}`,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Твърде много заявки за абонамент. Опитай отново след малко.' },
});

const promoValidateLimiter = rateLimit({
  windowMs: 60_000,
  max: 30,
  keyGenerator: (req) => `promo-validate-${req.user?.id || 'anon'}`,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Твърде много проверки на промо код. Опитай отново след малко.' },
});

function generateReferenceCode(planName) {
  const prefix = (planName || 'SUB').substring(0, 3).toUpperCase();
  const random = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `SUB-${prefix}-${random}`;
}

function getPendingPaymentCutoffDbTimestamp(now = new Date()) {
  return new Date(now.getTime() - PENDING_PAYMENT_TTL_HOURS * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 19)
    .replace('T', ' ');
}

function cleanupExpiredPendingPayments() {
  const cutoff = getPendingPaymentCutoffDbTimestamp();
  db.prepare(`
    UPDATE payment_references
    SET status = 'cancelled',
        cancelled_at = COALESCE(cancelled_at, datetime('now')),
        cancelled_reason = COALESCE(NULLIF(cancelled_reason, ''), ?)
    WHERE status = 'pending'
      AND replace(replace(created_at, 'T', ' '), 'Z', '') <= ?
  `).run(PENDING_PAYMENT_EXPIRE_REASON, cutoff);
}

function getValidatedPromo(code) {
  if (!code) {
    return { error: 'Моля въведете промо код', status: 400 };
  }

  const promo = db.prepare(`
    SELECT id, code, discount_percent, max_uses, uses_count, expires_at
    FROM promo_codes
    WHERE code = ? AND is_active = 1
  `).get(code.toUpperCase().trim());

  if (!promo) return { error: 'Невалиден промо код', status: 404 };

  if (promo.expires_at && new Date(promo.expires_at) < new Date()) {
    return { error: 'Промо кодът е изтекъл', status: 400 };
  }

  if (promo.max_uses) {
    const cutoff = getPendingPaymentCutoffDbTimestamp();
    const pendingReservations = db.prepare(`
      SELECT COUNT(*) as count
      FROM payment_references
      WHERE promo_code_id = ?
        AND status = 'pending'
        AND replace(replace(created_at, 'T', ' '), 'Z', '') > ?
    `).get(promo.id, cutoff)?.count || 0;

    if (promo.uses_count + pendingReservations >= promo.max_uses) {
      return { error: 'Промо кодът е изчерпан', status: 400 };
    }
  }

  return { promo };
}

function parseDateOnly(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (!DATE_ONLY_REGEX.test(raw)) return null;
  const parsed = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return raw;
}

function addDaysIsoDate(dateOnly, days) {
  const parsed = new Date(`${dateOnly}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

router.use((req, res, next) => {
  cleanupExpiredPendingPayments();
  next();
});

function listPayments(req, res) {
  const { page, pageSize, offset } = parsePagination(req.query, { defaultPageSize: 20, maxPageSize: 100 });
  const { sortBy, sortColumn, sortDir } = parseSort(req.query, PAYMENT_SORT_MAP, 'created_at', 'desc');

  const q = String(req.query.q || '').trim();
  const status = String(req.query.status || '').trim().toLowerCase();
  const planId = toInt(req.query.plan_id, null);
  const fromDateRaw = String(req.query.date_from || '').trim();
  const toDateRaw = String(req.query.date_to || '').trim();
  const fromDate = fromDateRaw ? parseDateOnly(fromDateRaw) : null;
  const toDate = toDateRaw ? parseDateOnly(toDateRaw) : null;

  if (fromDateRaw && !fromDate) {
    return res.status(400).json({ error: 'Невалидна начална дата. Използвай формат YYYY-MM-DD.' });
  }
  if (toDateRaw && !toDate) {
    return res.status(400).json({ error: 'Невалидна крайна дата. Използвай формат YYYY-MM-DD.' });
  }
  if (fromDate && toDate && fromDate > toDate) {
    return res.status(400).json({ error: 'Началната дата не може да е след крайната дата.' });
  }

  const where = [];
  const params = [];

  if (PAYMENT_STATUSES.includes(status)) {
    where.push('pr.status = ?');
    params.push(status);
  }

  if (Number.isFinite(planId) && planId !== null) {
    where.push('pr.plan_id = ?');
    params.push(planId);
  }

  if (fromDate) {
    where.push('pr.created_at >= ?');
    params.push(`${fromDate} 00:00:00`);
  }

  if (toDate) {
    where.push('pr.created_at < ?');
    params.push(`${addDaysIsoDate(toDate, 1)} 00:00:00`);
  }

  if (q) {
    where.push(`
      (
        pr.reference_code LIKE ? OR
        u.character_name LIKE ? OR
        u.discord_username LIKE ? OR
        sp.name LIKE ? OR
        pc.code LIKE ?
      )
    `);
    const pattern = `%${q}%`;
    params.push(pattern, pattern, pattern, pattern, pattern);
  }

  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  const baseFrom = `
    FROM payment_references pr
    JOIN subscription_plans sp ON pr.plan_id = sp.id
    JOIN users u ON pr.user_id = u.id
    LEFT JOIN promo_codes pc ON pr.promo_code_id = pc.id
    LEFT JOIN users confirmer ON pr.confirmed_by = confirmer.id
    LEFT JOIN users rejecter ON pr.rejected_by = rejecter.id
  `;

  const total = db.prepare(`
    SELECT COUNT(*) as count
    ${baseFrom}
    ${whereSql}
  `).get(...params)?.count || 0;

  const payments = db.prepare(`
    SELECT pr.*, sp.name as plan_name, pc.code as promo_code_used,
           u.character_name, u.discord_username,
           confirmer.character_name as confirmed_by_name,
           rejecter.character_name as rejected_by_name
    ${baseFrom}
    ${whereSql}
    ORDER BY ${sortColumn} ${sortDir}, pr.id DESC
    LIMIT ? OFFSET ?
  `).all(...params, pageSize, offset);

  res.json(
    buildPageResult(payments, page, pageSize, total, {
      sort_by: sortBy,
      sort_dir: sortDir.toLowerCase(),
    })
  );
}

router.post('/subscribe', requireAuth, subscribeLimiter, (req, res) => {
  const planId = toInt(req.body?.plan_id, null);
  const promoCodeRaw = req.body?.promo_code ? String(req.body.promo_code) : '';

  if (!planId) {
    return res.status(400).json({ error: 'Избери валиден план' });
  }

  const plan = db.prepare(`
    SELECT *
    FROM subscription_plans
    WHERE id = ? AND is_active = 1
  `).get(planId);
  if (!plan) return res.status(404).json({ error: 'Планът не е намерен' });

  // Wrap promo validation + insert in a transaction to prevent race conditions
  const createSubscription = db.transaction(() => {
    let discountPercent = 0;
    let promoCodeId = null;

    if (promoCodeRaw) {
      const validation = getValidatedPromo(promoCodeRaw);
      if (validation.error) {
        return { error: validation.error, status: validation.status };
      }
      discountPercent = validation.promo.discount_percent;
      promoCodeId = validation.promo.id;
    }

    const originalPrice = Number(plan.price || 0);
    const finalPrice = Math.round(originalPrice * (1 - discountPercent / 100) * 100) / 100;

    const insertRef = db.prepare(`
      INSERT INTO payment_references
        (user_id, plan_id, reference_code, original_price, discount_percent, final_price, promo_code_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    let referenceCode;
    let inserted = false;
    for (let attempt = 0; attempt < 15; attempt++) {
      referenceCode = generateReferenceCode(plan.name);
      try {
        insertRef.run(req.user.id, plan.id, referenceCode, originalPrice, discountPercent, finalPrice, promoCodeId);
        inserted = true;
        break;
      } catch (err) {
        if (err.code === 'SQLITE_CONSTRAINT_UNIQUE' || err.message?.includes('UNIQUE')) {
          continue;
        }
        throw err;
      }
    }

    if (!inserted) {
      return { error: 'Не можахме да генерираме уникален код. Опитай отново.', status: 500 };
    }

    return { referenceCode, originalPrice, discountPercent, finalPrice };
  });

  const txResult = createSubscription();
  if (txResult.error) {
    return res.status(txResult.status).json({ error: txResult.error });
  }

  const iban = db.prepare("SELECT value FROM site_settings WHERE key = 'iban'").get()?.value || '';
  const paymentInfo =
    db.prepare("SELECT value FROM site_settings WHERE key = 'payment_info'").get()?.value || '';

  res.status(201).json({
    reference_code: txResult.referenceCode,
    plan_name: plan.name,
    original_price: txResult.originalPrice,
    discount_percent: txResult.discountPercent,
    final_price: txResult.finalPrice,
    iban,
    payment_info: paymentInfo,
  });
});

router.get('/my-payments', requireAuth, (req, res) => {
  const payments = db.prepare(`
    SELECT pr.*, sp.name as plan_name, pc.code as promo_code_used
    FROM payment_references pr
    JOIN subscription_plans sp ON pr.plan_id = sp.id
    LEFT JOIN promo_codes pc ON pr.promo_code_id = pc.id
    WHERE pr.user_id = ?
    ORDER BY pr.created_at DESC
  `).all(req.user.id);
  res.json(payments);
});

router.get('/renewal-info', requireAuth, (req, res) => {
  try {
    const user = db.prepare(`
      SELECT subscription_plan_id, subscription_expires_at
      FROM users
      WHERE id = ?
    `).get(req.user.id);

    if (!user || !user.subscription_plan_id || !user.subscription_expires_at) {
      return res.json({ has_subscription: false });
    }

    const plan = db.prepare(`
      SELECT id, name, price
      FROM subscription_plans
      WHERE id = ?
    `).get(user.subscription_plan_id);

    if (!plan) {
      return res.json({ has_subscription: false });
    }

    // Parse expires_at and calculate days remaining in Sofia timezone
    const expiresRaw = user.subscription_expires_at.replace('T', ' ').replace('Z', '');
    const expiresAt = new Date(expiresRaw + 'Z');
    const nowSofia = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Sofia' }));
    const expiresSofia = new Date(expiresAt.toLocaleString('en-US', { timeZone: 'Europe/Sofia' }));

    if (expiresSofia <= nowSofia) {
      return res.json({ has_subscription: false });
    }

    const diffMs = expiresSofia.getTime() - nowSofia.getTime();
    const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    res.json({
      has_subscription: true,
      plan_name: plan.name,
      plan_price: plan.price,
      expires_at: user.subscription_expires_at,
      days_remaining: daysRemaining,
      is_expiring_soon: daysRemaining <= 7,
    });
  } catch (err) {
    res.status(500).json({ error: 'Неуспешно зареждане на информация за абонамента' });
  }
});

router.put('/my-payments/:id/cancel', requireAuth, (req, res) => {
  const { reason } = req.body || {};

  const cancelPayment = db.transaction(() => {
    const payment = db.prepare(`
      SELECT id, status, user_id
      FROM payment_references
      WHERE id = ?
    `).get(req.params.id);

    if (!payment || payment.user_id !== req.user.id) {
      return { error: 'Плащането не е намерено', status: 404 };
    }
    if (payment.status !== 'pending') {
      return { error: 'Могат да се анулират само чакащи плащания', status: 400 };
    }

    const result = db.prepare(`
      UPDATE payment_references
      SET status = 'cancelled',
          cancelled_at = datetime('now'),
          cancelled_reason = ?
      WHERE id = ? AND status = 'pending'
    `).run(reason ? String(reason).slice(0, 300) : null, payment.id);

    if (result.changes === 0) {
      return { error: 'Плащането вече е обработено', status: 409 };
    }
    return { success: true };
  });

  const result = cancelPayment();
  if (result.error) {
    return res.status(result.status).json({ error: result.error });
  }
  res.json({ success: true, message: 'Плащането е анулирано' });
});

router.post('/promo/validate', requireAuth, promoValidateLimiter, (req, res) => {
  const validation = getValidatedPromo(req.body?.code);
  if (validation.error) {
    return res.status(validation.status).json({ error: validation.error });
  }

  res.json({
    valid: true,
    discount_percent: validation.promo.discount_percent,
  });
});

router.get('/admin/all', requireAdmin, listPayments);
router.get('/admin/payments', requireAdmin, listPayments);

function confirmPayment(req, res) {
  const payment = db.prepare(`
    SELECT pr.*, sp.tier_level, sp.duration_days
    FROM payment_references pr
    JOIN subscription_plans sp ON pr.plan_id = sp.id
    WHERE pr.id = ?
  `).get(req.params.id);

  if (!payment) return res.status(404).json({ error: 'Плащането не е намерено' });
  if (payment.status !== 'pending') {
    return res.status(400).json({ error: 'Само чакащи плащания могат да бъдат потвърждавани' });
  }

  try {
    const apply = db.transaction(() => {
      if (payment.promo_code_id) {
        const promoUpdate = db.prepare(`
          UPDATE promo_codes
          SET uses_count = uses_count + 1
          WHERE id = ?
            AND (max_uses IS NULL OR uses_count < max_uses)
        `).run(payment.promo_code_id);

        if (promoUpdate.changes === 0) {
          throw new Error('Промо кодът е изчерпан');
        }
      }

      db.prepare(`
        UPDATE payment_references SET
          status = 'confirmed',
          confirmed_by = ?,
          confirmed_at = datetime('now'),
          rejected_by = NULL,
          rejected_at = NULL,
          rejection_reason = NULL,
          cancelled_at = NULL,
          cancelled_reason = NULL
        WHERE id = ?
      `).run(req.user.id, payment.id);

      // Check if this payment is linked to a gift code
      const linkedGift = db.prepare(
        "SELECT id FROM gift_codes WHERE source_request_id = ? AND gift_type = 'subscription' AND status = 'pending_payment'"
      ).get(payment.id);

      if (linkedGift) {
        // Gift payment: don't apply subscription to buyer — mark gift as redeemable
        db.prepare("UPDATE gift_codes SET status = 'redeemable' WHERE id = ?").run(linkedGift.id);
      } else {
        // Normal payment: apply subscription to buyer
        const durationDays = Math.max(1, Number(payment.duration_days) || 30);
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
        `).run(payment.plan_id, durationDays, payment.user_id);
      }
    });

    apply();
    logAdminAction(req, {
      action: 'payment.confirm',
      entity_type: 'payment_reference',
      entity_id: payment.id,
      target_user_id: payment.user_id,
      metadata: {
        plan_id: payment.plan_id,
        tier_level: payment.tier_level,
        final_price: payment.final_price,
        discount_percent: payment.discount_percent,
      },
    });
    createNotification(payment.user_id, {
      type: 'subscription_confirmed',
      title: 'Абонаментът ви е активиран',
      message: 'Плащането е потвърдено. Приятно гледане!',
      link: '/profile',
      metadata: { plan_id: payment.plan_id, payment_id: payment.id },
    });
    res.json({ success: true, message: 'Плащането е потвърдено и абонаментът е активиран' });
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Неуспешно потвърждаване на плащането' });
  }
}

function rejectPayment(req, res) {
  const payment = db.prepare(`
    SELECT pr.id, pr.status, pr.user_id
    FROM payment_references pr
    WHERE pr.id = ?
  `).get(req.params.id);

  if (!payment) return res.status(404).json({ error: 'Плащането не е намерено' });
  if (payment.status !== 'pending') {
    return res.status(400).json({ error: 'Само чакащи плащания могат да бъдат отказвани' });
  }

  const reason = req.body?.reason ? String(req.body.reason).slice(0, 300) : null;
  db.prepare(`
    UPDATE payment_references SET
      status = 'rejected',
      rejected_by = ?,
      rejected_at = datetime('now'),
      rejection_reason = ?,
      confirmed_by = NULL,
      confirmed_at = NULL
    WHERE id = ?
  `).run(req.user.id, reason, payment.id);

  logAdminAction(req, {
    action: 'payment.reject',
    entity_type: 'payment_reference',
    entity_id: payment.id,
    target_user_id: payment.user_id,
    metadata: {
      reason,
    },
  });
  createNotification(payment.user_id, {
    type: 'subscription_rejected',
    title: 'Плащането ви е отказано',
    message: reason ? `Причина: ${reason}` : 'Свържете се с екипа за повече информация.',
    link: '/subscribe',
    metadata: { payment_id: payment.id },
  });
  res.json({ success: true, message: 'Плащането е отказано' });
}

function deletePayment(req, res) {
  const payment = db.prepare(`
    SELECT id, status, promo_code_id, user_id
    FROM payment_references
    WHERE id = ?
  `).get(req.params.id);

  if (!payment) {
    return res.status(404).json({ error: 'Плащането не е намерено' });
  }

  const remove = db.transaction(() => {
    if (payment.status === 'confirmed' && payment.promo_code_id) {
      db.prepare(`
        UPDATE promo_codes
        SET uses_count = CASE WHEN uses_count > 0 THEN uses_count - 1 ELSE 0 END
        WHERE id = ?
      `).run(payment.promo_code_id);
    }

    db.prepare('DELETE FROM payment_references WHERE id = ?').run(payment.id);
  });
  remove();

  logAdminAction(req, {
    action: 'payment.delete',
    entity_type: 'payment_reference',
    entity_id: payment.id,
    target_user_id: payment.user_id,
    metadata: {
      status: payment.status,
      promo_code_id: payment.promo_code_id,
    },
  });
  res.json({ success: true });
}

router.put('/admin/:id/confirm', requireAdmin, confirmPayment);
router.put('/admin/payments/:id/confirm', requireAdmin, confirmPayment);
router.put('/admin/:id/reject', requireAdmin, rejectPayment);
router.put('/admin/payments/:id/reject', requireAdmin, rejectPayment);
router.delete('/admin/:id', requireAdmin, deletePayment);
router.delete('/admin/payments/:id', requireAdmin, deletePayment);

export default router;
