import { Router } from 'express';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import db from '../db.js';
import { requireAdmin, requireAuth } from '../middleware/auth.js';
import { buildPageResult, parsePagination, parseSort, toInt } from '../utils/pagination.js';
import { logAdminAction } from '../utils/audit.js';
import { createNotification } from '../utils/notifications.js';
import { getCurrentSofiaDbTimestamp } from '../utils/sofiaTime.js';
import {
  evaluateEpisodeAccess,
  evaluateProductionAccess,
  getEpisodePurchaseConfig,
  getProductionPurchaseConfig,
  getUserPurchaseState,
  hasPendingEpisodePurchase,
  hasPendingProductionPurchase,
  hasProductionEntitlement,
  normalizePurchaseTargetType,
  PURCHASE_TARGET_TYPES,
} from '../utils/contentPurchases.js';

const router = Router();
const PURCHASE_REQUEST_STATUSES = ['pending', 'confirmed', 'rejected', 'cancelled'];
const TARGET_TITLE_SQL = `
  COALESCE(
    CASE WHEN cpr.target_type = 'production' THEN p.title ELSE e.title END,
    cpr.target_title_snapshot,
    cpr.production_title_snapshot
  )
`;
const PRODUCTION_SLUG_SQL = `
  COALESCE(
    CASE WHEN cpr.target_type = 'production' THEN p.slug ELSE ep.slug END,
    cpr.production_slug_snapshot
  )
`;
const PRODUCTION_TITLE_SQL = `
  COALESCE(
    CASE WHEN cpr.target_type = 'production' THEN p.title ELSE ep.title END,
    cpr.production_title_snapshot,
    cpr.target_title_snapshot
  )
`;
const EPISODE_NUMBER_SQL = 'COALESCE(e.episode_number, cpr.episode_number_snapshot)';
const PURCHASE_SORT_MAP = {
  created_at: 'cpr.created_at',
  final_price: 'cpr.final_price',
  original_price: 'cpr.original_price',
  status: 'cpr.status',
  target_type: 'cpr.target_type',
  target_title: TARGET_TITLE_SQL,
};

const createPurchaseLimiter = rateLimit({
  windowMs: 60_000,
  max: 12,
  keyGenerator: (req) => `content-purchase-${req.user?.id || 'anon'}`,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Твърде много заявки за покупка. Опитайте след малко.' },
});

function generateReferenceCode(targetType) {
  const prefix = targetType === 'episode' ? 'EPI' : 'PRO';
  const random = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `BUY-${prefix}-${random}`;
}

function getListBaseFrom() {
  return `
    FROM content_purchase_requests cpr
    JOIN users u ON cpr.user_id = u.id
    LEFT JOIN productions p
      ON cpr.target_type = 'production' AND cpr.target_id = p.id
    LEFT JOIN episodes e
      ON cpr.target_type = 'episode' AND cpr.target_id = e.id
    LEFT JOIN productions ep
      ON e.production_id = ep.id
    LEFT JOIN users confirmer ON cpr.confirmed_by = confirmer.id
    LEFT JOIN users rejecter ON cpr.rejected_by = rejecter.id
  `;
}

function getListSelect() {
  return `
    SELECT
      cpr.*,
      u.character_name,
      u.discord_username,
      confirmer.character_name as confirmed_by_name,
      rejecter.character_name as rejected_by_name,
      ${TARGET_TITLE_SQL} as target_title,
      ${PRODUCTION_SLUG_SQL} as production_slug,
      ${PRODUCTION_TITLE_SQL} as production_title,
      ${EPISODE_NUMBER_SQL} as episode_number
  `;
}

function getPurchaseRequestById(id) {
  return db.prepare(`
    ${getListSelect()}
    ${getListBaseFrom()}
    WHERE cpr.id = ?
  `).get(id);
}

