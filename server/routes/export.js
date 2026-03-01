import { Router } from 'express';
import db from '../db.js';
import { requireAdmin } from '../middleware/auth.js';
import { logAdminAction } from '../utils/audit.js';

const router = Router();

function escapeCsv(value) {
  if (value === null || value === undefined) return '';
  const raw = String(value);
  const str = /^[=+\-@]/.test(raw.trimStart()) ? `'${raw}` : raw;
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function toCsvRow(values) {
  return values.map(escapeCsv).join(',');
}

// GET /api/admin/export/users
router.get('/users', requireAdmin, (req, res) => {
  const users = db.prepare(`
    SELECT u.id, u.discord_id, u.discord_username, u.character_name, u.role,
           sp.name as plan_name, u.subscription_expires_at, u.created_at, u.updated_at
    FROM users u
    LEFT JOIN subscription_plans sp ON sp.id = u.subscription_plan_id
    ORDER BY u.created_at DESC
  `).all();

  const headers = ['ID', 'Discord ID', 'Discord Username', 'Character Name', 'Role', 'Plan', 'Expires At', 'Created At', 'Updated At'];
  const rows = users.map((u) => toCsvRow([
    u.id, u.discord_id, u.discord_username, u.character_name, u.role,
    u.plan_name || 'Безплатен', u.subscription_expires_at, u.created_at, u.updated_at,
  ]));

  const csv = [toCsvRow(headers), ...rows].join('\r\n');

  logAdminAction(req, {
    action: 'export.users',
    entity_type: 'export',
    metadata: { total: users.length },
  });

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="users-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send('\uFEFF' + csv); // BOM for Excel UTF-8
});

// GET /api/admin/export/payments
router.get('/payments', requireAdmin, (req, res) => {
  const payments = db.prepare(`
    SELECT pr.id, pr.reference_code, pr.status,
           u.character_name, u.discord_username,
           sp.name as plan_name,
           pr.original_price, pr.discount_percent, pr.final_price,
           pc.code as promo_code,
           pr.created_at, pr.confirmed_at, pr.rejected_at, pr.rejection_reason, pr.cancelled_at
    FROM payment_references pr
    JOIN users u ON u.id = pr.user_id
    JOIN subscription_plans sp ON sp.id = pr.plan_id
    LEFT JOIN promo_codes pc ON pc.id = pr.promo_code_id
    ORDER BY pr.created_at DESC
  `).all();

  const headers = [
    'ID', 'Reference Code', 'Status', 'Character Name', 'Discord Username',
    'Plan', 'Original Price', 'Discount %', 'Final Price', 'Promo Code',
    'Created At', 'Confirmed At', 'Rejected At', 'Rejection Reason', 'Cancelled At',
  ];
  const rows = payments.map((p) => toCsvRow([
    p.id, p.reference_code, p.status, p.character_name, p.discord_username,
    p.plan_name, p.original_price, p.discount_percent, p.final_price, p.promo_code || '',
    p.created_at, p.confirmed_at, p.rejected_at, p.rejection_reason, p.cancelled_at,
  ]));

  const csv = [toCsvRow(headers), ...rows].join('\r\n');

  logAdminAction(req, {
    action: 'export.payments',
    entity_type: 'export',
    metadata: { total: payments.length },
  });

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="payments-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send('\uFEFF' + csv);
});

export default router;
