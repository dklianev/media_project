import { Router } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import db from '../db.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { optimizeUploadedImages, requireUploadLock, upload } from '../middleware/upload.js';
import { buildPageResult, parsePagination, parseSort, toInt } from '../utils/pagination.js';
import { logAdminAction } from '../utils/audit.js';
import {
  normalizeManagedMediaUrl,
  parseManagedMediaUrlList,
  registerUploadedMedia,
} from '../utils/mediaLibrary.js';
import {
  getCurrentSofiaDbTimestamp,
  getShiftedSofiaDbTimestamp,
  normalizePublishedAtToSofia,
} from '../utils/sofiaTime.js';
import {
  normalizeEpisodeGroup, normalizeProductionGroup, resolveProductionGroup,
  hasGroupAccess, resolveEffectiveGroup, isUserAdmin,
} from '../utils/access.js';

const router = Router();
const EP_SORT_MAP = {
  episode_number: 'e.episode_number',
  created_at: 'e.created_at',
  view_count: 'e.view_count',
  title: 'e.title',
};
const YOUTUBE_ID_REGEX = /^[A-Za-z0-9_-]{11}$/;
const EMBED_TOKEN_SECRET =
  process.env.EMBED_TOKEN_SECRET ||
  process.env.JWT_SECRET ||
  'dev-embed-secret';
const EMBED_TOKEN_TTL = process.env.EMBED_TOKEN_TTL || '5m';
const EMBED_TOKEN_ISSUER = 'media-project';
const EMBED_TOKEN_AUDIENCE = 'episode-embed';

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isValidYouTubeId(value) {
  const normalized = String(value || '').trim();
  return normalized === '' || YOUTUBE_ID_REGEX.test(normalized);
}

function shouldNotifyEpisodeNow(episode) {
  return Number(episode?.is_active) === 1
    && (!episode.published_at || String(episode.published_at) <= getCurrentSofiaDbTimestamp());
}

function getEpisodeWithProduction(id, { includeUnpublished = false, currentTimestamp = getCurrentSofiaDbTimestamp() } = {}) {
  const visibilitySql = includeUnpublished
    ? ''
    : 'AND (e.published_at IS NULL OR e.published_at <= ?)';

  const statement = db.prepare(`
    SELECT e.*, p.title as production_title, p.slug as production_slug,
           p.required_tier, p.access_group as production_access_group,
           p.thumbnail_url as production_thumbnail
    FROM episodes e
    JOIN productions p ON e.production_id = p.id
    WHERE e.id = ? AND e.is_active = 1 AND p.is_active = 1
      ${visibilitySql}
  `);

  return includeUnpublished ? statement.get(id) : statement.get(id, currentTimestamp);
}

function getSiblingEpisode(productionId, episodeNumber, direction, user, { includeUnpublished = false, currentTimestamp = getCurrentSofiaDbTimestamp() } = {}) {
  if (!productionId || !Number.isFinite(Number(episodeNumber))) return null;

  const operator = direction === 'next' ? '>' : '<';
  const order = direction === 'next' ? 'ASC' : 'DESC';
  const visibilitySql = includeUnpublished
    ? ''
    : 'AND (e.published_at IS NULL OR e.published_at <= ?)';

  const statement = db.prepare(`
    SELECT e.id, e.title, e.episode_number, e.access_group,
           p.required_tier, p.access_group as production_access_group
    FROM episodes e
    JOIN productions p ON p.id = e.production_id
    WHERE e.production_id = ?
      AND e.is_active = 1
      AND p.is_active = 1
      AND e.episode_number ${operator} ?
      ${visibilitySql}
    ORDER BY e.episode_number ${order}, e.id ${order}
  `);

  const siblings = includeUnpublished
    ? statement.all(productionId, episodeNumber)
    : statement.all(productionId, episodeNumber, currentTimestamp);

  return siblings.find((candidate) => resolveEpisodeAccess(candidate, user).hasAccess) || null;
}

function hashUserAgent(userAgent) {
  const ua = String(userAgent || '').trim();
  if (!ua) return '';
  return crypto.createHash('sha256').update(ua).digest('hex');
}

