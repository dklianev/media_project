import { Router } from 'express';
import db from '../db.js';
import { requireAdmin, requireAuth } from '../middleware/auth.js';
import { logAdminAction } from '../utils/audit.js';
import { buildPageResult, parsePagination, toInt } from '../utils/pagination.js';
import {
  normalizeEpisodeGroup,
  normalizeProductionGroup,
  hasGroupAccess,
  resolveEffectiveGroup,
  isUserAdmin,
} from '../utils/access.js';

const router = Router();
const COMMENT_STATUSES = new Set(['published', 'hidden', 'deleted']);

function normalizeCommentStatus(value, fallback = 'published') {
  const normalized = String(value || '').trim().toLowerCase();
  return COMMENT_STATUSES.has(normalized) ? normalized : fallback;
}

function getCommentById(commentId) {
  return db.prepare(`
    SELECT
      c.*,
      u.discord_username,
      u.discord_avatar,
      u.character_name,
      u.role,
      e.title as episode_title,
      e.production_id,
      p.title as production_title,
      p.slug as production_slug
    FROM comments c
    JOIN users u ON c.user_id = u.id
    JOIN episodes e ON c.episode_id = e.id
    JOIN productions p ON e.production_id = p.id
    WHERE c.id = ?
  `).get(commentId);
}

function validateEpisodeAccess(episodeId, user) {
  const admin = isUserAdmin(user);
  const episode = db.prepare(`
    SELECT
      e.id,
      e.access_group as episode_access_group,
      e.published_at,
      e.is_active,
      p.required_tier,
      p.access_group as production_access_group,
      p.is_active as production_is_active
    FROM episodes e
    JOIN productions p ON e.production_id = p.id
    WHERE e.id = ?
      ${admin ? '' : "AND e.is_active = 1 AND p.is_active = 1 AND (e.published_at IS NULL OR e.published_at <= datetime('now'))"}
  `).get(episodeId);

  if (!episode) {
    return { ok: false, status: 404, error: 'Епизодът не е намерен' };
  }

  const effectiveGroup = resolveEffectiveGroup(
    normalizeEpisodeGroup(episode.episode_access_group),
    normalizeProductionGroup(episode.production_access_group)
  );
  const hasAccess = hasGroupAccess(
    effectiveGroup,
    user?.tier_level || 0,
    admin,
    episode.required_tier || 0
  );

  if (!hasAccess) {
    return {
      ok: false,
      status: 403,
      error: 'Нямаш достъп до коментарите за този епизод.',
    };
  }

  return { ok: true };
}

// Get comments for an episode
router.get('/episode/:episodeId', requireAuth, (req, res) => {
  const { episodeId } = req.params;
  const access = validateEpisodeAccess(episodeId, req.user);
  if (!access.ok) {
    return res.status(access.status).json({ error: access.error });
  }

  const comments = db.prepare(`
    SELECT c.id, c.content, c.created_at, c.user_id,
           u.discord_username, u.discord_avatar, u.character_name, u.role
    FROM comments c
    JOIN users u ON c.user_id = u.id
    WHERE c.episode_id = ?
      AND c.status = 'published'
    ORDER BY c.created_at DESC
  `).all(episodeId);

  res.json(comments);
});

