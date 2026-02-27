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

export default router;