function getPlaybackUser(userId) {
  const user = db.prepare(`
    SELECT u.id, u.role, u.subscription_expires_at, COALESCE(sp.tier_level, 0) as tier_level
    FROM users u
    LEFT JOIN subscription_plans sp ON u.subscription_plan_id = sp.id
    WHERE u.id = ?
  `).get(userId);

  if (!user || user.role === 'banned') return null;

  let tierLevel = Number(user.tier_level || 0);
  if (user.subscription_expires_at) {
    const expiresAt = new Date(user.subscription_expires_at);
    if (!Number.isNaN(expiresAt.getTime()) && expiresAt <= new Date()) {
      tierLevel = 0;
    }
  }

  return {
    ...user,
    tier_level: tierLevel,
  };
}

function resolveEpisodeAccess(episode, user) {
  const productionGroup = resolveProductionGroup(episode.production_access_group, episode.required_tier);
  const episodeGroup = normalizeEpisodeGroup(episode.access_group);
  const effectiveGroup = resolveEffectiveGroup(episodeGroup, productionGroup);
  const hasAccess = hasGroupAccess(
    effectiveGroup,
    user?.tier_level || 0,
    isUserAdmin(user),
    episode.required_tier || 0
  );

  return {
    productionGroup,
    episodeGroup,
    effectiveGroup,
    hasAccess,
  };
}

function createEmbedToken(episodeId, userId, userAgent) {
  const jwtId = crypto.randomUUID
    ? crypto.randomUUID()
    : crypto.randomBytes(16).toString('hex');

  return jwt.sign(
    {
      type: 'episode_embed',
      episode_id: Number(episodeId),
      user_id: Number(userId),
      ua: hashUserAgent(userAgent),
    },
    EMBED_TOKEN_SECRET,
    {
      expiresIn: EMBED_TOKEN_TTL,
      issuer: EMBED_TOKEN_ISSUER,
      audience: EMBED_TOKEN_AUDIENCE,
      subject: String(userId),
      jwtid: jwtId,
      algorithm: 'HS256',
    }
  );
}

function verifyEmbedToken(token, episodeId, userAgent) {
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, EMBED_TOKEN_SECRET, {
      algorithms: ['HS256'],
      issuer: EMBED_TOKEN_ISSUER,
      audience: EMBED_TOKEN_AUDIENCE,
    });

    if (decoded?.type !== 'episode_embed') return null;
    if (Number(decoded.episode_id) !== Number(episodeId)) return null;
    if (!Number.isFinite(Number(decoded.user_id)) || Number(decoded.user_id) <= 0) return null;

    const expectedUaHash = hashUserAgent(userAgent);
    if (typeof decoded.ua !== 'string' || decoded.ua !== expectedUaHash) return null;

    return decoded;
  } catch {
    return null;
  }
}

router.get('/latest', requireAuth, (req, res) => {
  const requestedLimit = toInt(req.query.limit, 12);
  const limit = Math.max(1, Math.min(30, requestedLimit));
  const fetchSize = Math.max(40, Math.min(220, limit * 6));
  const currentTimestamp = getCurrentSofiaDbTimestamp();

  const userTier = req.user.tier_level || 0;
  const isAdmin = req.user.role === 'admin' || req.user.role === 'superadmin';

  const rawEpisodes = db.prepare(`
    SELECT e.id, e.title, e.thumbnail_url, e.episode_number, e.created_at,
           e.access_group,
           p.title as production_title, p.slug as production_slug,
           p.required_tier, p.access_group as production_access_group
    FROM episodes e
    JOIN productions p ON e.production_id = p.id
    WHERE e.is_active = 1 AND p.is_active = 1
      AND (e.published_at IS NULL OR e.published_at <= ?)
    ORDER BY e.created_at DESC, e.id DESC
    LIMIT ?
  `).all(currentTimestamp, fetchSize);

  const episodes = rawEpisodes
    .map((episode) => {
      const productionGroup = resolveProductionGroup(episode.production_access_group, episode.required_tier);
      const episodeGroup = normalizeEpisodeGroup(episode.access_group);
      const effectiveGroup = resolveEffectiveGroup(episodeGroup, productionGroup);
      const hasAccess = hasGroupAccess(
        effectiveGroup,
        userTier,
        isAdmin,
        episode.required_tier || 0
      );

      return {
        ...episode,
        access_group: episodeGroup,
        effective_access_group: effectiveGroup,
        has_access: hasAccess,
      };
    })
    .filter((episode) => episode.has_access)
    .slice(0, limit);

  res.set('Cache-Control', 'private, max-age=20');
  res.json(episodes);
});

