import { Router } from 'express';
import db from '../db.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { buildPageResult, parsePagination, parseSort } from '../utils/pagination.js';
import { logAdminAction } from '../utils/audit.js';

const router = Router();
const PLAN_SORT_MAP = {
  sort_order: 'sort_order',
  tier_level: 'tier_level',
  price: 'price',
  name: 'name',
  created_at: 'created_at',
};
const PLAN_NAME_MIN = 2;
const PLAN_NAME_MAX = 80;

function parseFeatures(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseFiniteNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseInteger(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return null;
  return parsed;
}

function normalizeFeaturesInput(value) {
  if (!Array.isArray(value)) return null;
  const normalized = value
    .map((item) => String(item ?? '').trim())
    .filter(Boolean);

  if (normalized.length > 40) return null;
  if (normalized.some((item) => item.length > 160)) return null;
  return normalized;
}

function validatePlanPayload(payload, { partial = false } = {}) {
  const result = {};

  const hasName = payload.name !== undefined;
  if (!partial || hasName) {
    const name = String(payload.name || '').trim();
    if (name.length < PLAN_NAME_MIN || name.length > PLAN_NAME_MAX) {
      return { error: `Името на плана трябва да е между ${PLAN_NAME_MIN} и ${PLAN_NAME_MAX} символа` };
    }
    result.name = name;
  }

  if (payload.description !== undefined) {
    result.description = String(payload.description || '').trim();
  }

  const hasPrice = payload.price !== undefined;
  if (!partial || hasPrice) {
    const price = parseFiniteNumber(payload.price);
    if (price === null || price <= 0 || price > 100000) {
      return { error: 'Цената трябва да е валидно число между 0 и 100000' };
    }
    result.price = Math.round(price * 100) / 100;
  }

  const hasTier = payload.tier_level !== undefined;
  if (!partial || hasTier) {
    const tierLevel = parseInteger(payload.tier_level);
    if (tierLevel === null || tierLevel < 1 || tierLevel > 100) {
      return { error: 'Нивото трябва да е цяло число между 1 и 100' };
    }
    result.tier_level = tierLevel;
  }

  const hasDuration = payload.duration_days !== undefined;
  if (!partial || hasDuration) {
    const durationDays = payload.duration_days === undefined
      ? 30
      : parseInteger(payload.duration_days);
    if (durationDays === null || durationDays < 1 || durationDays > 3650) {
      return { error: 'Продължителността трябва да е цяло число между 1 и 3650 дни' };
    }
    result.duration_days = durationDays;
  }

  if (payload.features !== undefined) {
    const normalizedFeatures = normalizeFeaturesInput(payload.features);
    if (!normalizedFeatures) {
      return { error: 'Features трябва да е масив до 40 елемента, всеки до 160 символа' };
    }
    result.features = normalizedFeatures;
  }

  if (payload.sort_order !== undefined) {
    const sortOrder = parseInteger(payload.sort_order);
    if (sortOrder === null || sortOrder < -100000 || sortOrder > 100000) {
      return { error: 'Подредбата трябва да е цяло число между -100000 и 100000' };
    }
    result.sort_order = sortOrder;
  }

  if (payload.is_active !== undefined) {
    result.is_active = payload.is_active ? 1 : 0;
  }

  if (payload.is_popular !== undefined) {
    result.is_popular = payload.is_popular ? 1 : 0;
  }

  return { value: result };
}

router.get('/', requireAuth, (req, res) => {
  const plans = db.prepare(`
    SELECT id, name, description, price, tier_level, features, sort_order, is_popular
    FROM subscription_plans
    WHERE is_active = 1
    ORDER BY sort_order ASC, tier_level ASC
  `).all();

  const result = plans.map((plan) => ({
    ...plan,
    features: parseFeatures(plan.features),
  }));

  res.set('Cache-Control', 'private, max-age=30');
  res.json(result);
});

router.get('/admin/all', requireAdmin, (req, res) => {
  const { page, pageSize, offset } = parsePagination(req.query, { defaultPageSize: 20, maxPageSize: 100 });
  const { sortBy, sortColumn, sortDir } = parseSort(req.query, PLAN_SORT_MAP, 'sort_order', 'asc');

  const q = String(req.query.q || '').trim();
  const activeRaw = String(req.query.is_active || '').trim().toLowerCase();
  const where = [];
  const params = [];

  if (q) {
    where.push('(name LIKE ? OR description LIKE ?)');
    params.push(`%${q}%`, `%${q}%`);
  }

  if (activeRaw === '1' || activeRaw === '0') {
    where.push('is_active = ?');
    params.push(activeRaw === '1' ? 1 : 0);
  }

  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  const total = db.prepare(`SELECT COUNT(*) as count FROM subscription_plans ${whereSql}`).get(...params)?.count || 0;

  const plans = db.prepare(`
    SELECT *
    FROM subscription_plans
    ${whereSql}
    ORDER BY ${sortColumn} ${sortDir}, id DESC
    LIMIT ? OFFSET ?
  `).all(...params, pageSize, offset).map((plan) => ({
    ...plan,
    features: parseFeatures(plan.features),
  }));

  res.json(
    buildPageResult(plans, page, pageSize, total, {
      sort_by: sortBy,
      sort_dir: sortDir.toLowerCase(),
    })
  );
});

router.post('/admin', requireAdmin, (req, res) => {
  const validation = validatePlanPayload(req.body || {});
  if (validation.error) {
    return res.status(400).json({ error: validation.error });
  }
  const payload = validation.value;

  const result = db.prepare(`
    INSERT INTO subscription_plans (
      name, description, price, tier_level, duration_days,
      features, sort_order, is_active, is_popular
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    payload.name,
    payload.description || '',
    payload.price,
    payload.tier_level,
    payload.duration_days,
    JSON.stringify(payload.features || []),
    payload.sort_order ?? 0,
    payload.is_active ?? 1,
    payload.is_popular ?? 0
  );

  const plan = db.prepare('SELECT * FROM subscription_plans WHERE id = ?').get(result.lastInsertRowid);
  logAdminAction(req, {
    action: 'plan.create',
    entity_type: 'subscription_plan',
    entity_id: plan.id,
    metadata: {
      name: plan.name,
      price: plan.price,
      tier_level: plan.tier_level,
      duration_days: plan.duration_days,
      is_active: plan.is_active,
      sort_order: plan.sort_order,
    },
  });
  res.status(201).json({ ...plan, features: parseFeatures(plan.features) });
});

router.put('/admin/:id', requireAdmin, (req, res) => {
  const existing = db.prepare('SELECT * FROM subscription_plans WHERE id = ?').get(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Планът не е намерен' });
  }

  const validation = validatePlanPayload(req.body || {}, { partial: true });
  if (validation.error) {
    return res.status(400).json({ error: validation.error });
  }
  const payload = validation.value;

  db.prepare(`
    UPDATE subscription_plans SET
      name = ?, description = ?, price = ?, tier_level = ?,
      duration_days = ?, features = ?, sort_order = ?, is_active = ?, is_popular = ?
    WHERE id = ?
  `).run(
    payload.name ?? existing.name,
    payload.description ?? existing.description,
    payload.price ?? existing.price,
    payload.tier_level ?? existing.tier_level,
    payload.duration_days ?? existing.duration_days,
    payload.features !== undefined ? JSON.stringify(payload.features) : existing.features,
    payload.sort_order ?? existing.sort_order,
    payload.is_active ?? existing.is_active,
    payload.is_popular ?? existing.is_popular,
    req.params.id
  );

  const updated = db.prepare('SELECT * FROM subscription_plans WHERE id = ?').get(req.params.id);
  logAdminAction(req, {
    action: 'plan.update',
    entity_type: 'subscription_plan',
    entity_id: req.params.id,
    metadata: {
      previous: {
        name: existing.name,
        price: existing.price,
        tier_level: existing.tier_level,
        duration_days: existing.duration_days,
        is_active: existing.is_active,
        sort_order: existing.sort_order,
      },
      next: {
        name: updated.name,
        price: updated.price,
        tier_level: updated.tier_level,
        duration_days: updated.duration_days,
        is_active: updated.is_active,
        sort_order: updated.sort_order,
      },
    },
  });
  res.json({ ...updated, features: parseFeatures(updated.features) });
});

router.put('/admin/:id/reorder', requireAdmin, (req, res) => {
  const direction = String(req.body?.direction || '').toLowerCase();
  if (!['up', 'down'].includes(direction)) {
    return res.status(400).json({ error: 'Невалидна посока' });
  }

  const current = db.prepare('SELECT id, sort_order FROM subscription_plans WHERE id = ?').get(req.params.id);
  if (!current) {
    return res.status(404).json({ error: 'Планът не е намерен' });
  }

  const target = direction === 'up'
    ? db.prepare(`
      SELECT id, sort_order
      FROM subscription_plans
      WHERE (sort_order < ? OR (sort_order = ? AND id < ?))
      ORDER BY sort_order DESC, id DESC
      LIMIT 1
    `).get(current.sort_order, current.sort_order, current.id)
    : db.prepare(`
      SELECT id, sort_order
      FROM subscription_plans
      WHERE (sort_order > ? OR (sort_order = ? AND id > ?))
      ORDER BY sort_order ASC, id ASC
      LIMIT 1
    `).get(current.sort_order, current.sort_order, current.id);

  if (!target) {
    return res.json({ success: true, moved: false });
  }

  const swap = db.transaction(() => {
    db.prepare('UPDATE subscription_plans SET sort_order = ? WHERE id = ?').run(target.sort_order, current.id);
    db.prepare('UPDATE subscription_plans SET sort_order = ? WHERE id = ?').run(current.sort_order, target.id);
  });
  swap();

  logAdminAction(req, {
    action: 'plan.reorder',
    entity_type: 'subscription_plan',
    entity_id: req.params.id,
    metadata: {
      direction,
      from_sort_order: current.sort_order,
      to_sort_order: target.sort_order,
      swapped_with_id: target.id,
    },
  });
  res.json({ success: true, moved: true });
});

router.delete('/admin/:id', requireAdmin, (req, res) => {
  const plan = db.prepare('SELECT id, name, tier_level, price FROM subscription_plans WHERE id = ?').get(req.params.id);
  if (!plan) {
    return res.status(404).json({ error: 'Планът не е намерен' });
  }

  const usersOnPlan = db.prepare(
    'SELECT COUNT(*) as count FROM users WHERE subscription_plan_id = ?'
  ).get(req.params.id);

  if (usersOnPlan.count > 0) {
    return res.status(400).json({
      error: `Не може да се изтрие - ${usersOnPlan.count} потребител(я) използват този план`,
    });
  }

  const paymentsOnPlan = db.prepare(`
    SELECT COUNT(*) as count
    FROM payment_references
    WHERE plan_id = ?
  `).get(req.params.id)?.count || 0;

  if (paymentsOnPlan > 0) {
    return res.status(400).json({
      error: `Не може да се изтрие - планът присъства в ${paymentsOnPlan} плащания`,
    });
  }

  db.prepare('DELETE FROM subscription_plans WHERE id = ?').run(req.params.id);
  logAdminAction(req, {
    action: 'plan.delete',
    entity_type: 'subscription_plan',
    entity_id: req.params.id,
    metadata: {
      name: plan.name,
      tier_level: plan.tier_level,
      price: plan.price,
    },
  });
  res.json({ success: true });
});

router.put('/admin/:id/status', requireAdmin, (req, res) => {
  const { is_active } = req.body;
  if (is_active === undefined) {
    return res.status(400).json({ error: 'Липсва is_active параметър' });
  }

  const plan = db.prepare('SELECT id, name, is_active FROM subscription_plans WHERE id = ?').get(req.params.id);
  if (!plan) {
    return res.status(404).json({ error: 'Планът не е намерен' });
  }

  const newValue = is_active ? 1 : 0;
  if (plan.is_active === newValue) {
    return res.json({ success: true, updated: false });
  }

  db.prepare('UPDATE subscription_plans SET is_active = ?, updated_at = datetime(\'now\') WHERE id = ?').run(newValue, req.params.id);

  logAdminAction(req, {
    action: 'plan.status_update',
    entity_type: 'subscription_plan',
    entity_id: req.params.id,
    metadata: {
      name: plan.name,
      from_is_active: plan.is_active,
      to_is_active: newValue,
    },
  });

  res.json({ success: true, updated: true, is_active: newValue });
});

export default router;
