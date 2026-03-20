import { Router } from 'express';
import crypto from 'crypto';
import db from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { getCurrentSofiaDbTimestamp } from '../utils/sofiaTime.js';

const router = Router();
const REFERRAL_REWARD_BONUS_DAYS = 7; // reward: 7 bonus days of subscription

// Get or generate referral code
router.get('/my-code', requireAuth, (req, res) => {
  let user = db.prepare('SELECT referral_code FROM users WHERE id = ?').get(req.user.id);

  if (!user.referral_code) {
    const code = 'REF-' + crypto.randomBytes(3).toString('hex').toUpperCase();
    db.prepare('UPDATE users SET referral_code = ? WHERE id = ?').run(code, req.user.id);
    user = { referral_code: code };
  }

  res.json({ code: user.referral_code });
});

// Get referral stats
router.get('/stats', requireAuth, (req, res) => {
  const totalReferred = db.prepare(
    'SELECT COUNT(*) as count FROM users WHERE referred_by = ?'
  ).get(req.user.id)?.count || 0;

  const rewards = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN applied = 1 THEN 1 ELSE 0 END) as applied,
      SUM(CASE WHEN applied = 0 THEN 1 ELSE 0 END) as pending,
      COALESCE(SUM(reward_value), 0) as total_value
    FROM referral_rewards
    WHERE referrer_id = ?
  `).get(req.user.id);

  res.json({
    total_referred: totalReferred,
    total_rewards: rewards?.total || 0,
    applied_rewards: rewards?.applied || 0,
    pending_rewards: rewards?.pending || 0,
    total_bonus_days: rewards?.total_value || 0,
  });
});

// Apply pending rewards (add bonus days to subscription)
router.post('/apply-rewards', requireAuth, (req, res) => {
  const pendingRewards = db.prepare(`
    SELECT id, reward_value
    FROM referral_rewards
    WHERE referrer_id = ? AND applied = 0
  `).all(req.user.id);

  if (pendingRewards.length === 0) {
    return res.status(400).json({ error: 'Няма налични награди за прилагане.' });
  }

  const totalDays = pendingRewards.reduce((sum, r) => sum + r.reward_value, 0);
  const now = getCurrentSofiaDbTimestamp();
  const currentUser = db.prepare(`
    SELECT subscription_plan_id
    FROM users
    WHERE id = ?
  `).get(req.user.id);

  const activeCurrentPlan = currentUser?.subscription_plan_id
    ? db.prepare(`
        SELECT id
        FROM subscription_plans
        WHERE id = ? AND is_active = 1
      `).get(currentUser.subscription_plan_id)
    : null;

  const fallbackPlan = activeCurrentPlan || db.prepare(`
    SELECT id
    FROM subscription_plans
    WHERE is_active = 1
    ORDER BY tier_level ASC, sort_order ASC, price ASC, id ASC
    LIMIT 1
  `).get();

  if (!fallbackPlan?.id) {
    return res.status(400).json({ error: 'Няма активен абонаментен план, към който да приложим бонус дните.' });
  }

  const apply = db.transaction(() => {
    // Extend subscription
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
        updated_at = ?
      WHERE id = ?
    `).run(fallbackPlan.id, totalDays, now, req.user.id);

    // Mark rewards as applied
    const markApplied = db.prepare(
      'UPDATE referral_rewards SET applied = 1, applied_at = ? WHERE id = ?'
    );
    for (const reward of pendingRewards) {
      markApplied.run(now, reward.id);
    }
  });

  apply();
  res.json({ success: true, bonus_days: totalDays });
});

export default router;