function getExistingPendingRequest(userId, targetType, targetId) {
  return db.prepare(`
    ${getListSelect()}
    ${getListBaseFrom()}
    WHERE cpr.user_id = ?
      AND cpr.target_type = ?
      AND cpr.target_id = ?
      AND cpr.status = 'pending'
    ORDER BY cpr.id DESC
    LIMIT 1
  `).get(userId, targetType, targetId);
}

function getPurchasableProduction(productionId) {
  return db.prepare(`
    SELECT
      p.id,
      p.title as target_title,
      p.slug as production_slug,
      p.title as production_title,
      p.purchase_mode,
      p.purchase_price,
      p.required_tier,
      p.access_group,
      p.available_from,
      p.available_until
    FROM productions p
    WHERE p.id = ?
      AND p.is_active = 1
  `).get(productionId);
}

function getPurchasableEpisode(episodeId) {
  const currentTimestamp = getCurrentSofiaDbTimestamp();
  return db.prepare(`
    SELECT
      e.id,
      e.production_id,
      e.title as target_title,
      e.episode_number,
      e.purchase_enabled,
      e.purchase_price,
      e.access_group,
      e.available_from,
      e.available_until,
      p.title as production_title,
      p.slug as production_slug,
      p.purchase_mode as production_purchase_mode,
      p.purchase_price as production_purchase_price,
      p.required_tier,
      p.access_group as production_access_group,
      p.available_from as production_available_from,
      p.available_until as production_available_until
    FROM episodes e
    JOIN productions p ON p.id = e.production_id
    WHERE e.id = ?
      AND e.is_active = 1
      AND p.is_active = 1
      AND (e.published_at IS NULL OR e.published_at <= ?)
  `).get(episodeId, currentTimestamp);
}

function getIbanAndPaymentInfo() {
  const iban = db.prepare("SELECT value FROM site_settings WHERE key = 'iban'").get()?.value || '';
  const paymentInfo =
    db.prepare("SELECT value FROM site_settings WHERE key = 'payment_info'").get()?.value || '';

  return { iban, paymentInfo };
}

function resolveCreateTarget(targetType, targetId, user) {
  const purchaseState = getUserPurchaseState(user.id);

  if (targetType === 'production') {
    const production = getPurchasableProduction(targetId);
    if (!production) {
      return { error: 'Продукцията не е намерена.', status: 404 };
    }

    const purchaseConfig = getProductionPurchaseConfig(production);
    const access = evaluateProductionAccess(production, user, purchaseState);
    if (!purchaseConfig.isEnabled) {
      return { error: 'Продукцията не може да се закупи отделно.', status: 400 };
    }

    if (!access.isAvailable) {
      return { error: 'Продукцията в момента не е налична за покупка.', status: 400 };
    }

    if (hasProductionEntitlement(purchaseState, production.id)) {
      return { error: 'Тази продукция вече е закупена.', status: 409 };
    }

    if (hasPendingProductionPurchase(purchaseState, production.id)) {
      return {
        error: 'Вече има активна заявка за тази продукция.',
        status: 409,
        request: getExistingPendingRequest(user.id, 'production', production.id),
      };
    }

    return {
      target: {
        target_type: 'production',
        target_id: production.id,
        target_title: production.target_title,
        production_title: production.production_title,
        production_slug: production.production_slug,
        episode_number: null,
      },
      price: purchaseConfig.purchasePrice,
    };
  }

  if (targetType === 'episode') {
    const episode = getPurchasableEpisode(targetId);
    if (!episode) {
      return { error: 'Епизодът не е намерен.', status: 404 };
    }

    const access = evaluateEpisodeAccess(episode, user, purchaseState);
    const purchaseConfig = getEpisodePurchaseConfig(episode, {
      purchase_mode: episode.production_purchase_mode,
    });

    if (!purchaseConfig.isEnabled) {
      return { error: 'Епизодът не може да се закупи отделно.', status: 400 };
    }

    if (!access.isAvailable) {
      return { error: 'Епизодът в момента не е наличен за покупка.', status: 400 };
    }

    if (access.isPurchased) {
      return { error: 'Този епизод вече е закупен.', status: 409 };
    }

    if (hasPendingEpisodePurchase(purchaseState, episode.id)) {
      return {
        error: 'Вече има активна заявка за този епизод.',
        status: 409,
        request: getExistingPendingRequest(user.id, 'episode', episode.id),
      };
    }

    return {
      target: {
        target_type: 'episode',
        target_id: episode.id,
        target_title: episode.target_title,
        production_title: episode.production_title,
        production_slug: episode.production_slug,
        episode_number: episode.episode_number,
      },
      price: purchaseConfig.purchasePrice,
    };
  }

  return { error: 'Невалиден тип съдържание за покупка.', status: 400 };
}

