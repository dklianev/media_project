import { Router } from 'express';
import db from '../db.js';
import { requireAdmin } from '../middleware/auth.js';
import { buildPageResult, parsePagination, parseSort, toInt } from '../utils/pagination.js';

const router = Router();
const AUDIT_SORT_MAP = {
  created_at: 'l.created_at',
  action: 'l.action',
  entity_type: 'l.entity_type',
  admin_name: 'admin.character_name',
};

function tryParseMetadata(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

router.get('/', requireAdmin, (req, res) => {
  const { page, pageSize, offset } = parsePagination(req.query, { defaultPageSize: 20, maxPageSize: 100 });
  const { sortBy, sortColumn, sortDir } = parseSort(req.query, AUDIT_SORT_MAP, 'created_at', 'desc');

  const q = String(req.query.q || '').trim();
  const action = String(req.query.action || '').trim().toLowerCase();
  const entityType = String(req.query.entity_type || '').trim().toLowerCase();
  const adminId = toInt(req.query.admin_id, null);
  const targetUserId = toInt(req.query.target_user_id, null);
  const fromDate = String(req.query.date_from || '').trim();
  const toDate = String(req.query.date_to || '').trim();

  const where = [];
  const params = [];

  if (q) {
    where.push(`
      (
        l.action LIKE ? OR
        l.entity_type LIKE ? OR
        l.entity_id LIKE ? OR
        admin.character_name LIKE ? OR
        target.character_name LIKE ? OR
        l.ip_address LIKE ?
      )
    `);
    const pattern = `%${q}%`;
    params.push(pattern, pattern, pattern, pattern, pattern, pattern);
  }

  if (action) {
    where.push('l.action = ?');
    params.push(action);
  }

  if (entityType) {
    where.push('l.entity_type = ?');
    params.push(entityType);
  }

  if (Number.isFinite(adminId) && adminId !== null) {
    where.push('l.admin_user_id = ?');
    params.push(adminId);
  }

  if (Number.isFinite(targetUserId) && targetUserId !== null) {
    where.push('l.target_user_id = ?');
    params.push(targetUserId);
  }

  if (fromDate) {
    where.push('date(l.created_at) >= date(?)');
    params.push(fromDate);
  }

  if (toDate) {
    where.push('date(l.created_at) <= date(?)');
    params.push(toDate);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const baseFrom = `
    FROM admin_audit_logs l
    JOIN users admin ON admin.id = l.admin_user_id
    LEFT JOIN users target ON target.id = l.target_user_id
  `;

  const total = db.prepare(`
    SELECT COUNT(*) as count
    ${baseFrom}
    ${whereSql}
  `).get(...params)?.count || 0;

  const rows = db.prepare(`
    SELECT l.*,
           admin.character_name as admin_name,
           admin.discord_username as admin_discord_username,
           target.character_name as target_name,
           target.discord_username as target_discord_username
    ${baseFrom}
    ${whereSql}
    ORDER BY ${sortColumn} ${sortDir}, l.id DESC
    LIMIT ? OFFSET ?
  `).all(...params, pageSize, offset);

  const items = rows.map((row) => ({
    ...row,
    metadata: tryParseMetadata(row.metadata),
  }));

  res.json(
    buildPageResult(items, page, pageSize, total, {
      sort_by: sortBy,
      sort_dir: sortDir.toLowerCase(),
    })
  );
});

export default router;