router.get('/calendar', requireAuth, (req, res) => {
  const admin = isUserAdmin(req.user);
  const fromTimestamp = getShiftedSofiaDbTimestamp(-14);
  const toTimestamp = getShiftedSofiaDbTimestamp(60);

  const rawEpisodes = db.prepare(`
    SELECT e.id, e.title, e.thumbnail_url, e.episode_number, e.published_at, e.created_at, e.is_active,
           e.access_group,
           p.title as production_title, p.slug as production_slug,
           p.required_tier, p.access_group as production_access_group
    FROM episodes e
    JOIN productions p ON e.production_id = p.id
    WHERE e.published_at IS NOT NULL
      ${admin ? '' : "AND e.is_active = 1 AND p.is_active = 1"}
      AND e.published_at >= ?
      AND e.published_at <= ?
    ORDER BY e.published_at ASC
  `).all(fromTimestamp, toTimestamp);

  const episodes = rawEpisodes.map((episode) => {
    const productionGroup = resolveProductionGroup(episode.production_access_group, episode.required_tier);
    const episodeGroup = normalizeEpisodeGroup(episode.access_group);
    const effectiveGroup = resolveEffectiveGroup(episodeGroup, productionGroup);
    const hasAccess = hasGroupAccess(
      effectiveGroup,
      req.user.tier_level || 0,
      admin,
      episode.required_tier || 0
    );

    return {
      ...episode,
      access_group: episodeGroup,
      effective_access_group: effectiveGroup,
      has_access: hasAccess,
    };
  });

  res.set('Cache-Control', 'private, max-age=60');
  res.json(episodes);
});

router.get('/:id/embed', (req, res) => {
  const token = req.query.t ? String(req.query.t) : '';
  const decoded = verifyEmbedToken(token, req.params.id, req.get('user-agent'));
  if (!decoded) {
    return res.status(403).send('Невалиден достъп до видеото');
  }

  const playbackUser = getPlaybackUser(decoded.user_id);
  if (!playbackUser) {
    return res.status(403).send('Нямате достъп до този епизод');
  }

  const admin = isUserAdmin(playbackUser);
  const episode = getEpisodeWithProduction(req.params.id, { includeUnpublished: admin });
  if (!episode) return res.status(404).send('Епизодът не е намерен');

  const access = resolveEpisodeAccess(episode, playbackUser);

  if (!access.hasAccess) {
    return res.status(403).send('Нямате достъп до този епизод');
  }
  if (!episode.youtube_video_id) {
    return res.status(404).send('Видео източникът липсва');
  }

  const videoId = encodeURIComponent(String(episode.youtube_video_id));
  const siteNameRaw = db.prepare("SELECT value FROM site_settings WHERE key = 'site_name'").get()?.value
    || 'Платформа';
  const siteName = escapeHtml(siteNameRaw);

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.send(`<!doctype html>
<html lang="bg">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; background: #000; }
      iframe { border: 0; width: 100%; height: 100%; }
      .wm { position: fixed; left: 12px; bottom: 10px; color: rgba(255,255,255,.55); font: 11px/1.2 system-ui; letter-spacing: .18em; text-transform: uppercase; user-select: none; pointer-events: none; }
    </style>
  </head>
  <body oncontextmenu="return false">
    <iframe
      src="https://www.youtube-nocookie.com/embed/${videoId}?modestbranding=1&rel=0&controls=0&disablekb=1&playsinline=1"
      referrerpolicy="strict-origin-when-cross-origin"
      allow="autoplay; encrypted-media; picture-in-picture"
      allowfullscreen>
    </iframe>
    <div class="wm">${siteName}</div>
  </body>
</html>`);
});