function listPurchases(req, res) {
  const { page, pageSize, offset } = parsePagination(req.query, { defaultPageSize: 20, maxPageSize: 100 });
  const { sortBy, sortColumn, sortDir } = parseSort(req.query, PURCHASE_SORT_MAP, 'created_at', 'desc');

  const q = String(req.query.q || '').trim();
  const status = String(req.query.status || '').trim().toLowerCase();
  const targetType = normalizePurchaseTargetType(req.query.target_type, '');

  const where = [];
  const params = [];

  if (req.user && !req.adminList) {
    where.push('cpr.user_id = ?');
    params.push(req.user.id);
  }

  if (PURCHASE_REQUEST_STATUSES.includes(status)) {
    where.push('cpr.status = ?');
    params.push(status);
  }

  if (PURCHASE_TARGET_TYPES.includes(targetType)) {
    where.push('cpr.target_type = ?');
    params.push(targetType);
  }

  if (q) {
    where.push(`(
      cpr.reference_code LIKE ? ESCAPE '\\'
      OR u.character_name LIKE ? ESCAPE '\\'
      OR u.discord_username LIKE ? ESCAPE '\\'
      OR p.title LIKE ? ESCAPE '\\'
      OR e.title LIKE ? ESCAPE '\\'
      OR ep.title LIKE ? ESCAPE '\\'
      OR cpr.target_title_snapshot LIKE ? ESCAPE '\\'
      OR cpr.production_title_snapshot LIKE ? ESCAPE '\\'
      OR cpr.production_slug_snapshot LIKE ? ESCAPE '\\'
    )`);
    const escaped = q.replace(/[%_]/g, '\\$&');
    const pattern = `%${escaped}%`;
    params.push(pattern, pattern, pattern, pattern, pattern, pattern, pattern, pattern, pattern);
  }

  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  const baseFrom = getListBaseFrom();
  const total = db.prepare(`
    SELECT COUNT(*) as count
    ${baseFrom}
    ${whereSql}
  `).get(...params)?.count || 0;

  const rows = db.prepare(`
    ${getListSelect()}
    ${baseFrom}
    ${whereSql}
    ORDER BY ${sortColumn} ${sortDir}, cpr.id DESC
    LIMIT ? OFFSET ?
  `).all(...params, pageSize, offset);

  res.json(buildPageResult(rows, page, pageSize, total, {
    sort_by: sortBy,
    sort_dir: sortDir.toLowerCase(),
  }));
}