router.get('/admin', requireAdmin, (req, res) => {
  const { page, pageSize, offset } = parsePagination(req.query, { defaultPageSize: 20, maxPageSize: 100 });
  const q = String(req.query.q || '').trim();
  const status = normalizeCommentStatus(req.query.status, '');
  const episodeId = toInt(req.query.episode_id, null);

  const where = [];
  const params = [];

  if (status) {
    where.push('c.status = ?');
    params.push(status);
  }

  if (episodeId !== null) {
    where.push('c.episode_id = ?');
    params.push(episodeId);
  }

  if (q) {
    const pattern = `%${q}%`;
    where.push(`(
          c.content LIKE ?
          OR u.character_name LIKE ?
          OR u.discord_username LIKE ?
          OR e.title LIKE ?
          OR p.title LIKE ?
        )`);
    params.push(pattern, pattern, pattern, pattern, pattern);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const baseFrom = `
      FROM comments c
      JOIN users u ON c.user_id = u.id
      JOIN episodes e ON c.episode_id = e.id
      JOIN productions p ON e.production_id = p.id
    `;

  const total = db.prepare(`
      SELECT COUNT(*) as count
      ${baseFrom}
      ${whereSql}
    `).get(...params)?.count || 0;

  const items = db.prepare(`
      SELECT
        c.id,
        c.episode_id,
        c.user_id,
        c.content,
        c.status,
        c.moderation_reason,
        c.moderated_at,
        c.created_at,
        c.updated_at,
        c.deleted_at,
        u.discord_username,
        u.discord_avatar,
        u.character_name,
        e.title as episode_title,
        p.title as production_title,
        p.slug as production_slug
      ${baseFrom}
      ${whereSql}
      ORDER BY c.created_at DESC, c.id DESC
      LIMIT ? OFFSET ?
    `).all(...params, pageSize, offset);

  res.json(buildPageResult(items, page, pageSize, total));
});

// Create a new comment
router.post('/', requireAuth, (req, res) => {
  const { episode_id, content } = req.body;
  if (!episode_id || !content || content.trim().length === 0) {
    return res.status(400).json({ error: 'Епизодът и съдържанието са задължителни' });
  }
  if (content.trim().length > 2000) {
    return res.status(400).json({ error: 'Коментарът е твърде дълъг' });
  }

  const access = validateEpisodeAccess(episode_id, req.user);
  if (!access.ok) {
    return res.status(access.status).json({ error: access.error });
  }

  const result = db.prepare(`
    INSERT INTO comments (episode_id, user_id, content)
    VALUES (?, ?, ?)
  `).run(episode_id, req.user.id, content.trim());

  const newComment = db.prepare(`
    SELECT c.id, c.content, c.created_at, c.user_id,
           u.discord_username, u.discord_avatar, u.character_name, u.role
    FROM comments c
    JOIN users u ON c.user_id = u.id
    WHERE c.id = ?
  `).get(result.lastInsertRowid);

  res.status(201).json(newComment);
});

router.put('/admin/:id/status', requireAdmin, (req, res) => {
  const nextStatus = normalizeCommentStatus(req.body?.status, '');
  if (!nextStatus) {
    return res.status(400).json({ error: 'Невалиден статус на коментара' });
  }

  const comment = getCommentById(req.params.id);
  if (!comment) {
    return res.status(404).json({ error: 'Коментарът не е намерен' });
  }

  const moderationReason = String(req.body?.reason || '').trim() || null;
  const deletedAt = nextStatus === 'deleted' ? "datetime('now')" : 'NULL';
  const deletedBy = nextStatus === 'deleted' ? '?' : 'NULL';

  const query = `
      UPDATE comments
      SET status = ?,
          moderation_reason = ?,
          moderated_at = datetime('now'),
          moderated_by = ?,
          deleted_at = ${deletedAt},
          deleted_by = ${deletedBy},
          updated_at = datetime('now')
      WHERE id = ?
    `;
  const queryParams = nextStatus === 'deleted'
    ? [nextStatus, moderationReason, req.user.id, req.user.id, req.params.id]
    : [nextStatus, moderationReason, req.user.id, req.params.id];

  db.prepare(query).run(...queryParams);

  const updated = getCommentById(req.params.id);
  logAdminAction(req, {
    action: 'comment.status.update',
    entity_type: 'comment',
    entity_id: req.params.id,
    target_user_id: comment.user_id,
    metadata: {
      previous_status: comment.status,
      next_status: updated.status,
      episode_id: comment.episode_id,
      reason: moderationReason,
    },
  });

  res.json(updated);
});

// Delete a comment
router.delete('/:id', requireAuth, (req, res) => {
  const commentId = req.params.id;
  const comment = getCommentById(commentId);

  if (!comment) {
    return res.status(404).json({ error: 'Коментарът не е намерен' });
  }

  const isAdmin = req.user.role === 'admin' || req.user.role === 'superadmin';
  if (comment.user_id !== req.user.id && !isAdmin) {
    return res.status(403).json({ error: 'Нямате права да изтриете този коментар' });
  }

  db.prepare(`
      UPDATE comments
      SET status = 'deleted',
          deleted_at = datetime('now'),
          deleted_by = ?,
          moderated_at = CASE WHEN ? THEN datetime('now') ELSE moderated_at END,
          moderated_by = CASE WHEN ? THEN ? ELSE moderated_by END,
          updated_at = datetime('now')
      WHERE id = ?
    `).run(req.user.id, isAdmin ? 1 : 0, isAdmin ? 1 : 0, req.user.id, commentId);

  if (isAdmin) {
    logAdminAction(req, {
      action: 'comment.delete',
      entity_type: 'comment',
      entity_id: commentId,
      target_user_id: comment.user_id,
      metadata: {
        previous_status: comment.status,
        episode_id: comment.episode_id,
      },
    });
  }

  res.json({ success: true });
});

// Hard delete a comment (Admin only)
router.delete('/admin/:id/hard', requireAdmin, (req, res) => {
  const commentId = req.params.id;
  const comment = getCommentById(commentId);

  if (!comment) {
    return res.status(404).json({ error: 'Коментарът не е намерен' });
  }

  db.prepare(`DELETE FROM comments WHERE id = ?`).run(commentId);

  logAdminAction(req, {
    action: 'comment.hard_delete',
    entity_type: 'comment',
    entity_id: commentId,
    target_user_id: comment.user_id,
    metadata: {
      previous_status: comment.status,
      episode_id: comment.episode_id,
    },
  });

  res.json({ success: true });
});

export default router;
