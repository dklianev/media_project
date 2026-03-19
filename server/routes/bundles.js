import { Router } from 'express';
import crypto from 'crypto';
import db from '../db.js';
import { requireAdmin, requireAuth } from '../middleware/auth.js';
import { logAdminAction } from '../utils/audit.js';
import { getCurrentSofiaDbTimestamp } from '../utils/sofiaTime.js';
import { buildPageResult, parsePagination } from '../utils/pagination.js';
import {
  getUserPurchaseState,
  hasPendingEpisodePurchase,
  evaluateEpisodeAccess,
} from '../utils/contentPurchases.js';

const router = Router();

// User: get available bundles (optionally for a production)
router.get('/available', requireAuth, (req, res) => {
  const productionId = req.query.production_id ? Number(req.query.production_id) : null;
  const now = getCurrentSofiaDbTimestamp();

  let query = `
    SELECT * FROM bundles
    WHERE is_active = 1
      AND (starts_at IS NULL OR starts_at <= ?)
      AND (ends_at IS NULL OR ends_at >= ?)
  `;
  const params = [now, now];

  if (productionId) {
    query += ' AND (production_id = ? OR production_id IS NULL)';
    params.push(productionId);
  }

  query += ' ORDER BY created_at DESC';
  res.json(db.prepare(query).all(...params));
});