router.get('/:id', requireAuth, (req, res) => {
  const admin = isUserAdmin(req.user);
  const currentTimestamp = getCurrentSofiaDbTimestamp();
  const episode = getEpisodeWithProduction(req.params.id, {
    includeUnpublished: admin,
    currentTimestamp,
  });
  if (!episode) {
    return res.status(404).json({ error: 'Епизодът не е намерен' });
  }

  const access = resolveEpisodeAccess(episode, req.user);

  let sideImages = [];
  try {
    if (episode.side_images) sideImages = JSON.parse(episode.side_images);
  } catch {
    sideImages = [];
  }

  let nextEpisode = null;
  let previousEpisode = null;

  if (episode.production_id) {
    nextEpisode = getSiblingEpisode(
      episode.production_id,
      episode.episode_number,
      'next',
      req.user,
      { includeUnpublished: admin, currentTimestamp }
    );
    previousEpisode = getSiblingEpisode(
      episode.production_id,
      episode.episode_number,
      'previous',
      req.user,
      { includeUnpublished: admin, currentTimestamp }
    );
  }

  const responsePayload = {
    ...episode,
    youtube_video_id: access.hasAccess ? (episode.youtube_video_id || undefined) : undefined,
    video_embed_url: null,
    access_group: access.episodeGroup,
    effective_access_group: access.effectiveGroup,
    side_images: sideImages,
    duration_seconds: episode.duration_seconds || null,
    view_count: undefined,
    reactions: [],
    user_reaction: null,
    latest_episodes: [],
    required_tier: episode.required_tier || 0,
    has_access: access.hasAccess,
    next_episode_id: nextEpisode?.id || null,
    previous_episode_id: previousEpisode?.id || null,
    next_episode: nextEpisode ? {
      id: nextEpisode.id,
      title: nextEpisode.title,
      episode_number: nextEpisode.episode_number,
    } : null,
    previous_episode: previousEpisode ? {
      id: previousEpisode.id,
      title: previousEpisode.title,
      episode_number: previousEpisode.episode_number,
    } : null,
  };

  if (!access.hasAccess) {
    res.set('Cache-Control', 'private, max-age=15');
    return res.json(responsePayload);
  }

  db.prepare('UPDATE episodes SET view_count = view_count + 1 WHERE id = ?').run(episode.id);

  const reactions = db.prepare(`
    SELECT reaction_type, COUNT(*) as count
    FROM reactions
    WHERE episode_id = ?
    GROUP BY reaction_type
  `).all(episode.id);

  const userReaction = db.prepare(
    'SELECT reaction_type FROM reactions WHERE episode_id = ? AND user_id = ?'
  ).get(episode.id, req.user.id);

  const latestEpisodes = db.prepare(`
    SELECT id, title, thumbnail_url, episode_number
    FROM episodes
    WHERE production_id = ? AND id != ? AND is_active = 1
      AND (published_at IS NULL OR published_at <= ?)
    ORDER BY episode_number DESC
    LIMIT 6
  `).all(episode.production_id, episode.id, currentTimestamp);

  responsePayload.video_embed_url =
    `/api/episodes/${episode.id}/embed?t=${encodeURIComponent(createEmbedToken(episode.id, req.user.id, req.get('user-agent')))}`;
  responsePayload.reactions = reactions;
  responsePayload.user_reaction = userReaction?.reaction_type || null;
  responsePayload.latest_episodes = latestEpisodes;
  responsePayload.view_count = admin ? episode.view_count + 1 : undefined;

  res.json(responsePayload);
});

