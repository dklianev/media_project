import { Router } from 'express';
import db from '../db.js';
import { requireAdmin } from '../middleware/auth.js';

const router = Router();

router.get('/', requireAdmin, (req, res) => {
  const stats = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM users) as total_users,
      (SELECT COUNT(*) FROM users WHERE subscription_plan_id IS NOT NULL) as subscribed_users,
      (SELECT COUNT(*) FROM productions) as total_productions,
      (SELECT COUNT(*) FROM episodes) as total_episodes,
      (SELECT COALESCE(SUM(view_count), 0) FROM episodes) as total_views,
      (SELECT COUNT(*) FROM payment_references) as total_payments,
      (SELECT COUNT(*) FROM payment_references WHERE status = 'pending') as pending_payments,
      (SELECT COUNT(*) FROM payment_references WHERE status = 'confirmed') as confirmed_payments,
      (SELECT COUNT(*) FROM payment_references WHERE status = 'rejected') as rejected_payments,
      (SELECT COUNT(*) FROM payment_references WHERE status = 'cancelled') as cancelled_payments
  `).get();

  res.set('Cache-Control', 'private, max-age=20');
  res.json({
    total_users: Number(stats?.total_users || 0),
    subscribed_users: Number(stats?.subscribed_users || 0),
    total_productions: Number(stats?.total_productions || 0),
    total_episodes: Number(stats?.total_episodes || 0),
    total_views: Number(stats?.total_views || 0),
    total_payments: Number(stats?.total_payments || 0),
    pending_payments: Number(stats?.pending_payments || 0),
    confirmed_payments: Number(stats?.confirmed_payments || 0),
    rejected_payments: Number(stats?.rejected_payments || 0),
    cancelled_payments: Number(stats?.cancelled_payments || 0),
  });
});

// Revenue over time
router.get('/revenue', requireAdmin, (req, res) => {
  const period = req.query.period || 'daily'; // daily, weekly, monthly
  const days = Math.min(Number(req.query.days) || 30, 365);

  let groupBy;
  if (period === 'monthly') groupBy = "strftime('%Y-%m', confirmed_at)";
  else if (period === 'weekly') groupBy = "strftime('%Y-W%W', confirmed_at)";
  else groupBy = "date(confirmed_at)";

  const subscriptionRevenue = db.prepare(`
    SELECT ${groupBy} as period, COALESCE(SUM(final_price), 0) as revenue, COUNT(*) as count
    FROM payment_references
    WHERE status = 'confirmed'
      AND confirmed_at >= datetime('now', '-' || ? || ' days')
    GROUP BY ${groupBy}
    ORDER BY period
  `).all(days);

  const purchaseRevenue = db.prepare(`
    SELECT ${groupBy} as period, COALESCE(SUM(final_price), 0) as revenue, COUNT(*) as count
    FROM content_purchase_requests
    WHERE status = 'confirmed'
      AND confirmed_at >= datetime('now', '-' || ? || ' days')
    GROUP BY ${groupBy}
    ORDER BY period
  `).all(days);

  res.json({ subscriptions: subscriptionRevenue, purchases: purchaseRevenue });
});

// Retention stats
router.get('/retention', requireAdmin, (req, res) => {
  const totalSubscribed = db.prepare(
    "SELECT COUNT(DISTINCT user_id) as count FROM payment_references WHERE status = 'confirmed'"
  ).get()?.count || 0;

  const renewals = db.prepare(`
    SELECT COUNT(*) as count FROM (
      SELECT user_id
      FROM payment_references
      WHERE status = 'confirmed'
      GROUP BY user_id
      HAVING COUNT(*) >= 2
    )
  `).get()?.count || 0;

  const churnedUsers = db.prepare(`
    SELECT COUNT(*) as count FROM users
    WHERE subscription_expires_at IS NOT NULL
      AND datetime(replace(replace(subscription_expires_at, 'T', ' '), 'Z', '')) < datetime('now')
  `).get()?.count || 0;

  const activeSubscribers = db.prepare(`
    SELECT COUNT(*) as count FROM users
    WHERE subscription_expires_at IS NOT NULL
      AND datetime(replace(replace(subscription_expires_at, 'T', ' '), 'Z', '')) > datetime('now')
  `).get()?.count || 0;

  res.json({
    total_ever_subscribed: totalSubscribed,
    renewals,
    renewal_rate: totalSubscribed > 0 ? Math.round((renewals / totalSubscribed) * 100) : 0,
    active_subscribers: activeSubscribers,
    churned: churnedUsers,
  });
});

// Most watched content
router.get('/top-content', requireAdmin, (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 10, 50);

  const topEpisodes = db.prepare(`
    SELECT e.id, e.title, e.view_count, e.episode_number,
           p.title as production_title, p.slug as production_slug
    FROM episodes e
    JOIN productions p ON p.id = e.production_id
    WHERE e.is_active = 1
    ORDER BY e.view_count DESC
    LIMIT ?
  `).all(limit);

  const topProductions = db.prepare(`
    SELECT p.id, p.title, p.slug,
           COALESCE(SUM(e.view_count), 0) as total_views,
           COUNT(e.id) as episode_count
    FROM productions p
    LEFT JOIN episodes e ON e.production_id = p.id AND e.is_active = 1
    WHERE p.is_active = 1
    GROUP BY p.id
    ORDER BY total_views DESC
    LIMIT ?
  `).all(limit);

  res.json({ episodes: topEpisodes, productions: topProductions });
});

// Conversion funnel
router.get('/conversion', requireAdmin, (req, res) => {
  const totalUsers = db.prepare('SELECT COUNT(*) as count FROM users').get()?.count || 0;

  const everSubscribed = db.prepare(
    "SELECT COUNT(DISTINCT user_id) as count FROM payment_references WHERE status = 'confirmed'"
  ).get()?.count || 0;

  const everPurchased = db.prepare(
    "SELECT COUNT(DISTINCT user_id) as count FROM content_purchase_requests WHERE status = 'confirmed'"
  ).get()?.count || 0;

  const activeSubscribers = db.prepare(`
    SELECT COUNT(*) as count FROM users
    WHERE subscription_expires_at IS NOT NULL
      AND datetime(replace(replace(subscription_expires_at, 'T', ' '), 'Z', '')) > datetime('now')
  `).get()?.count || 0;

  const freeOnly = totalUsers - everSubscribed - everPurchased;

  res.json({
    total_users: totalUsers,
    free_only: Math.max(0, freeOnly),
    ever_subscribed: everSubscribed,
    ever_purchased: everPurchased,
    active_subscribers: activeSubscribers,
    subscription_rate: totalUsers > 0 ? Math.round((everSubscribed / totalUsers) * 100) : 0,
    purchase_rate: totalUsers > 0 ? Math.round((everPurchased / totalUsers) * 100) : 0,
  });
});

export default router;
