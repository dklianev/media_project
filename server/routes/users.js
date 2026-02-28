import { Router } from 'express';
import db from '../db.js';
import { requireAdmin, requireSuperAdmin } from '../middleware/auth.js';
import { buildPageResult, parsePagination, parseSort, toInt } from '../utils/pagination.js';
import { logAdminAction } from '../utils/audit.js';

const router = Router();
const USER_ROLES = ['user', 'admin', 'superadmin', 'banned'];
const USER_SORT_MAP = {
  created_at: 'u.created_at',
  updated_at: 'u.updated_at',
  character_name: 'u.character_name',
  role: 'u.role',
};

function parsePlanId(value) {
  if (value === null || value === undefined || value === '' || value === 0 || value === '0') return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return null;
  return parsed;
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
  const { sortBy, sortColumn, sortDir } = parseSort(req.query, USER_SORT_MAP, 'created_at', 'desc');

  const q = String(req.query.q || '').trim();
  const roleFilter = String(req.query.role || '').trim().toLowerCase();
  const planFilter = String(req.query.plan_id || '').trim().toLowerCase();

  const where = [];
  const params = [];

  if (q) {
    where.push('(u.character_name LIKE ? OR u.discord_username LIKE ?)');
    params.push(`%${q}%`, `%${q}%`);
  }

  if (USER_ROLES.includes(roleFilter)) {
    where.push('u.role = ?');
    params.push(roleFilter);
  }

  if (planFilter === 'free') {
    where.push('u.subscription_plan_id IS NULL');
  } else if (planFilter === 'paid') {
    where.push('u.subscription_plan_id IS NOT NULL');
  } else if (planFilter) {
    const planId = toInt(planFilter, null);
    if (planId !== null) {
      where.push('u.subscription_plan_id = ?');
      params.push(planId);
    }
  }

  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

  const total = db.prepare(`
    SELECT COUNT(*) as count
    FROM users u
    ${whereSql}
  `).get(...params)?.count || 0;

  const users = db.prepare(`
    SELECT u.id, u.discord_id, u.discord_username, u.discord_avatar,
           u.character_name, u.role, u.subscription_plan_id,
           u.subscription_expires_at, u.created_at, u.updated_at,
           sp.name as plan_name, sp.tier_level
    FROM users u
    LEFT JOIN subscription_plans sp ON u.subscription_plan_id = sp.id
    ${whereSql}
    ORDER BY ${sortColumn} ${sortDir}, u.id DESC
    LIMIT ? OFFSET ?
  `).all(...params, pageSize, offset);

  res.json(
    buildPageResult(users, page, pageSize, total, {
      sort_by: sortBy,
      sort_dir: sortDir.toLowerCase(),
    })
  );
});

