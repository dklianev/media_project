import { Router } from 'express';
import db from '../db.js';
import { requireAdmin } from '../middleware/auth.js';
import { optimizeUploadedImages, requireUploadLock, upload } from '../middleware/upload.js';
import { buildPageResult, parsePagination, parseSort } from '../utils/pagination.js';
import { logAdminAction } from '../utils/audit.js';
import { registerUploadedMedia } from '../utils/mediaLibrary.js';

const router = Router();
const MEDIA_SORT_MAP = {
  created_at: 'created_at',
  original_name: 'original_name',
  size_bytes: 'size_bytes',
};

router.get('/', requireAdmin, (req, res) => {
  const { page, pageSize, offset } = parsePagination(req.query, {
    defaultPageSize: 24,
    maxPageSize: 120,
  });
  const { sortBy, sortColumn, sortDir } = parseSort(req.query, MEDIA_SORT_MAP, 'created_at', 'desc');
  const q = String(req.query.q || '').trim();

  const where = [];
  const params = [];

  if (q) {
    const pattern = `%${q}%`;
    where.push('(original_name LIKE ? OR source LIKE ? OR url LIKE ?)');
    params.push(pattern, pattern, pattern);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = db.prepare(`
    SELECT COUNT(*) as count
    FROM media_assets
    ${whereSql}
  `).get(...params)?.count || 0;

  const items = db.prepare(`
    SELECT *
    FROM media_assets
    ${whereSql}
    ORDER BY ${sortColumn} ${sortDir}, id DESC
    LIMIT ? OFFSET ?
  `).all(...params, pageSize, offset);

  res.json(buildPageResult(items, page, pageSize, total, {
    sort_by: sortBy,
    sort_dir: sortDir.toLowerCase(),
  }));
});

router.post(
  '/',
  requireAdmin,
  requireUploadLock,
  upload.array('files', 12),
  optimizeUploadedImages,
  async (req, res, next) => {
    try {
      if (!Array.isArray(req.files) || req.files.length === 0) {
        return res.status(400).json({ error: 'Не е качен файл' });
      }

      const items = await registerUploadedMedia(req, req.files, { source: 'media.library' });
      logAdminAction(req, {
        action: 'media.upload',
        entity_type: 'media_asset',
        entity_id: items[0]?.id || null,
        metadata: {
          count: items.length,
          urls: items.map((item) => item.url),
        },
      });
      return res.status(201).json({ items });
    } catch (err) {
      return next(err);
    }
  }
);

export default router;
