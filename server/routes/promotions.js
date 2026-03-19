import { Router } from 'express';
import db from '../db.js';
import { requireAdmin, requireAuth } from '../middleware/auth.js';
import { logAdminAction } from '../utils/audit.js';
import { buildPageResult, parsePagination } from '../utils/pagination.js';
import { getCurrentSofiaDbTimestamp } from '../utils/sofiaTime.js';
import { getActivePromotions, userQualifiesForPromotion } from '../utils/promotions.js';

const router = Router();

const VALID_TYPES = ['flash_sale', 'seasonal', 'first_purchase', 'loyalty', 'volume'];
const VALID_DISCOUNT_TYPES = ['percent', 'fixed'];
const VALID_APPLIES_TO = ['all', 'subscriptions', 'purchases'];

// User: get active promotions they qualify for
router.get('/active', requireAuth, (req, res) => {
  const promotions = getActivePromotions('all');
  const qualified = promotions.filter((p) => userQualifiesForPromotion(req.user.id, p));
  res.json(qualified.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    type: p.type,
    discount_type: p.discount_type,
    discount_value: p.discount_value,
    applies_to: p.applies_to,
    ends_at: p.ends_at,
  })));
});

// Admin: list all promotions
router.get('/admin', requireAdmin, (req, res) => {
  const { page, pageSize, offset } = parsePagination(req.query);
  const total = db.prepare('SELECT COUNT(*) as count FROM promotions').get()?.count || 0;
  const rows = db.prepare(`
    SELECT * FROM promotions
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `).all(pageSize, offset);
  res.json(buildPageResult(rows, page, pageSize, total));
});

// Admin: create promotion
router.post('/admin', requireAdmin, (req, res) => {
  const { name, description, type, discount_type, discount_value, conditions, applies_to, starts_at, ends_at, max_uses } = req.body || {};

  if (!name || !String(name).trim()) return res.status(400).json({ error: 'Името е задължително.' });
  if (!VALID_TYPES.includes(type)) return res.status(400).json({ error: 'Невалиден тип промоция.' });

  const dt = VALID_DISCOUNT_TYPES.includes(discount_type) ? discount_type : 'percent';
  const dv = Number(discount_value);
  if (!Number.isFinite(dv) || dv <= 0) return res.status(400).json({ error: 'Невалидна стойност на отстъпката.' });
  if (dt === 'percent' && dv > 100) return res.status(400).json({ error: 'Процентната отстъпка не може да надвишава 100%.' });

  const at = VALID_APPLIES_TO.includes(applies_to) ? applies_to : 'all';
  const conditionsJson = conditions ? JSON.stringify(conditions) : null;
  const maxUsesVal = max_uses ? Number(max_uses) : null;

  const result = db.prepare(`
    INSERT INTO promotions (name, description, type, discount_type, discount_value, conditions, applies_to, starts_at, ends_at, max_uses)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(String(name).trim(), description || null, type, dt, dv, conditionsJson, at, starts_at || null, ends_at || null, maxUsesVal);

  logAdminAction(req, {
    action: 'promotion.create',
    entity_type: 'promotion',
    entity_id: result.lastInsertRowid,
    metadata: { name, type, discount_value: dv },
  });

  res.status(201).json({ success: true, id: result.lastInsertRowid });
});

// Admin: update promotion
router.put('/admin/:id', requireAdmin, (req, res) => {
  const existing = db.prepare('SELECT * FROM promotions WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Промоцията не е намерена.' });

  const b = req.body || {};
  const name = b.name !== undefined ? String(b.name).trim() : existing.name;
  const description = b.description !== undefined ? b.description : existing.description;
  const type = b.type !== undefined ? b.type : existing.type;
  const discount_type = b.discount_type !== undefined ? b.discount_type : existing.discount_type;
  const discount_value = b.discount_value !== undefined ? Number(b.discount_value) : existing.discount_value;
  const conditions = b.conditions !== undefined ? (b.conditions ? JSON.stringify(b.conditions) : null) : existing.conditions;
  const applies_to = b.applies_to !== undefined ? b.applies_to : existing.applies_to;
  const starts_at = b.starts_at !== undefined ? (b.starts_at || null) : existing.starts_at;
  const ends_at = b.ends_at !== undefined ? (b.ends_at || null) : existing.ends_at;
  const is_active = b.is_active !== undefined ? (b.is_active ? 1 : 0) : existing.is_active;
  const max_uses = b.max_uses !== undefined ? (b.max_uses ? Number(b.max_uses) : null) : existing.max_uses;

  if (!name) return res.status(400).json({ error: 'Името е задължително.' });
  if (!VALID_TYPES.includes(type)) return res.status(400).json({ error: 'Невалиден тип промоция.' });
  if (!Number.isFinite(discount_value) || discount_value <= 0) return res.status(400).json({ error: 'Невалидна стойност на отстъпката.' });

  db.prepare(`
    UPDATE promotions SET
      name = ?, description = ?, type = ?, discount_type = ?, discount_value = ?,
      conditions = ?, applies_to = ?, starts_at = ?, ends_at = ?,
      is_active = ?, max_uses = ?, updated_at = ?
    WHERE id = ?
  `).run(name, description, type, discount_type, discount_value, conditions, applies_to, starts_at, ends_at, is_active, max_uses, getCurrentSofiaDbTimestamp(), req.params.id);

  logAdminAction(req, { action: 'promotion.update', entity_type: 'promotion', entity_id: req.params.id });
  res.json({ success: true });
});

// Admin: delete promotion
router.delete('/admin/:id', requireAdmin, (req, res) => {
  const promo = db.prepare('SELECT id, name FROM promotions WHERE id = ?').get(req.params.id);
  if (!promo) return res.status(404).json({ error: 'Промоцията не е намерена.' });

  db.prepare('DELETE FROM promotion_usages WHERE promotion_id = ?').run(req.params.id);
  db.prepare('DELETE FROM promotions WHERE id = ?').run(req.params.id);

  logAdminAction(req, {
    action: 'promotion.delete',
    entity_type: 'promotion',
    entity_id: req.params.id,
    metadata: { name: promo.name },
  });

  res.json({ success: true });
});

export default router;
