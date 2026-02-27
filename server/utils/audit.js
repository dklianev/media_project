import db from '../db.js';

function getClientIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').trim();
  if (forwarded) {
    return forwarded.split(',')[0].trim().slice(0, 120);
  }

  return String(req.ip || req.socket?.remoteAddress || '').slice(0, 120);
}

function normalizeMetadata(metadata) {
  if (metadata === undefined || metadata === null) return null;

  try {
    const raw = JSON.stringify(metadata);
    if (!raw) return null;
    return raw.length > 4000 ? raw.slice(0, 4000) : raw;
  } catch {
    return null;
  }
}

export function logAdminAction(req, payload) {
  try {
    const action = String(payload?.action || '').trim();
    const entityType = String(payload?.entity_type || '').trim();
    if (!action || !entityType) return;
    if (!req?.user?.id) return;

    const entityId = payload?.entity_id !== undefined && payload?.entity_id !== null
      ? String(payload.entity_id).slice(0, 100)
      : null;

    const targetUserId = payload?.target_user_id !== undefined && payload?.target_user_id !== null
      ? Number.parseInt(payload.target_user_id, 10)
      : null;

    db.prepare(`
      INSERT INTO admin_audit_logs (
        admin_user_id,
        action,
        entity_type,
        entity_id,
        target_user_id,
        metadata,
        ip_address,
        user_agent
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.user.id,
      action.slice(0, 80),
      entityType.slice(0, 60),
      entityId,
      Number.isFinite(targetUserId) ? targetUserId : null,
      normalizeMetadata(payload?.metadata),
      getClientIp(req),
      String(req.headers['user-agent'] || '').slice(0, 300)
    );
  } catch (err) {
    console.warn('Audit log insert failed:', err?.message || err);
  }
}