router.put('/:id/subscription', requireAdmin, (req, res) => {
  const { plan_id, expires_at } = req.body;

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) {
    return res.status(404).json({ error: 'Потребителят не е намерен' });
  }

  const hasPlanId = Object.prototype.hasOwnProperty.call(req.body || {}, 'plan_id');
  const hasExpiresAt = Object.prototype.hasOwnProperty.call(req.body || {}, 'expires_at');
  if (!hasPlanId && !hasExpiresAt) {
    return res.status(400).json({ error: 'Липсват данни за обновяване' });
  }

  let nextPlanId = user.subscription_plan_id;
  if (hasPlanId) {
    const rawPlanId = String(plan_id ?? '').trim();
    const clearingPlan = rawPlanId === '' || rawPlanId === '0' || plan_id === null;
    nextPlanId = parsePlanId(plan_id);
    if (!clearingPlan && nextPlanId === null) {
      return res.status(400).json({ error: 'Невалиден план' });
    }
    if (clearingPlan) {
      nextPlanId = null;
    }
  }

  if (nextPlanId !== null) {
    const plan = db.prepare('SELECT id FROM subscription_plans WHERE id = ?').get(nextPlanId);
    if (!plan) {
      return res.status(404).json({ error: 'Планът не е намерен' });
    }
  }

  let nextExpiresAt = user.subscription_expires_at;
  if (hasExpiresAt) {
    if (expires_at === null || String(expires_at).trim() === '') {
      nextExpiresAt = null;
    } else {
      nextExpiresAt = normalizeExpiresAt(expires_at);
      if (!nextExpiresAt) {
        return res.status(400).json({ error: 'Невалидна дата за изтичане' });
      }
    }
  }
  if (nextPlanId === null) {
    nextExpiresAt = null;
  }

  db.prepare(`
    UPDATE users SET
      subscription_plan_id = ?, subscription_expires_at = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(nextPlanId, nextExpiresAt, req.params.id);

  const updated = db.prepare(`
    SELECT u.*, sp.name as plan_name, sp.tier_level
    FROM users u
    LEFT JOIN subscription_plans sp ON u.subscription_plan_id = sp.id
    WHERE u.id = ?
  `).get(req.params.id);

  logAdminAction(req, {
    action: 'user.subscription.update',
    entity_type: 'user',
    entity_id: req.params.id,
    target_user_id: req.params.id,
    metadata: {
      previous_plan_id: user.subscription_plan_id,
      new_plan_id: updated.subscription_plan_id,
      previous_expires_at: user.subscription_expires_at,
      new_expires_at: updated.subscription_expires_at,
    },
  });

  res.json(updated);
});

router.put('/:id/role', requireSuperAdmin, (req, res) => {
  const { role } = req.body;

  if (!['user', 'admin', 'superadmin'].includes(role)) {
    return res.status(400).json({ error: 'Невалидна роля' });
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) {
    return res.status(404).json({ error: 'Потребителят не е намерен' });
  }

  db.prepare(
    'UPDATE users SET role = ?, updated_at = datetime(\'now\') WHERE id = ?'
  ).run(role, req.params.id);

  logAdminAction(req, {
    action: 'user.role.update',
    entity_type: 'user',
    entity_id: req.params.id,
    target_user_id: req.params.id,
    metadata: {
      previous_role: user.role,
      new_role: role,
    },
  });
  res.json({ success: true, role });
});

router.put('/:id/ban', requireAdmin, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) {
    return res.status(404).json({ error: 'Потребителят не е намерен' });
  }

  if (user.role === 'superadmin') {
    return res.status(403).json({ error: 'Не може да се забрани суперадмин' });
  }

  db.prepare(
    'UPDATE users SET role = \'banned\', updated_at = datetime(\'now\') WHERE id = ?'
  ).run(req.params.id);

  logAdminAction(req, {
    action: 'user.ban',
    entity_type: 'user',
    entity_id: req.params.id,
    target_user_id: req.params.id,
    metadata: {
      previous_role: user.role,
    },
  });
  res.json({ success: true });
});

router.put('/:id/unban', requireAdmin, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) {
    return res.status(404).json({ error: 'Потребителят не е намерен' });
  }

  db.prepare(
    'UPDATE users SET role = \'user\', updated_at = datetime(\'now\') WHERE id = ?'
  ).run(req.params.id);

  logAdminAction(req, {
    action: 'user.unban',
    entity_type: 'user',
    entity_id: req.params.id,
    target_user_id: req.params.id,
    metadata: {
      previous_role: user.role,
      new_role: 'user',
    },
  });
  res.json({ success: true });
});

router.get('/me/stats', (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Неоторизиран достъп' });
  }

  try {
    const stats = db.prepare(`
      SELECT 
        SUM(progress_seconds) as total_watch_seconds,
        COUNT(DISTINCT episode_id) as episodes_started
      FROM watch_history
      WHERE user_id = ?
    `).get(req.user.id);

    const recentlyWatched = db.prepare(`
      SELECT e.id, e.title, e.thumbnail_url, p.slug as production_slug, p.title as production_title, wh.progress_seconds, wh.last_watched_at
      FROM watch_history wh
      JOIN episodes e ON wh.episode_id = e.id
      JOIN productions p ON e.production_id = p.id
      WHERE wh.user_id = ?
      ORDER BY wh.last_watched_at DESC
      LIMIT 5
    `).all(req.user.id);

    const topProductions = db.prepare(`
      SELECT p.id, p.title, p.slug, p.thumbnail_url, COUNT(e.id) as eps_watched
      FROM watch_history wh
      JOIN episodes e ON wh.episode_id = e.id
      JOIN productions p ON e.production_id = p.id
      WHERE wh.user_id = ? AND wh.progress_seconds > 60
      GROUP BY p.id
      ORDER BY eps_watched DESC
      LIMIT 3
    `).all(req.user.id);

    res.json({
      total_watch_seconds: stats?.total_watch_seconds || 0,
      episodes_started: stats?.episodes_started || 0,
      recently_watched: recentlyWatched || [],
      top_productions: topProductions || []
    });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ error: 'Грешка при зареждане на статистиката' });
  }
});

export default router;