// User: purchase a bundle
router.post('/purchase', requireAuth, (req, res) => {
  const { bundle_id } = req.body || {};
  const bundleId = Number(bundle_id);
  if (!Number.isFinite(bundleId) || bundleId <= 0) {
    return res.status(400).json({ error: 'Невалиден пакет.' });
  }

  const now = getCurrentSofiaDbTimestamp();
  const bundle = db.prepare(`
    SELECT * FROM bundles
    WHERE id = ? AND is_active = 1
      AND (starts_at IS NULL OR starts_at <= ?)
      AND (ends_at IS NULL OR ends_at >= ?)
  `).get(bundleId, now, now);

  if (!bundle) {
    return res.status(404).json({ error: 'Пакетът не е намерен или не е активен.' });
  }

  // For quantity bundles: the episodes must be selected by the user
  // For fixed bundles: the episodes are pre-defined
  let episodeIds;
  if (bundle.bundle_type === 'fixed' && bundle.episode_ids) {
    episodeIds = JSON.parse(bundle.episode_ids);
  } else {
    episodeIds = req.body.episode_ids;
    if (!Array.isArray(episodeIds) || episodeIds.length < (bundle.buy_count || 1)) {
      return res.status(400).json({ error: `Изберете поне ${bundle.buy_count || 1} епизода.` });
    }
  }

  // Validate all selected episodes exist, are active, published, and within availability window
  const placeholders = episodeIds.map(() => '?').join(',');
  const currentTimestamp = getCurrentSofiaDbTimestamp();
  const episodes = db.prepare(`
    SELECT
      e.id,
      e.title,
      e.episode_number,
      e.purchase_price,
      e.purchase_enabled,
      e.production_id,
      e.access_group,
      e.available_from,
      e.available_until,
      p.title as production_title,
      p.slug as production_slug,
      p.required_tier,
      p.access_group as production_access_group,
      p.purchase_mode as production_purchase_mode,
      p.purchase_price as production_purchase_price,
      p.available_from as production_available_from,
      p.available_until as production_available_until
    FROM episodes e
    JOIN productions p ON p.id = e.production_id
    WHERE e.id IN (${placeholders}) AND e.is_active = 1 AND p.is_active = 1
      AND (e.published_at IS NULL OR e.published_at <= ?)
  `).all(...episodeIds, currentTimestamp);

  if (episodes.length !== episodeIds.length) {
    return res.status(400).json({ error: 'Някои от избраните епизоди не са налични.' });
  }

  // Check entitlements and pending requests for each episode
  const purchaseState = getUserPurchaseState(req.user.id);
  for (const ep of episodes) {
    const access = evaluateEpisodeAccess(ep, req.user, purchaseState);
    if (access.isPurchased) {
      return res.status(409).json({ error: `Епизод "${ep.title}" вече е закупен.` });
    }
    if (hasPendingEpisodePurchase(purchaseState, ep.id)) {
      return res.status(409).json({ error: `Вече има активна заявка за епизод "${ep.title}".` });
    }
  }

  // Calculate total bundle price
  let totalPrice;
  if (bundle.fixed_price) {
    totalPrice = bundle.fixed_price;
  } else if (bundle.buy_count && bundle.pay_count) {
    // Sort by price descending, charge for pay_count most expensive
    const prices = episodes.map((e) => e.purchase_price || 0).sort((a, b) => b - a);
    totalPrice = prices.slice(0, bundle.pay_count).reduce((sum, p) => sum + p, 0);
  } else {
    return res.status(400).json({ error: 'Невалидна конфигурация на пакета.' });
  }

  // Distribute total price proportionally across episodes
  const sumOriginalPrices = episodes.reduce((s, e) => s + (e.purchase_price || 0), 0);
  const episodesWithPrices = episodes.map((ep) => {
    const originalPrice = ep.purchase_price || 0;
    const finalPrice = sumOriginalPrices > 0
      ? Math.round((originalPrice / sumOriginalPrices) * totalPrice * 100) / 100
      : Math.round((totalPrice / episodes.length) * 100) / 100;
    return { ...ep, originalPrice, finalPrice };
  });

  // Adjust rounding so final prices sum to totalPrice exactly
  const sumFinal = episodesWithPrices.reduce((s, e) => s + e.finalPrice, 0);
  const diff = Math.round((totalPrice - sumFinal) * 100) / 100;
  if (diff !== 0 && episodesWithPrices.length > 0) {
    episodesWithPrices[0].finalPrice = Math.round((episodesWithPrices[0].finalPrice + diff) * 100) / 100;
  }

  // Generate shared bundle reference code prefix
  const bundleRef = 'BDL-' + crypto.randomBytes(3).toString('hex').toUpperCase();

  // Create individual episode purchase requests inside a transaction
  const requestIds = [];
  const createBundleRequests = db.transaction(() => {
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
      VALUES (?, 'episode', ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (let i = 0; i < episodesWithPrices.length; i++) {
      const ep = episodesWithPrices[i];
      const referenceCode = `${bundleRef}-${i + 1}`;
      const result = insert.run(
        req.user.id,
        ep.id,
        ep.title,
        ep.production_title,
        ep.production_slug,
        ep.episode_number ?? null,
        referenceCode,
        ep.originalPrice,
        ep.finalPrice
      );
      requestIds.push(result.lastInsertRowid);
    }
  });

  createBundleRequests();

  // Get IBAN info
  const iban = db.prepare("SELECT value FROM site_settings WHERE key = 'iban'").get()?.value || '';
  const paymentInfo = db.prepare("SELECT value FROM site_settings WHERE key = 'payment_info'").get()?.value || '';

  res.status(201).json({
    success: true,
    request_ids: requestIds,
    reference_code: bundleRef,
    total_price: totalPrice,
    episode_count: episodesWithPrices.length,
    episodes: episodesWithPrices.map((ep, i) => ({
      request_id: requestIds[i],
      episode_id: ep.id,
      title: ep.title,
      reference_code: `${bundleRef}-${i + 1}`,
      original_price: ep.originalPrice,
      final_price: ep.finalPrice,
    })),
    iban,
    payment_info: paymentInfo,
  });
});

// Admin: list bundles
router.get('/admin', requireAdmin, (req, res) => {
  const { page, pageSize, offset } = parsePagination(req.query);
  const total = db.prepare('SELECT COUNT(*) as count FROM bundles').get()?.count || 0;
  const rows = db.prepare('SELECT * FROM bundles ORDER BY created_at DESC LIMIT ? OFFSET ?').all(pageSize, offset);
  res.json(buildPageResult(rows, page, pageSize, total));
});

// Admin: create bundle
router.post('/admin', requireAdmin, (req, res) => {
  const { name, description, production_id, bundle_type, buy_count, pay_count, fixed_price, episode_ids, starts_at, ends_at } = req.body || {};

  if (!name || !String(name).trim()) return res.status(400).json({ error: 'Името е задължително.' });

  const bt = bundle_type === 'fixed' ? 'fixed' : 'quantity';

  if (bt === 'quantity') {
    if (!buy_count || !pay_count || buy_count <= pay_count) {
      return res.status(400).json({ error: 'buy_count трябва да е по-голям от pay_count.' });
    }
  }

  const result = db.prepare(`
    INSERT INTO bundles (name, description, production_id, bundle_type, buy_count, pay_count, fixed_price, episode_ids, starts_at, ends_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    String(name).trim(), description || null, production_id || null, bt,
    buy_count || null, pay_count || null, fixed_price || null,
    episode_ids ? JSON.stringify(episode_ids) : null,
    starts_at || null, ends_at || null
  );

  logAdminAction(req, { action: 'bundle.create', entity_type: 'bundle', entity_id: result.lastInsertRowid, metadata: { name } });
  res.status(201).json({ success: true, id: result.lastInsertRowid });
});

// Admin: update bundle
router.put('/admin/:id', requireAdmin, (req, res) => {
  const existing = db.prepare('SELECT * FROM bundles WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Пакетът не е намерен.' });

  const b = req.body || {};
  db.prepare(`
    UPDATE bundles SET
      name = ?, description = ?, production_id = ?, bundle_type = ?,
      buy_count = ?, pay_count = ?, fixed_price = ?, episode_ids = ?,
      is_active = ?, starts_at = ?, ends_at = ?, updated_at = ?
    WHERE id = ?
  `).run(
    b.name !== undefined ? String(b.name).trim() : existing.name,
    b.description !== undefined ? b.description : existing.description,
    b.production_id !== undefined ? b.production_id : existing.production_id,
    b.bundle_type !== undefined ? b.bundle_type : existing.bundle_type,
    b.buy_count !== undefined ? b.buy_count : existing.buy_count,
    b.pay_count !== undefined ? b.pay_count : existing.pay_count,
    b.fixed_price !== undefined ? b.fixed_price : existing.fixed_price,
    b.episode_ids !== undefined ? JSON.stringify(b.episode_ids) : existing.episode_ids,
    b.is_active !== undefined ? (b.is_active ? 1 : 0) : existing.is_active,
    b.starts_at !== undefined ? (b.starts_at || null) : existing.starts_at,
    b.ends_at !== undefined ? (b.ends_at || null) : existing.ends_at,
    getCurrentSofiaDbTimestamp(),
    req.params.id
  );

  logAdminAction(req, { action: 'bundle.update', entity_type: 'bundle', entity_id: req.params.id });
  res.json({ success: true });
});

// Admin: delete bundle
router.delete('/admin/:id', requireAdmin, (req, res) => {
  const bundle = db.prepare('SELECT id, name FROM bundles WHERE id = ?').get(req.params.id);
  if (!bundle) return res.status(404).json({ error: 'Пакетът не е намерен.' });

  db.prepare('DELETE FROM bundles WHERE id = ?').run(req.params.id);
  logAdminAction(req, { action: 'bundle.delete', entity_type: 'bundle', entity_id: req.params.id, metadata: { name: bundle.name } });
  res.json({ success: true });
});

export default router;