router.post('/', requireAuth, createPurchaseLimiter, (req, res) => {
  const targetType = normalizePurchaseTargetType(req.body?.target_type);
  const targetId = toInt(req.body?.target_id, null);
  if (!targetType || !targetId) {
    return res.status(400).json({ error: 'Посочете валидно съдържание за покупка.' });
  }

  const resolved = resolveCreateTarget(targetType, targetId, req.user);
  if (resolved.error) {
    const paymentMeta = resolved.request
      ? (() => {
        const { iban, paymentInfo } = getIbanAndPaymentInfo();
        return { iban, payment_info: paymentInfo };
      })()
      : {};
    return res.status(resolved.status).json({
      error: resolved.error,
      request: resolved.request || null,
      ...paymentMeta,
    });
  }

  const createRequest = db.transaction(() => {
    const insert = db.prepare(`
      INSERT INTO content_purchase_requests (
        user_id,
        target_type,
        target_id,
        target_title_snapshot,
        production_title_snapshot,
        production_slug_snapshot,
        episode_number_snapshot,
        reference_code,
        original_price,
        final_price
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    let referenceCode = null;
    let insertedId = null;
    for (let attempt = 0; attempt < 15; attempt++) {
      referenceCode = generateReferenceCode(targetType);
      try {
        const result = insert.run(
          req.user.id,
          targetType,
          targetId,
          resolved.target.target_title,
          resolved.target.production_title,
          resolved.target.production_slug,
          resolved.target.episode_number ?? null,
          referenceCode,
          resolved.price,
          resolved.price
        );
        insertedId = result.lastInsertRowid;
        break;
      } catch (err) {
        if (err.message?.includes('idx_content_purchase_requests_pending_target')) {
          return {
            error: 'Вече има активна заявка за това съдържание.',
            status: 409,
            request: getExistingPendingRequest(req.user.id, targetType, targetId),
          };
        }
        if (err.code === 'SQLITE_CONSTRAINT_UNIQUE' || err.message?.includes('UNIQUE')) {
          continue;
        }
        throw err;
      }
    }

    if (!insertedId) {
      return { error: 'Не успяхме да генерираме заявка за покупка. Опитайте отново.', status: 500 };
    }

    return {
      requestId: insertedId,
      referenceCode,
    };
  });

  try {
    const result = createRequest();
    if (result.error) {
      return res.status(result.status).json({
        error: result.error,
        request: result.request || null,
      });
    }

    const { iban, paymentInfo } = getIbanAndPaymentInfo();
    return res.status(201).json({
      request_id: result.requestId,
      reference_code: result.referenceCode,
      target_type: resolved.target.target_type,
      target_id: resolved.target.target_id,
      target_title: resolved.target.target_title,
      production_title: resolved.target.production_title,
      production_slug: resolved.target.production_slug,
      episode_number: resolved.target.episode_number,
      original_price: resolved.price,
      final_price: resolved.price,
      iban,
      payment_info: paymentInfo,
    });
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE' || err.message?.includes('idx_content_purchase_requests_pending_target')) {
      const existing = getExistingPendingRequest(req.user.id, targetType, targetId);
      const { iban, paymentInfo } = getIbanAndPaymentInfo();
      return res.status(409).json({
        error: 'Вече има активна заявка за това съдържание.',
        request: existing || null,
        iban,
        payment_info: paymentInfo,
      });
    }
    throw err;
  }
});

router.get('/my', requireAuth, (req, res) => {
  req.adminList = false;
  return listPurchases(req, res);
});

router.put('/my/:id/cancel', requireAuth, (req, res) => {
  const request = db.prepare(`
    SELECT id, user_id, status
    FROM content_purchase_requests
    WHERE id = ?
  `).get(req.params.id);

  if (!request || request.user_id !== req.user.id) {
    return res.status(404).json({ error: 'Заявката не е намерена.' });
  }
  if (request.status !== 'pending') {
    return res.status(400).json({ error: 'Само чакащи заявки могат да бъдат анулирани.' });
  }

  db.prepare(`
    UPDATE content_purchase_requests
    SET status = 'cancelled',
        cancelled_at = ?,
        cancelled_reason = ?
    WHERE id = ?
      AND status = 'pending'
  `).run(
    getCurrentSofiaDbTimestamp(),
    req.body?.reason ? String(req.body.reason).slice(0, 300) : null,
    request.id
  );

  res.json({ success: true });
});

router.get('/admin', requireAdmin, (req, res) => {
  req.adminList = true;
  return listPurchases(req, res);
});

function hasGrantedOwnership(request) {
  if (request.target_type === 'production') {
    return Boolean(db.prepare(`
      SELECT 1
      FROM content_entitlements
      WHERE user_id = ?
        AND target_type = 'production'
        AND target_id = ?
    `).get(request.user_id, request.target_id));
  }

  const productionId = db.prepare(`
    SELECT production_id
    FROM episodes
    WHERE id = ?
  `).get(request.target_id)?.production_id;

  if (!productionId) {
    return false;
  }

  return Boolean(
    db.prepare(`
      SELECT 1
      FROM content_entitlements
      WHERE user_id = ?
        AND (
          (target_type = 'episode' AND target_id = ?)
          OR
          (target_type = 'production' AND target_id = ?)
        )
    `).get(request.user_id, request.target_id, productionId)
  );
}

function cancelCoveredEpisodeRequests(userId, productionId, sourceRequestId) {
  db.prepare(`
    UPDATE content_purchase_requests
    SET status = 'cancelled',
        cancelled_at = ?,
        cancelled_reason = COALESCE(NULLIF(cancelled_reason, ''), 'Покрито от потвърдена покупка на продукцията')
    WHERE user_id = ?
      AND status = 'pending'
      AND target_type = 'episode'
      AND id != ?
      AND target_id IN (
        SELECT id FROM episodes WHERE production_id = ?
      )
  `).run(getCurrentSofiaDbTimestamp(), userId, sourceRequestId, productionId);
}

function ensureConfirmableTargetExists(request) {
  if (request.target_type === 'production') {
    const production = db.prepare(`
      SELECT id
      FROM productions
      WHERE id = ?
    `).get(request.target_id);

    if (!production) {
      throw new Error('Съдържанието вече не съществува.');
    }
    return;
  }

  const episode = db.prepare(`
    SELECT id
    FROM episodes
    WHERE id = ?
  `).get(request.target_id);

  if (!episode) {
    throw new Error('Съдържанието вече не съществува.');
  }
}

function confirmPurchase(req, res) {
  const request = getPurchaseRequestById(req.params.id);
  if (!request) {
    return res.status(404).json({ error: 'Заявката не е намерена.' });
  }
  if (request.status !== 'pending') {
    return res.status(400).json({ error: 'Само чакащи заявки могат да бъдат потвърдени.' });
  }

  try {
    const apply = db.transaction(() => {
      ensureConfirmableTargetExists(request);

      if (hasGrantedOwnership(request)) {
        throw new Error('Съдържанието вече е отключено за този потребител.');
      }

      const updateResult = db.prepare(`
        UPDATE content_purchase_requests
        SET status = 'confirmed',
            confirmed_by = ?,
            confirmed_at = ?,
            rejected_by = NULL,
            rejected_at = NULL,
            rejection_reason = NULL,
            cancelled_at = NULL,
            cancelled_reason = NULL
        WHERE id = ?
          AND status = 'pending'
      `).run(req.user.id, getCurrentSofiaDbTimestamp(), request.id);

      if (updateResult.changes === 0) {
        throw new Error('Заявката вече е била обработена.');
      }

      // Check if this purchase is linked to a gift code
      const linkedGift = db.prepare(
        "SELECT id FROM gift_codes WHERE source_request_id = ? AND status = 'pending_payment'"
      ).get(request.id);

      if (linkedGift) {
        // Gift purchase: don't create entitlement for the buyer — mark gift as redeemable instead
        db.prepare("UPDATE gift_codes SET status = 'redeemable' WHERE id = ?").run(linkedGift.id);
      } else {
        // Normal purchase: create entitlement for the buyer
        db.prepare(`
          INSERT INTO content_entitlements (user_id, target_type, target_id, source_request_id)
          VALUES (?, ?, ?, ?)
        `).run(request.user_id, request.target_type, request.target_id, request.id);

        if (request.target_type === 'production') {
          cancelCoveredEpisodeRequests(request.user_id, request.target_id, request.id);
        }
      }
    });

    apply();
    logAdminAction(req, {
      action: 'content_purchase.confirm',
      entity_type: 'content_purchase_request',
      entity_id: request.id,
      target_user_id: request.user_id,
      metadata: {
        target_type: request.target_type,
        target_id: request.target_id,
        final_price: request.final_price,
      },
    });
    createNotification(request.user_id, {
      type: 'purchase_confirmed',
      title: 'Покупката ви е потвърдена',
      message: `Достъпът до "${request.target_title_snapshot || 'съдържанието'}" е активиран.`,
      link: request.target_type === 'production'
        ? `/productions/${request.production_slug_snapshot || ''}`
        : `/episodes/${request.target_id}`,
      metadata: { target_type: request.target_type, target_id: request.target_id },
    });
    return res.json({ success: true });
  } catch (err) {
    if (err.message === 'Съдържанието вече е отключено за този потребител.'
        || err.message === 'Съдържанието вече не съществува.'
        || err.message === 'Заявката вече е била обработена.') {
      return res.status(400).json({ error: err.message });
    }
    return res.status(400).json({ error: 'Заявката не можа да бъде потвърдена.' });
  }
}

function rejectPurchase(req, res) {
  const request = getPurchaseRequestById(req.params.id);
  if (!request) {
    return res.status(404).json({ error: 'Заявката не е намерена.' });
  }
  if (request.status !== 'pending') {
    return res.status(400).json({ error: 'Само чакащи заявки могат да бъдат отказани.' });
  }

  try {
    const reason = req.body?.reason ? String(req.body.reason).slice(0, 300) : null;
    const result = db.prepare(`
      UPDATE content_purchase_requests
      SET status = 'rejected',
          rejected_by = ?,
          rejected_at = ?,
          rejection_reason = ?,
          confirmed_by = NULL,
          confirmed_at = NULL
      WHERE id = ?
        AND status = 'pending'
    `).run(req.user.id, getCurrentSofiaDbTimestamp(), reason, request.id);

    if (result.changes === 0) {
      return res.status(400).json({ error: 'Заявката вече е била обработена.' });
    }

    logAdminAction(req, {
      action: 'content_purchase.reject',
      entity_type: 'content_purchase_request',
      entity_id: request.id,
      target_user_id: request.user_id,
      metadata: {
        target_type: request.target_type,
        target_id: request.target_id,
        reason,
      },
    });
    createNotification(request.user_id, {
      type: 'purchase_rejected',
      title: 'Заявката ви за покупка е отказана',
      message: reason ? `Причина: ${reason}` : 'Свържете се с екипа за повече информация.',
      link: '/profile',
      metadata: { target_type: request.target_type, target_id: request.target_id },
    });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: 'Заявката не можа да бъде отказана.' });
  }
}

function deletePurchase(req, res) {
  const request = getPurchaseRequestById(req.params.id);
  if (!request) {
    return res.status(404).json({ error: 'Заявката не е намерена.' });
  }

  try {
    const remove = db.transaction(() => {
      db.prepare(`
        DELETE FROM content_entitlements
        WHERE source_request_id = ?
      `).run(request.id);

      db.prepare(`
        DELETE FROM content_purchase_requests
        WHERE id = ?
      `).run(request.id);
    });
    remove();

    logAdminAction(req, {
      action: 'content_purchase.delete',
      entity_type: 'content_purchase_request',
      entity_id: request.id,
      target_user_id: request.user_id,
      metadata: {
        target_type: request.target_type,
        target_id: request.target_id,
        status: request.status,
      },
    });

    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: 'Заявката не можа да бъде изтрита.' });
  }
}

router.put('/admin/:id/confirm', requireAdmin, confirmPurchase);
router.put('/admin/:id/reject', requireAdmin, rejectPurchase);
router.delete('/admin/:id', requireAdmin, deletePurchase);

export default router;