router.get('/admin/all', requireAdmin, (req, res) => {
  const { page, pageSize, offset } = parsePagination(req.query, { defaultPageSize: 20, maxPageSize: 100 });
  const { sortBy, sortColumn, sortDir } = parseSort(req.query, EP_SORT_MAP, 'episode_number', 'asc');

  const q = String(req.query.q || '').trim();
  const productionId = toInt(req.query.production_id, null);
  const accessGroup = normalizeEpisodeGroup(req.query.access_group, '');
  const activeRaw = String(req.query.is_active || '').trim().toLowerCase();

  const where = [];
  const params = [];

  if (Number.isFinite(productionId) && productionId !== null) {
    where.push('e.production_id = ?');
    params.push(productionId);
  }

  if (accessGroup) {
    where.push('e.access_group = ?');
    params.push(accessGroup);
  }

  if (activeRaw === '1' || activeRaw === '0') {
    where.push('e.is_active = ?');
    params.push(activeRaw === '1' ? 1 : 0);
  }

  if (q) {
    where.push('(e.title LIKE ? OR e.description LIKE ? OR p.title LIKE ?)');
    const pattern = `%${q}%`;
    params.push(pattern, pattern, pattern);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const baseFrom = `
    FROM episodes e
    JOIN productions p ON e.production_id = p.id
  `;

  const total = db.prepare(`
    SELECT COUNT(*) as count
    ${baseFrom}
    ${whereSql}
  `).get(...params)?.count || 0;

  const episodes = db.prepare(`
    SELECT e.*, p.title as production_title, p.access_group as production_access_group
    ${baseFrom}
    ${whereSql}
    ORDER BY ${sortColumn} ${sortDir}, e.id DESC
    LIMIT ? OFFSET ?
  `).all(...params, pageSize, offset).map((episode) => ({
    ...episode,
    access_group: normalizeEpisodeGroup(episode.access_group),
    production_access_group: resolveProductionGroup(episode.production_access_group, episode.required_tier),
  }));

  const totalViews = db.prepare(`
    SELECT COALESCE(SUM(e.view_count), 0) as total_views
    ${baseFrom}
    ${whereSql}
  `).get(...params)?.total_views || 0;

  res.json(
    buildPageResult(episodes, page, pageSize, total, {
      sort_by: sortBy,
      sort_dir: sortDir.toLowerCase(),
      summary: {
        total_views: totalViews,
      },
    })
  );
});

router.post(
  '/admin',
  requireAdmin,
  requireUploadLock,
  upload.fields([
    { name: 'thumbnail', maxCount: 1 },
    { name: 'ad_banner', maxCount: 1 },
    { name: 'side_images', maxCount: 5 },
  ]),
  optimizeUploadedImages,
  async (req, res, next) => {
    try {
    const {
      production_id,
      title,
      description,
      youtube_video_id,
      side_text,
      ad_banner_link,
      episode_number,
      access_group,
      is_active,
      published_at,
      thumbnail_url,
      ad_banner_url,
      side_images_urls,
    } = req.body;

    const prod = db.prepare('SELECT id, title FROM productions WHERE id = ?').get(production_id);
    if (!prod) return res.status(404).json({ error: 'Продукцията не е намерена' });
    if (!title || String(title).trim().length < 2) {
      return res.status(400).json({ error: 'Заглавието е задължително' });
    }
    if (!isValidYouTubeId(youtube_video_id)) {
      return res.status(400).json({ error: 'Невалиден YouTube видео идентификатор' });
    }

    const selectedThumbnailUrl = thumbnail_url !== undefined && String(thumbnail_url).trim()
      ? normalizeManagedMediaUrl(thumbnail_url)
      : null;
    const selectedBannerUrl = ad_banner_url !== undefined && String(ad_banner_url).trim()
      ? normalizeManagedMediaUrl(ad_banner_url)
      : null;
    const selectedSideImages = parseManagedMediaUrlList(side_images_urls, { maxItems: 5 });

    if (thumbnail_url !== undefined && String(thumbnail_url).trim() && !selectedThumbnailUrl) {
      return res.status(400).json({ error: 'Невалиден URL за кадър' });
    }
    if (ad_banner_url !== undefined && String(ad_banner_url).trim() && !selectedBannerUrl) {
      return res.status(400).json({ error: 'Невалиден URL за голямо изображение' });
    }
    if (selectedSideImages.error) {
      return res.status(400).json({ error: selectedSideImages.error });
    }

    const thumbnailUrl = req.files?.thumbnail?.[0]
      ? `/uploads/${req.files.thumbnail[0].filename}`
      : selectedThumbnailUrl;
    const adBannerUrl = req.files?.ad_banner?.[0]
      ? `/uploads/${req.files.ad_banner[0].filename}`
      : selectedBannerUrl;
    const sideImages = req.files?.side_images
      ? JSON.stringify(req.files.side_images.map((file) => `/uploads/${file.filename}`))
      : JSON.stringify(selectedSideImages.urls);

    const group = normalizeEpisodeGroup(access_group);
    const hasPublishedAt = published_at !== undefined && String(published_at).trim() !== '';
    const publishedAtValue = hasPublishedAt ? normalizePublishedAtToSofia(published_at) : null;
    if (hasPublishedAt && !publishedAtValue) {
      return res.status(400).json({ error: 'Невалидна дата за публикуване' });
    }

    const result = db.prepare(`
      INSERT INTO episodes (
        production_id, title, description, youtube_video_id, thumbnail_url,
        side_images, side_text, ad_banner_url, ad_banner_link,
        access_group, episode_number, is_active, published_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      production_id,
      String(title).trim(),
      description || '',
      youtube_video_id || '',
      thumbnailUrl,
      sideImages,
      side_text || '',
      adBannerUrl,
      ad_banner_link || '',
      group,
      toInt(episode_number, 1),
      is_active === 'false' ? 0 : 1,
      publishedAtValue
    );

    const episode = db.prepare('SELECT * FROM episodes WHERE id = ?').get(result.lastInsertRowid);
    await registerUploadedMedia(req, req.files, { source: 'episode.create' });

    // Notify only when the episode is already visible, not when it is scheduled for later.
    if (shouldNotifyEpisodeNow(episode)) {
      try {
        db.prepare(`
          INSERT INTO notifications (user_id, title, message, link)
          SELECT id, ?, ?, ? FROM users WHERE role != 'banned'
        `).run(
          `Нов епизод: ${prod.title}`,
          `Епизод ${episode.episode_number} на "${prod.title}" е добавен в платформата.`,
          `/episodes/${episode.id}`
        );
      } catch (err) {
        console.error('Неуспешно създаване на известия:', err);
      }
    }

    logAdminAction(req, {
      action: 'episode.create',
      entity_type: 'episode',
      entity_id: episode.id,
      metadata: {
        production_id: episode.production_id,
        title: episode.title,
        episode_number: episode.episode_number,
        access_group: episode.access_group,
        is_active: episode.is_active,
      },
    });
    res.status(201).json({ ...episode, access_group: normalizeEpisodeGroup(episode.access_group) });
    } catch (err) {
      next(err);
    }
  }
);

router.put(
  '/admin/:id',
  requireAdmin,
  requireUploadLock,
  upload.fields([
    { name: 'thumbnail', maxCount: 1 },
    { name: 'ad_banner', maxCount: 1 },
    { name: 'side_images', maxCount: 5 },
  ]),
  optimizeUploadedImages,
  async (req, res, next) => {
    try {
    const existing = db.prepare('SELECT * FROM episodes WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Епизодът не е намерен' });
    }

    const {
      production_id,
      title,
      description,
      youtube_video_id,
      side_text,
      ad_banner_link,
      episode_number,
      access_group,
      is_active,
      published_at,
      thumbnail_url,
      ad_banner_url,
      side_images_urls,
    } = req.body;

    const nextProductionId = production_id !== undefined
      ? toInt(production_id, null)
      : existing.production_id;
    if (!nextProductionId) {
      return res.status(400).json({ error: 'Избери валидна продукция за епизода' });
    }
    const productionExists = db.prepare('SELECT id FROM productions WHERE id = ?').get(nextProductionId);
    if (!productionExists) {
      return res.status(404).json({ error: 'Продукцията не е намерена' });
    }

    const hasThumbnailUrl = Object.prototype.hasOwnProperty.call(req.body || {}, 'thumbnail_url');
    const hasBannerUrl = Object.prototype.hasOwnProperty.call(req.body || {}, 'ad_banner_url');
    const selectedThumbnailUrl = hasThumbnailUrl && String(thumbnail_url).trim()
      ? normalizeManagedMediaUrl(thumbnail_url)
      : null;
    const selectedBannerUrl = hasBannerUrl && String(ad_banner_url).trim()
      ? normalizeManagedMediaUrl(ad_banner_url)
      : null;
    const selectedSideImages = parseManagedMediaUrlList(side_images_urls, { maxItems: 5 });

    if (hasThumbnailUrl && String(thumbnail_url).trim() && !selectedThumbnailUrl) {
      return res.status(400).json({ error: 'Невалиден URL за кадър' });
    }
    if (hasBannerUrl && String(ad_banner_url).trim() && !selectedBannerUrl) {
      return res.status(400).json({ error: 'Невалиден URL за голямо изображение' });
    }
    if (selectedSideImages.error) {
      return res.status(400).json({ error: selectedSideImages.error });
    }

    const thumbnailUrl = req.files?.thumbnail?.[0]
      ? `/uploads/${req.files.thumbnail[0].filename}`
      : hasThumbnailUrl
        ? selectedThumbnailUrl
        : existing.thumbnail_url;
    const adBannerUrl = req.files?.ad_banner?.[0]
      ? `/uploads/${req.files.ad_banner[0].filename}`
      : hasBannerUrl
        ? selectedBannerUrl
        : existing.ad_banner_url;
    const sideImages = req.files?.side_images
      ? JSON.stringify(req.files.side_images.map((file) => `/uploads/${file.filename}`))
      : selectedSideImages.provided
        ? JSON.stringify(selectedSideImages.urls)
        : existing.side_images;

    if (!isValidYouTubeId(youtube_video_id ?? existing.youtube_video_id)) {
      return res.status(400).json({ error: 'Невалиден YouTube видео идентификатор' });
    }

    let publishedAtValue = existing.published_at;
    if (published_at !== undefined) {
      const rawPublishedAt = String(published_at).trim();
      if (!rawPublishedAt) {
        publishedAtValue = null;
      } else {
        publishedAtValue = normalizePublishedAtToSofia(rawPublishedAt);
        if (!publishedAtValue) {
          return res.status(400).json({ error: 'Невалидна дата за публикуване' });
        }
      }
    }

    db.prepare(`
      UPDATE episodes SET
        production_id = ?,
        title = ?,
        description = ?,
        youtube_video_id = ?,
        thumbnail_url = ?,
        side_images = ?,
        side_text = ?,
        ad_banner_url = ?,
        ad_banner_link = ?,
        access_group = ?,
        episode_number = ?,
        is_active = ?,
        published_at = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(
      nextProductionId,
      title ? String(title).trim() : existing.title,
      description ?? existing.description,
      youtube_video_id ?? existing.youtube_video_id,
      thumbnailUrl,
      sideImages,
      side_text ?? existing.side_text,
      adBannerUrl,
      ad_banner_link ?? existing.ad_banner_link,
      normalizeEpisodeGroup(access_group, normalizeEpisodeGroup(existing.access_group)),
      toInt(episode_number, existing.episode_number),
      is_active === undefined ? existing.is_active : (is_active === 'false' ? 0 : 1),
      publishedAtValue,
      req.params.id
    );

    const updated = db.prepare('SELECT * FROM episodes WHERE id = ?').get(req.params.id);
    await registerUploadedMedia(req, req.files, { source: 'episode.update' });
    logAdminAction(req, {
      action: 'episode.update',
      entity_type: 'episode',
      entity_id: req.params.id,
      metadata: {
        previous: {
          production_id: existing.production_id,
          title: existing.title,
          episode_number: existing.episode_number,
          access_group: normalizeEpisodeGroup(existing.access_group),
          is_active: existing.is_active,
        },
        next: {
          production_id: updated.production_id,
          title: updated.title,
          episode_number: updated.episode_number,
          access_group: normalizeEpisodeGroup(updated.access_group),
          is_active: updated.is_active,
        },
      },
    });
    res.json({ ...updated, access_group: normalizeEpisodeGroup(updated.access_group) });
    } catch (err) {
      next(err);
    }
  }
);

router.put('/admin/:id/status', requireAdmin, (req, res) => {
  const { is_active } = req.body;
  if (is_active === undefined) {
    return res.status(400).json({ error: 'Липсва is_active параметър' });
  }

  const episode = db.prepare(`
    SELECT id, title, production_id, episode_number, is_active
    FROM episodes
    WHERE id = ?
  `).get(req.params.id);

  if (!episode) {
    return res.status(404).json({ error: 'Епизодът не е намерен' });
  }

  const newValue = is_active ? 1 : 0;
  if (episode.is_active === newValue) {
    return res.json({ success: true, updated: false });
  }

  db.prepare(`
    UPDATE episodes
    SET is_active = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(newValue, req.params.id);

  logAdminAction(req, {
    action: 'episode.status_update',
    entity_type: 'episode',
    entity_id: req.params.id,
    metadata: {
      title: episode.title,
      production_id: episode.production_id,
      episode_number: episode.episode_number,
      from_is_active: episode.is_active,
      to_is_active: newValue,
    },
  });

  res.json({ success: true, updated: true, is_active: newValue });
});

router.put('/admin/:id/reorder', requireAdmin, (req, res) => {
  const direction = String(req.body?.direction || '').toLowerCase();
  if (!['up', 'down'].includes(direction)) {
    return res.status(400).json({ error: 'Невалидна посока' });
  }

  const current = db.prepare(`
    SELECT id, production_id, episode_number
    FROM episodes
    WHERE id = ?
  `).get(req.params.id);

  if (!current) {
    return res.status(404).json({ error: 'Епизодът не е намерен' });
  }

  const target = direction === 'up'
    ? db.prepare(`
      SELECT id, episode_number
      FROM episodes
      WHERE production_id = ?
        AND (episode_number < ? OR (episode_number = ? AND id < ?))
      ORDER BY episode_number DESC, id DESC
      LIMIT 1
    `).get(current.production_id, current.episode_number, current.episode_number, current.id)
    : db.prepare(`
      SELECT id, episode_number
      FROM episodes
      WHERE production_id = ?
        AND (episode_number > ? OR (episode_number = ? AND id > ?))
      ORDER BY episode_number ASC, id ASC
      LIMIT 1
    `).get(current.production_id, current.episode_number, current.episode_number, current.id);

  if (!target) {
    return res.json({ success: true, moved: false });
  }

  const swap = db.transaction(() => {
    db.prepare('UPDATE episodes SET episode_number = ?, updated_at = datetime(\'now\') WHERE id = ?')
      .run(target.episode_number, current.id);
    db.prepare('UPDATE episodes SET episode_number = ?, updated_at = datetime(\'now\') WHERE id = ?')
      .run(current.episode_number, target.id);
  });
  swap();

  logAdminAction(req, {
    action: 'episode.reorder',
    entity_type: 'episode',
    entity_id: req.params.id,
    metadata: {
      production_id: current.production_id,
      direction,
      from_episode_number: current.episode_number,
      to_episode_number: target.episode_number,
      swapped_with_id: target.id,
    },
  });
  res.json({ success: true, moved: true });
});

router.delete('/admin/:id', requireAdmin, (req, res) => {
  const episode = db.prepare(`
    SELECT id, title, production_id, episode_number
    FROM episodes
    WHERE id = ?
  `).get(req.params.id);
  if (!episode) {
    return res.status(404).json({ error: 'Епизодът не е намерен' });
  }

    const remove = db.transaction((episodeId) => {
      db.prepare('DELETE FROM comments WHERE episode_id = ?').run(episodeId);
      db.prepare('DELETE FROM reactions WHERE episode_id = ?').run(episodeId);
      db.prepare('DELETE FROM watch_history WHERE episode_id = ?').run(episodeId);
      db.prepare('DELETE FROM episodes WHERE id = ?').run(episodeId);
  });
  remove(req.params.id);

  logAdminAction(req, {
    action: 'episode.delete',
    entity_type: 'episode',
    entity_id: req.params.id,
    metadata: {
      title: episode.title,
      production_id: episode.production_id,
      episode_number: episode.episode_number,
    },
  });
  res.json({ success: true });
});

export default router;
