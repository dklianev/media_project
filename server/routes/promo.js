import { Router } from 'express';
import db from '../db.js';
import { requireAdmin } from '../middleware/auth.js';
import { buildPageResult, parsePagination, parseSort, toInt } from '../utils/pagination.js';
import { logAdminAction } from '../utils/audit.js';

const router = Router();
const PROMO_SORT_MAP = {
  created_at: 'created_at',
  discount_percent: 'discount_percent',
  uses_count: 'uses_count',
  code: 'code',
};
const PROMO_CODE_REGEX = /^[A-Z0-9_-]{3,40}$/;

function normalizePromoCode(value) {
  const code = String(value || '').trim().toUpperCase();
  if (!code || !PROMO_CODE_REGEX.test(code)) return null;
  return code;
}

function normalizeExpiresAt(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

router.get('/', requireAdmin, (req, res) => {
  const { page, pageSize, offset } = parsePagination(req.query, { defaultPageSize: 20, maxPageSize: 100 });
  const { sortBy, sortColumn, sortDir } = parseSort(req.query, PROMO_SORT_MAP, 'created_at', 'desc');
  const q = String(req.query.q || '').trim();
  const activeRaw = String(req.query.is_active || '').trim().toLowerCase();

  const where = [];
  const params = [];

  if (q) {
    where.push('code LIKE ?');
    params.push(`%${q.toUpperCase()}%`);
  }

  if (activeRaw === '1' || activeRaw === '0') {
    where.push('is_active = ?');
    params.push(activeRaw === '1' ? 1 : 0);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = db.prepare(`SELECT COUNT(*) as count FROM promo_codes ${whereSql}`).get(...params)?.count || 0;

  const codes = db.prepare(`
    SELECT *
    FROM promo_codes
    ${whereSql}
    ORDER BY ${sortColumn} ${sortDir}, id DESC
    LIMIT ? OFFSET ?
  `).all(...params, pageSize, offset);

  res.json(
    buildPageResult(codes, page, pageSize, total, {
      sort_by: sortBy,
      sort_dir: sortDir.toLowerCase(),
    })
  );
});

router.post('/', requireAdmin, (req, res) => {
  const { code, discount_percent, max_uses, expires_at, is_active } = req.body;

  if (code === undefined || code === null || discount_percent === undefined || discount_percent === null) {
    return res.status(400).json({ error: 'Кодът и процентът отстъпка са задължителни' });
  }

  const normalizedCode = normalizePromoCode(code);
  if (!normalizedCode) {
    return res.status(400).json({ error: 'Кодът трябва да е 3-40 символа (A-Z, 0-9, _, -)' });
  }

  const discountValue = toInt(discount_percent, 0);
  if (discountValue < 1 || discountValue > 100) {
    return res.status(400).json({ error: 'Отстъпката трябва да е между 1% и 100%' });
  }

  const existing = db.prepare('SELECT id FROM promo_codes WHERE code = ?').get(normalizedCode);
  if (existing) {
    return res.status(400).json({ error: 'Този промо код вече съществува' });
  }

  let maxUsesValue = null;
  if (max_uses !== undefined && max_uses !== null && String(max_uses).trim() !== '') {
    maxUsesValue = toInt(max_uses, null);
    if (!Number.isInteger(maxUsesValue) || maxUsesValue < 1) {
      return res.status(400).json({ error: 'Максималните използвания трябва да са цяло число >= 1' });
    }
  }

  let expiresAtValue = null;
  if (expires_at !== undefined) {
    expiresAtValue = normalizeExpiresAt(expires_at);
    if (expires_at && !expiresAtValue) {
      return res.status(400).json({ error: 'Невалидна дата на изтичане' });
    }
  }

  let result;
  try {
    result = db.prepare(`
      INSERT INTO promo_codes (code, discount_percent, max_uses, expires_at, is_active)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      normalizedCode,
      discountValue,
      maxUsesValue,
      expiresAtValue,
      is_active === false ? 0 : 1
    );
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE' || err.message?.includes('UNIQUE')) {
      return res.status(400).json({ error: 'Този промо код вече съществува' });
    }
    throw err;
  }

  const promo = db.prepare('SELECT * FROM promo_codes WHERE id = ?').get(result.lastInsertRowid);
  logAdminAction(req, {
    action: 'promo.create',
    entity_type: 'promo_code',
    entity_id: promo.id,
    metadata: {
      code: promo.code,
      discount_percent: promo.discount_percent,
      max_uses: promo.max_uses,
      expires_at: promo.expires_at,
      is_active: promo.is_active,
    },
  });
  res.status(201).json(promo);
});

router.put('/:id', requireAdmin, (req, res) => {
  const existing = db.prepare('SELECT * FROM promo_codes WHERE id = ?').get(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Промо кодът не е намерен' });
  }

  const { code, discount_percent, max_uses, expires_at, is_active } = req.body;
  const updates = {};

  if (code !== undefined) {
    const normalizedCode = normalizePromoCode(code);
    if (!normalizedCode) {
      return res.status(400).json({ error: 'Кодът трябва да е 3-40 символа (A-Z, 0-9, _, -)' });
    }

    const duplicate = db.prepare('SELECT id FROM promo_codes WHERE code = ? AND id != ?')
      .get(normalizedCode, req.params.id);
    if (duplicate) {
      return res.status(400).json({ error: 'Този промо код вече съществува' });
    }
    updates.code = normalizedCode;
  }

  if (discount_percent !== undefined) {
    const discountValue = toInt(discount_percent, existing.discount_percent);
    if (discountValue < 1 || discountValue > 100) {
      return res.status(400).json({ error: 'Отстъпката трябва да е между 1% и 100%' });
    }
    updates.discount_percent = discountValue;
  }

  if (max_uses !== undefined) {
    if (max_uses === null || String(max_uses).trim() === '') {
      updates.max_uses = null;
    } else {
      const maxUsesValue = toInt(max_uses, null);
      if (!Number.isInteger(maxUsesValue) || maxUsesValue < 1) {
        return res.status(400).json({ error: 'Максималните използвания трябва да са цяло число >= 1' });
      }
      if (maxUsesValue < Number(existing.uses_count || 0)) {
        return res.status(400).json({ error: 'Максималните използвания не могат да са под вече използваните' });
      }
      updates.max_uses = maxUsesValue;
    }
  }

  if (expires_at !== undefined) {
    if (!expires_at || String(expires_at).trim() === '') {
      updates.expires_at = null;
    } else {
      const expiresAtValue = normalizeExpiresAt(expires_at);
      if (!expiresAtValue) {
        return res.status(400).json({ error: 'Невалидна дата на изтичане' });
      }
      updates.expires_at = expiresAtValue;
    }
  }

  if (is_active !== undefined) {
    updates.is_active = is_active ? 1 : 0;
  }

  try {
    db.prepare(`
      UPDATE promo_codes SET
        code = ?, discount_percent = ?, max_uses = ?,
        expires_at = ?, is_active = ?
      WHERE id = ?
    `).run(
      updates.code ?? existing.code,
      updates.discount_percent ?? existing.discount_percent,
      updates.max_uses !== undefined ? updates.max_uses : existing.max_uses,
      updates.expires_at !== undefined ? updates.expires_at : existing.expires_at,
      updates.is_active ?? existing.is_active,
      req.params.id
    );
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE' || err.message?.includes('UNIQUE')) {
      return res.status(400).json({ error: 'Този промо код вече съществува' });
    }
    throw err;
  }

  const updated = db.prepare('SELECT * FROM promo_codes WHERE id = ?').get(req.params.id);
  logAdminAction(req, {
    action: 'promo.update',
    entity_type: 'promo_code',
    entity_id: req.params.id,
    metadata: {
      previous: {
        code: existing.code,
        discount_percent: existing.discount_percent,
        max_uses: existing.max_uses,
        expires_at: existing.expires_at,
        is_active: existing.is_active,
      },
      next: {
        code: updated.code,
        discount_percent: updated.discount_percent,
        max_uses: updated.max_uses,
        expires_at: updated.expires_at,
        is_active: updated.is_active,
      },
    },
  });
  res.json(updated);
});

router.delete('/:id', requireAdmin, (req, res) => {
  const promo = db.prepare('SELECT id, code, discount_percent FROM promo_codes WHERE id = ?').get(req.params.id);
  if (!promo) {
    return res.status(404).json({ error: 'Промо кодът не е намерен' });
  }

  const linkedPayments = db.prepare(`
    SELECT COUNT(*) as count
    FROM payment_references
    WHERE promo_code_id = ?
  `).get(req.params.id)?.count || 0;

  if (linkedPayments > 0) {
    return res.status(400).json({
      error: `Промо кодът е използван в ${linkedPayments} плащания и не може да бъде изтрит`,
    });
  }

  db.prepare('DELETE FROM promo_codes WHERE id = ?').run(req.params.id);
  logAdminAction(req, {
    action: 'promo.delete',
    entity_type: 'promo_code',
    entity_id: req.params.id,
    metadata: {
      code: promo.code,
      discount_percent: promo.discount_percent,
      linked_payments: linkedPayments,
    },
  });
  res.json({ success: true });
});

export default router;
