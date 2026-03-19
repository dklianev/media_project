import { Router } from 'express';
import crypto from 'crypto';
import { createReadStream, promises as fs } from 'fs';
import jwt from 'jsonwebtoken';
import { dirname, extname, resolve as pathResolve } from 'path';
import { fileURLToPath } from 'url';
import db from '../db.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import {
  episodeUpload,
  getUploadedFiles,
  optimizeUploadedImages,
  requireUploadLock,
  validateEpisodeUploads,
} from '../middleware/upload.js';
import { analyzeUploadedVideo, enqueueTranscode } from '../utils/transcoder.js';
import { buildPageResult, parsePagination, parseSort, toInt } from '../utils/pagination.js';
import { logAdminAction } from '../utils/audit.js';
import { createNotification, createBulkNotifications } from '../utils/notifications.js';
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
  normalizeEpisodeGroup,
  resolveProductionGroup,
  isUserAdmin,
} from '../utils/access.js';
import {
  enrichEpisodeForUser,
  evaluateEpisodeAccess,
  getUserPurchaseState,
  normalizePurchasePrice,
} from '../utils/contentPurchases.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const uploadsDir = pathResolve(__dirname, '..', '..', 'public', 'uploads');
const router = Router();
const LOCAL_VIDEO_URL_PREFIX = '/uploads/videos/';
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
const STREAM_TOKEN_TTL = process.env.STREAM_TOKEN_TTL || '8h';
const EMBED_TOKEN_ISSUER = 'media-project';
const EMBED_TOKEN_AUDIENCE = 'episode-embed';
const STREAM_TOKEN_AUDIENCE = 'episode-stream';

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

function isEnabledFlag(value, fallback = false) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const normalized = String(value).trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'on';
}

function normalizeLocalVideoUrl(value) {
  const normalized = normalizeManagedMediaUrl(value);
  if (!normalized || !normalized.startsWith(LOCAL_VIDEO_URL_PREFIX)) {
    return null;
  }
  return normalized;
}

function resolveLocalVideoFilePath(videoUrl) {
  const normalized = normalizeLocalVideoUrl(videoUrl);
  if (!normalized) {
    return null;
  }
  return pathResolve(uploadsDir, normalized.replace(/^\/uploads\//, ''));
}

async function cleanupUploadedRequestFiles(req) {
  const files = getUploadedFiles(req);
  if (files.length === 0) {
    return;
  }

  await Promise.all(files.map((file) => fs.unlink(file.path).catch(() => {})));
}

async function rejectEpisodeUploadRequest(req, res, status, error) {
  await cleanupUploadedRequestFiles(req);
  return res.status(status).json({ error });
}

function buildLocalVideoStreamUrl(episodeId, userId, userAgent) {
  return `/api/episodes/${episodeId}/stream?t=${encodeURIComponent(createStreamToken(episodeId, userId, userAgent))}`;
}

function getLocalVideoMimeType(videoUrl) {
  switch (extname(videoUrl || '').toLowerCase()) {
    case '.mp4':
      return 'video/mp4';
    case '.webm':
      return 'video/webm';
    case '.mov':
      return 'video/quicktime';
    default:
      return 'application/octet-stream';
  }
}

function isStreamableLocalVideo(episode) {
  const normalizedUrl = normalizeLocalVideoUrl(episode?.local_video_url);
  return Boolean(
    episode?.video_source === 'local'
    && normalizedUrl
    && (episode.transcoding_status === 'ready' || episode.transcoding_status === 'failed')
  );
}

function getAuthorizedPlaybackContext(req, res, options = {}) {
  const { mode = 'embed' } = options;
  const token = req.query.t ? String(req.query.t) : '';
  const decoded = mode === 'stream'
    ? verifyStreamToken(token, req.params.id, req.get('user-agent'))
    : verifyEmbedToken(token, req.params.id, req.get('user-agent'));
  if (!decoded) {
    res.status(403).send('Невалиден достъп до видеото');
    return null;
  }

  const playbackUser = getPlaybackUser(decoded.user_id);
  if (!playbackUser) {
    res.status(403).send('Нямате достъп до този епизод');
    return null;
  }

  const admin = isUserAdmin(playbackUser);
  const episode = getEpisodeWithProduction(req.params.id, { includeUnpublished: admin });
  if (!episode) {
    res.status(404).send('Епизодът не е намерен');
    return null;
  }

  const access = resolveEpisodeAccess(episode, playbackUser);
  if (!access.hasAccess) {
    res.status(403).send('Нямате достъп до този епизод');
    return null;
  }

  return { playbackUser, episode, access };
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
           p.thumbnail_url as production_thumbnail,
           p.purchase_mode as production_purchase_mode,
           p.purchase_price as production_purchase_price,
           p.available_from as production_available_from,
           p.available_until as production_available_until
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
           e.production_id, e.purchase_enabled, e.purchase_price,
           p.required_tier, p.access_group as production_access_group,
           p.purchase_mode as production_purchase_mode,
           p.purchase_price as production_purchase_price,
           p.available_from as production_available_from,
           p.available_until as production_available_until
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

  const purchaseState = getUserPurchaseState(user?.id);
  return siblings.find((candidate) => resolveEpisodeAccess(candidate, user, purchaseState).hasAccess) || null;
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

function resolveEpisodeAccess(episode, user, purchaseState) {
  return evaluateEpisodeAccess(episode, user, purchaseState || getUserPurchaseState(user?.id));
}

function createPlaybackToken(episodeId, userId, userAgent, options = {}) {
  const {
    audience = EMBED_TOKEN_AUDIENCE,
    expiresIn = EMBED_TOKEN_TTL,
    type = 'episode_embed',
  } = options;
  const jwtId = crypto.randomUUID
    ? crypto.randomUUID()
    : crypto.randomBytes(16).toString('hex');

  return jwt.sign(
    {
      type,
      episode_id: Number(episodeId),
      user_id: Number(userId),
      ua: hashUserAgent(userAgent),
    },
    EMBED_TOKEN_SECRET,
    {
      expiresIn,
      issuer: EMBED_TOKEN_ISSUER,
      audience,
      subject: String(userId),
      jwtid: jwtId,
      algorithm: 'HS256',
    }
  );
}

function createEmbedToken(episodeId, userId, userAgent) {
  return createPlaybackToken(episodeId, userId, userAgent, {
    audience: EMBED_TOKEN_AUDIENCE,
    expiresIn: EMBED_TOKEN_TTL,
    type: 'episode_embed',
  });
}

function createStreamToken(episodeId, userId, userAgent) {
  return createPlaybackToken(episodeId, userId, userAgent, {
    audience: STREAM_TOKEN_AUDIENCE,
    expiresIn: STREAM_TOKEN_TTL,
    type: 'episode_stream',
  });
}

function verifyPlaybackToken(token, episodeId, userAgent, options = {}) {
  const {
    audience = EMBED_TOKEN_AUDIENCE,
    type = 'episode_embed',
  } = options;
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, EMBED_TOKEN_SECRET, {
      algorithms: ['HS256'],
      issuer: EMBED_TOKEN_ISSUER,
      audience,
    });

    if (decoded?.type !== type) return null;
    if (Number(decoded.episode_id) !== Number(episodeId)) return null;
    if (!Number.isFinite(Number(decoded.user_id)) || Number(decoded.user_id) <= 0) return null;

    const expectedUaHash = hashUserAgent(userAgent);
    if (typeof decoded.ua !== 'string' || decoded.ua !== expectedUaHash) return null;

    return decoded;
  } catch {
    return null;
  }
}

function verifyEmbedToken(token, episodeId, userAgent) {
  return verifyPlaybackToken(token, episodeId, userAgent, {
    audience: EMBED_TOKEN_AUDIENCE,
    type: 'episode_embed',
  });
}

function verifyStreamToken(token, episodeId, userAgent) {
  return verifyPlaybackToken(token, episodeId, userAgent, {
    audience: STREAM_TOKEN_AUDIENCE,
    type: 'episode_stream',
  });
}

router.get('/latest', requireAuth, (req, res) => {
  const requestedLimit = toInt(req.query.limit, 12);
  const limit = Math.max(1, Math.min(30, requestedLimit));
  const fetchSize = Math.max(40, Math.min(220, limit * 6));
  const currentTimestamp = getCurrentSofiaDbTimestamp();
  const purchaseState = getUserPurchaseState(req.user.id);

  const rawEpisodes = db.prepare(`
    SELECT e.id, e.title, e.thumbnail_url, e.episode_number, e.created_at,
           e.access_group, e.purchase_enabled, e.purchase_price,
           p.title as production_title, p.slug as production_slug,
           p.required_tier, p.access_group as production_access_group,
           p.purchase_mode as production_purchase_mode,
           p.purchase_price as production_purchase_price,
           p.available_from as production_available_from,
           p.available_until as production_available_until
    FROM episodes e
    JOIN productions p ON e.production_id = p.id
    WHERE e.is_active = 1 AND p.is_active = 1
      AND (e.published_at IS NULL OR e.published_at <= ?)
    ORDER BY e.created_at DESC, e.id DESC
    LIMIT ?
  `).all(currentTimestamp, fetchSize);

  const episodes = rawEpisodes
    .map((episode) => enrichEpisodeForUser(episode, req.user, purchaseState))
    .filter((episode) => episode.has_access)
    .slice(0, limit);

  res.set('Cache-Control', 'private, max-age=20');
  res.json(episodes);
});

router.get('/calendar', requireAuth, (req, res) => {
  const admin = isUserAdmin(req.user);
  const fromTimestamp = getShiftedSofiaDbTimestamp(-14);
  const toTimestamp = getShiftedSofiaDbTimestamp(60);
  const purchaseState = getUserPurchaseState(req.user.id);

  const rawEpisodes = db.prepare(`
    SELECT e.id, e.title, e.thumbnail_url, e.episode_number, e.published_at, e.created_at, e.is_active,
           e.access_group, e.purchase_enabled, e.purchase_price,
           p.title as production_title, p.slug as production_slug,
           p.required_tier, p.access_group as production_access_group,
           p.purchase_mode as production_purchase_mode,
           p.purchase_price as production_purchase_price,
           p.available_from as production_available_from,
           p.available_until as production_available_until
    FROM episodes e
    JOIN productions p ON e.production_id = p.id
    WHERE e.published_at IS NOT NULL
      ${admin ? '' : "AND e.is_active = 1 AND p.is_active = 1"}
      AND e.published_at >= ?
      AND e.published_at <= ?
    ORDER BY e.published_at ASC
  `).all(fromTimestamp, toTimestamp);

  const episodes = rawEpisodes.map((episode) => enrichEpisodeForUser(episode, req.user, purchaseState));

  res.set('Cache-Control', 'private, max-age=60');
  res.json(episodes);
});

router.get('/:id/embed', (req, res) => {
  const playback = getAuthorizedPlaybackContext(req, res);
  if (!playback) return;

  const { episode, playbackUser } = playback;

  const siteNameRaw = db.prepare("SELECT value FROM site_settings WHERE key = 'site_name'").get()?.value
    || 'Платформа';
  const siteName = escapeHtml(siteNameRaw);
  const videoSource = episode.video_source || 'youtube';

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');

  if (videoSource === 'local') {
    if (!isStreamableLocalVideo(episode)) {
      if (episode.transcoding_status !== 'ready' && episode.transcoding_status !== 'failed') {
        return res.send(`<!doctype html>
<html lang="bg">
  <head><meta charset="utf-8" /><style>html,body{margin:0;width:100%;height:100%;background:#000;display:flex;align-items:center;justify-content:center;color:#fff;font:16px/1.4 system-ui;}</style></head>
  <body><p>Видеото се обработва...</p></body>
</html>`);
      }
      return res.status(404).send('Видео източникът липсва');
    }
    const videoUrl = escapeHtml(buildLocalVideoStreamUrl(episode.id, playbackUser.id, req.get('user-agent')));
    return res.send(`<!doctype html>
<html lang="bg">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; background: #000; }
      video { width: 100%; height: 100%; object-fit: contain; }
      .wm { position: fixed; left: 12px; bottom: 10px; color: rgba(255,255,255,.55); font: 11px/1.2 system-ui; letter-spacing: .18em; text-transform: uppercase; user-select: none; pointer-events: none; }
    </style>
  </head>
  <body oncontextmenu="return false">
    <video src="${videoUrl}" controls playsinline preload="metadata"></video>
    <div class="wm">${siteName}</div>
  </body>
</html>`);
  }

  // YouTube embed (default)
  if (!episode.youtube_video_id) {
    return res.status(404).send('Видео източникът липсва');
  }
  const videoId = encodeURIComponent(String(episode.youtube_video_id));
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
      allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
      allowfullscreen>
    </iframe>
    <div class="wm">${siteName}</div>
  </body>
</html>`);
});

router.get('/:id/stream', async (req, res) => {
  const playback = getAuthorizedPlaybackContext(req, res, { mode: 'stream' });
  if (!playback) return;

  const { episode } = playback;
  if (!isStreamableLocalVideo(episode)) {
    if (episode.video_source === 'local' && (episode.transcoding_status === 'pending' || episode.transcoding_status === 'processing')) {
      return res.status(409).json({ error: 'Видеото все още се обработва' });
    }
    return res.status(404).json({ error: 'Видео източникът липсва' });
  }

  const filePath = resolveLocalVideoFilePath(episode.local_video_url);
  if (!filePath) {
    return res.status(404).json({ error: 'Видео източникът липсва' });
  }

  try {
    const stats = await fs.stat(filePath);
    const totalSize = stats.size;
    const rangeHeader = String(req.headers.range || '').trim();
    const mimeType = getLocalVideoMimeType(episode.local_video_url);

    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Type', mimeType);

    if (rangeHeader) {
      const match = rangeHeader.match(/^bytes=(\d*)-(\d*)$/);
      if (!match) {
        res.setHeader('Content-Range', `bytes */${totalSize}`);
        return res.status(416).end();
      }

      let start = match[1] ? Number(match[1]) : 0;
      let end = match[2] ? Number(match[2]) : totalSize - 1;
      if (!Number.isFinite(start) || !Number.isFinite(end)) {
        res.setHeader('Content-Range', `bytes */${totalSize}`);
        return res.status(416).end();
      }

      if (!match[1] && match[2]) {
        const suffixLength = Number(match[2]);
        start = Math.max(totalSize - suffixLength, 0);
        end = totalSize - 1;
      }

      if (start < 0 || end < start || start >= totalSize) {
        res.setHeader('Content-Range', `bytes */${totalSize}`);
        return res.status(416).end();
      }

      end = Math.min(end, totalSize - 1);
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${totalSize}`);
      res.setHeader('Content-Length', end - start + 1);
      return createReadStream(filePath, { start, end }).pipe(res);
    }

    res.setHeader('Content-Length', totalSize);
    return createReadStream(filePath).pipe(res);
  } catch {
    return res.status(404).json({ error: 'Видео файлът не е намерен' });
  }
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

  const purchaseState = getUserPurchaseState(req.user.id);
  const access = evaluateEpisodeAccess(episode, req.user, purchaseState);

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

  const videoSource = episode.video_source || 'youtube';
  const embedToken = access.hasAccess
    ? createEmbedToken(episode.id, req.user.id, req.get('user-agent'))
    : null;
  const streamToken = access.hasAccess && isStreamableLocalVideo(episode)
    ? createStreamToken(episode.id, req.user.id, req.get('user-agent'))
    : null;
  const playableLocalVideoUrl = access.hasAccess && isStreamableLocalVideo(episode)
    ? `/api/episodes/${episode.id}/stream?t=${encodeURIComponent(streamToken)}`
    : null;

  const responsePayload = {
    ...episode,
    youtube_video_id: access.hasAccess ? (episode.youtube_video_id || undefined) : undefined,
    video_embed_url: null,
    video_source: videoSource,
    local_video_url: videoSource === 'local' ? playableLocalVideoUrl : null,
    transcoding_status: videoSource === 'local' ? (episode.transcoding_status || null) : null,
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
    purchase_enabled: access.episodePurchaseEnabled,
    purchase_price: access.episodePurchasePrice,
    can_purchase_episode: access.canPurchaseEpisode,
    can_purchase_production: access.canPurchaseProduction,
    is_purchased: access.isPurchased,
    purchase_source: access.purchaseSource,
    is_purchased_episode: access.isEpisodePurchased,
    has_pending_purchase: access.hasPendingEpisodePurchase,
    production_purchase_mode: access.productionPurchaseMode,
    production_purchase_price: access.productionPurchasePrice,
    production_is_purchased: access.isProductionPurchased,
    production_has_pending_purchase: access.hasPendingProductionPurchase,
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
    `/api/episodes/${episode.id}/embed?t=${encodeURIComponent(embedToken)}`;
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
    SELECT e.*, p.title as production_title,
           p.access_group as production_access_group,
           p.purchase_mode as production_purchase_mode,
           p.purchase_price as production_purchase_price,
           p.available_from as production_available_from,
           p.available_until as production_available_until
    ${baseFrom}
    ${whereSql}
    ORDER BY ${sortColumn} ${sortDir}, e.id DESC
    LIMIT ? OFFSET ?
  `).all(...params, pageSize, offset).map((episode) => ({
    ...episode,
    access_group: normalizeEpisodeGroup(episode.access_group),
    production_access_group: resolveProductionGroup(episode.production_access_group, episode.required_tier),
    purchase_enabled: Number(episode.purchase_enabled || 0) === 1,
    purchase_price: normalizePurchasePrice(episode.purchase_price, null),
    production_purchase_mode: episode.production_purchase_mode,
    production_purchase_price: normalizePurchasePrice(episode.production_purchase_price, null),
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
  episodeUpload.fields([
    { name: 'thumbnail', maxCount: 1 },
    { name: 'ad_banner', maxCount: 1 },
    { name: 'side_images', maxCount: 5 },
    { name: 'video_file', maxCount: 1 },
  ]),
  validateEpisodeUploads,
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
        purchase_enabled,
        purchase_price,
        is_active,
        published_at,
        thumbnail_url,
        ad_banner_url,
        side_images_urls,
        video_source,
        local_video_url,
      } = req.body;
      const uploadedVideo = req.files?.video_file?.[0] || null;

      const prod = db.prepare('SELECT id, title, purchase_mode FROM productions WHERE id = ?').get(production_id);
      if (!prod) return rejectEpisodeUploadRequest(req, res, 404, 'Продукцията не е намерена');
      if (!title || String(title).trim().length < 2) {
        return rejectEpisodeUploadRequest(req, res, 400, 'Заглавието е задължително');
      }

      const resolvedVideoSource = video_source === 'local' ? 'local' : 'youtube';

      if (resolvedVideoSource === 'youtube' && !isValidYouTubeId(youtube_video_id)) {
        return rejectEpisodeUploadRequest(req, res, 400, 'Невалиден YouTube видео идентификатор');
      }

      // Resolve video file for local source
      let resolvedLocalVideoUrl = null;
      let videoFilePath = null;
      let uploadedVideoPlan = null;
      const selectedLocalVideoUrl = local_video_url !== undefined && String(local_video_url).trim()
        ? normalizeLocalVideoUrl(local_video_url)
        : null;
      if (local_video_url !== undefined && String(local_video_url).trim() && !selectedLocalVideoUrl) {
        return rejectEpisodeUploadRequest(req, res, 400, 'Невалиден URL за локално видео');
      }
      if (resolvedVideoSource === 'local') {
        if (uploadedVideo) {
          resolvedLocalVideoUrl = `${LOCAL_VIDEO_URL_PREFIX}${uploadedVideo.filename}`;
          videoFilePath = uploadedVideo.path;
          uploadedVideoPlan = await analyzeUploadedVideo(videoFilePath);
          if (uploadedVideoPlan.decision === 'invalid') {
            return rejectEpisodeUploadRequest(req, res, 400, 'Файлът не съдържа валидно видео');
          }
          if (uploadedVideoPlan.decision === 'unavailable') {
            return rejectEpisodeUploadRequest(req, res, 503, 'Видео обработката е временно недостъпна');
          }
        } else if (selectedLocalVideoUrl) {
          resolvedLocalVideoUrl = selectedLocalVideoUrl;
        }
        if (!resolvedLocalVideoUrl) {
          return rejectEpisodeUploadRequest(req, res, 400, 'Качи локален видео файл');
        }
      }

      const selectedThumbnailUrl = thumbnail_url !== undefined && String(thumbnail_url).trim()
        ? normalizeManagedMediaUrl(thumbnail_url)
        : null;
      const selectedBannerUrl = ad_banner_url !== undefined && String(ad_banner_url).trim()
        ? normalizeManagedMediaUrl(ad_banner_url)
        : null;
      const selectedSideImages = parseManagedMediaUrlList(side_images_urls, { maxItems: 5 });

      if (thumbnail_url !== undefined && String(thumbnail_url).trim() && !selectedThumbnailUrl) {
        return rejectEpisodeUploadRequest(req, res, 400, 'Невалиден URL за кадър');
      }
      if (ad_banner_url !== undefined && String(ad_banner_url).trim() && !selectedBannerUrl) {
        return rejectEpisodeUploadRequest(req, res, 400, 'Невалиден URL за голямо изображение');
      }
      if (selectedSideImages.error) {
        return rejectEpisodeUploadRequest(req, res, 400, selectedSideImages.error);
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
      const normalizedPurchaseEnabled = isEnabledFlag(purchase_enabled, false);
      const normalizedEpisodePurchasePrice = normalizePurchasePrice(purchase_price, null);
      if (normalizedPurchaseEnabled && normalizedEpisodePurchasePrice === null) {
        return rejectEpisodeUploadRequest(req, res, 400, 'Посочете валидна цена за покупка на епизода.');
      }
      const hasPublishedAt = published_at !== undefined && String(published_at).trim() !== '';
      const publishedAtValue = hasPublishedAt ? normalizePublishedAtToSofia(published_at) : null;
      if (hasPublishedAt && !publishedAtValue) {
        return rejectEpisodeUploadRequest(req, res, 400, 'Невалидна дата за публикуване');
      }

      const result = db.prepare(`
      INSERT INTO episodes (
        production_id, title, description, youtube_video_id, thumbnail_url,
        side_images, side_text, ad_banner_url, ad_banner_link,
        access_group, purchase_enabled, purchase_price, episode_number, is_active, published_at,
        video_source, local_video_url, transcoding_status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        production_id,
        String(title).trim(),
        description || '',
        resolvedVideoSource === 'youtube' ? (youtube_video_id || '') : '',
        thumbnailUrl,
        sideImages,
        side_text || '',
        adBannerUrl,
        ad_banner_link || '',
        group,
        normalizedPurchaseEnabled ? 1 : 0,
        normalizedEpisodePurchasePrice,
        toInt(episode_number, 1),
        is_active === 'false' ? 0 : 1,
        publishedAtValue,
        resolvedVideoSource,
        resolvedLocalVideoUrl,
        videoFilePath
          ? (uploadedVideoPlan?.decision === 'ready' ? 'ready' : 'pending')
          : (resolvedLocalVideoUrl ? 'ready' : null)
      );

      const episode = db.prepare('SELECT * FROM episodes WHERE id = ?').get(result.lastInsertRowid);
      await registerUploadedMedia(req, {
        thumbnail: req.files?.thumbnail,
        ad_banner: req.files?.ad_banner,
        side_images: req.files?.side_images,
      }, { source: 'episode.create' });

      // Start transcoding if local video was uploaded
      if (videoFilePath && uploadedVideoPlan?.decision !== 'ready' && episode) {
        enqueueTranscode(episode.id, videoFilePath, { processingPlan: uploadedVideoPlan });
      }

      // Notify watchlisted users about new episode
      if (shouldNotifyEpisodeNow(episode)) {
        try {
          const watchlistUsers = db.prepare(
            'SELECT user_id FROM watchlist WHERE production_id = ?'
          ).all(production_id);
          if (watchlistUsers.length > 0) {
            const userIds = watchlistUsers.map((row) => row.user_id).filter((id) => id !== req.user.id);
            if (userIds.length > 0) {
              createBulkNotifications(userIds, {
                type: 'new_episode',
                title: `Нов епизод: ${title}`,
                message: `Нов епизод е добавен в продукция, която следите.`,
                link: `/episodes/${episode.id}`,
                metadata: { episode_id: episode.id, production_id: Number(production_id) },
              });
            }
          }
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
          purchase_enabled: Number(episode.purchase_enabled || 0) === 1,
          purchase_price: normalizePurchasePrice(episode.purchase_price, null),
          is_active: episode.is_active,
          video_source: resolvedVideoSource,
          video_processing_plan: uploadedVideoPlan?.decision || null,
        },
      });
      res.status(201).json({
        ...episode,
        access_group: normalizeEpisodeGroup(episode.access_group),
        purchase_enabled: Number(episode.purchase_enabled || 0) === 1,
        purchase_price: normalizePurchasePrice(episode.purchase_price, null),
      });
    } catch (err) {
      next(err);
    }
  }
);

router.put(
  '/admin/:id',
  requireAdmin,
  requireUploadLock,
  episodeUpload.fields([
    { name: 'thumbnail', maxCount: 1 },
    { name: 'ad_banner', maxCount: 1 },
    { name: 'side_images', maxCount: 5 },
    { name: 'video_file', maxCount: 1 },
  ]),
  validateEpisodeUploads,
  optimizeUploadedImages,
  async (req, res, next) => {
    try {
      const existing = db.prepare('SELECT * FROM episodes WHERE id = ?').get(req.params.id);
      if (!existing) {
        return rejectEpisodeUploadRequest(req, res, 404, 'Епизодът не е намерен');
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
        purchase_enabled,
        purchase_price,
        is_active,
        published_at,
        thumbnail_url,
        ad_banner_url,
        side_images_urls,
        video_source,
        local_video_url,
      } = req.body;
      const uploadedVideo = req.files?.video_file?.[0] || null;

      const nextProductionId = production_id !== undefined
        ? toInt(production_id, null)
        : existing.production_id;
      if (!nextProductionId) {
        return rejectEpisodeUploadRequest(req, res, 400, 'Избери валидна продукция за епизода');
      }
      const productionExists = db.prepare('SELECT id FROM productions WHERE id = ?').get(nextProductionId);
      if (!productionExists) {
        return rejectEpisodeUploadRequest(req, res, 404, 'Продукцията не е намерена');
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
        return rejectEpisodeUploadRequest(req, res, 400, 'Невалиден URL за кадър');
      }
      if (hasBannerUrl && String(ad_banner_url).trim() && !selectedBannerUrl) {
        return rejectEpisodeUploadRequest(req, res, 400, 'Невалиден URL за голямо изображение');
      }
      if (selectedSideImages.error) {
        return rejectEpisodeUploadRequest(req, res, 400, selectedSideImages.error);
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

      // Resolve video source
      const resolvedVideoSource = video_source !== undefined
        ? (video_source === 'local' ? 'local' : 'youtube')
        : (existing.video_source || 'youtube');

      if (resolvedVideoSource === 'youtube') {
        const ytId = youtube_video_id ?? existing.youtube_video_id;
        if (!isValidYouTubeId(ytId)) {
          return rejectEpisodeUploadRequest(req, res, 400, 'Невалиден YouTube видео идентификатор');
        }
      }

      // Resolve local video
      let resolvedLocalVideoUrl = existing.local_video_url;
      let videoFilePath = null;
      let nextTranscodingStatus = existing.transcoding_status;
      let uploadedVideoPlan = null;
      const selectedLocalVideoUrl = local_video_url !== undefined && String(local_video_url).trim()
        ? normalizeLocalVideoUrl(local_video_url)
        : null;
      if (local_video_url !== undefined && String(local_video_url).trim() && !selectedLocalVideoUrl) {
        return rejectEpisodeUploadRequest(req, res, 400, 'Невалиден URL за локално видео');
      }
      if (resolvedVideoSource === 'local') {
        if (uploadedVideo) {
          resolvedLocalVideoUrl = `${LOCAL_VIDEO_URL_PREFIX}${uploadedVideo.filename}`;
          videoFilePath = uploadedVideo.path;
          uploadedVideoPlan = await analyzeUploadedVideo(videoFilePath);
          if (uploadedVideoPlan.decision === 'invalid') {
            return rejectEpisodeUploadRequest(req, res, 400, 'Файлът не съдържа валидно видео');
          }
          if (uploadedVideoPlan.decision === 'unavailable') {
            return rejectEpisodeUploadRequest(req, res, 503, 'Видео обработката е временно недостъпна');
          }
          nextTranscodingStatus = uploadedVideoPlan.decision === 'ready' ? 'ready' : 'pending';
        } else if (selectedLocalVideoUrl) {
          resolvedLocalVideoUrl = selectedLocalVideoUrl;
          nextTranscodingStatus = existing.local_video_url === selectedLocalVideoUrl
            ? (existing.transcoding_status || 'ready')
            : 'ready';
        } else if (local_video_url !== undefined) {
          resolvedLocalVideoUrl = null;
          nextTranscodingStatus = null;
        }
        if (!resolvedLocalVideoUrl) {
          return rejectEpisodeUploadRequest(req, res, 400, 'Качи локален видео файл');
        }
      } else {
        resolvedLocalVideoUrl = null;
        nextTranscodingStatus = null;
      }

      let publishedAtValue = existing.published_at;
      if (published_at !== undefined) {
        const rawPublishedAt = String(published_at).trim();
        if (!rawPublishedAt) {
          publishedAtValue = null;
        } else {
          publishedAtValue = normalizePublishedAtToSofia(rawPublishedAt);
          if (!publishedAtValue) {
            return rejectEpisodeUploadRequest(req, res, 400, 'Невалидна дата за публикуване');
          }
        }
      }
      const nextPurchaseEnabled = Object.prototype.hasOwnProperty.call(req.body || {}, 'purchase_enabled')
        ? isEnabledFlag(purchase_enabled, false)
        : Number(existing.purchase_enabled || 0) === 1;
      const incomingEpisodePurchasePrice = Object.prototype.hasOwnProperty.call(req.body || {}, 'purchase_price')
        ? normalizePurchasePrice(purchase_price, null)
        : normalizePurchasePrice(existing.purchase_price, null);
      if (nextPurchaseEnabled && incomingEpisodePurchasePrice === null) {
        return rejectEpisodeUploadRequest(req, res, 400, 'Посочете валидна цена за покупка на епизода.');
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
        purchase_enabled = ?,
        purchase_price = ?,
        episode_number = ?,
        is_active = ?,
        published_at = ?,
        video_source = ?,
        local_video_url = ?,
        transcoding_status = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(
        nextProductionId,
        title ? String(title).trim() : existing.title,
        description ?? existing.description,
        resolvedVideoSource === 'youtube' ? (youtube_video_id ?? existing.youtube_video_id) : (existing.youtube_video_id || ''),
        thumbnailUrl,
        sideImages,
        side_text ?? existing.side_text,
        adBannerUrl,
        ad_banner_link ?? existing.ad_banner_link,
        normalizeEpisodeGroup(access_group, normalizeEpisodeGroup(existing.access_group)),
        nextPurchaseEnabled ? 1 : 0,
        incomingEpisodePurchasePrice,
        toInt(episode_number, existing.episode_number),
        is_active === undefined ? existing.is_active : (is_active === 'false' ? 0 : 1),
        publishedAtValue,
        resolvedVideoSource,
        resolvedLocalVideoUrl,
        nextTranscodingStatus,
        req.params.id
      );

      const updated = db.prepare('SELECT * FROM episodes WHERE id = ?').get(req.params.id);
      await registerUploadedMedia(req, {
        thumbnail: req.files?.thumbnail,
        ad_banner: req.files?.ad_banner,
        side_images: req.files?.side_images,
      }, { source: 'episode.update' });

      // Start transcoding if new local video was uploaded
      if (videoFilePath && uploadedVideoPlan?.decision !== 'ready' && updated) {
        enqueueTranscode(updated.id, videoFilePath, { processingPlan: uploadedVideoPlan });
      }
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
            purchase_enabled: Number(existing.purchase_enabled || 0) === 1,
            purchase_price: normalizePurchasePrice(existing.purchase_price, null),
            is_active: existing.is_active,
          },
          next: {
            production_id: updated.production_id,
            title: updated.title,
            episode_number: updated.episode_number,
            access_group: normalizeEpisodeGroup(updated.access_group),
            purchase_enabled: Number(updated.purchase_enabled || 0) === 1,
            purchase_price: normalizePurchasePrice(updated.purchase_price, null),
            is_active: updated.is_active,
            video_processing_plan: uploadedVideoPlan?.decision || null,
          },
        },
      });
      res.json({
        ...updated,
        access_group: normalizeEpisodeGroup(updated.access_group),
        purchase_enabled: Number(updated.purchase_enabled || 0) === 1,
        purchase_price: normalizePurchasePrice(updated.purchase_price, null),
      });
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
    db.prepare("DELETE FROM content_entitlements WHERE target_type = 'episode' AND target_id = ?").run(episodeId);
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

// ─── Migrate local video to YouTube ───
router.post('/admin/:id/migrate-to-youtube', requireAdmin, async (req, res) => {
  const { youtube_video_id } = req.body;
  if (!isValidYouTubeId(youtube_video_id) || !youtube_video_id?.trim()) {
    return res.status(400).json({ error: 'Невалиден YouTube видео идентификатор' });
  }

  const episode = db.prepare('SELECT * FROM episodes WHERE id = ?').get(req.params.id);
  if (!episode) {
    return res.status(404).json({ error: 'Епизодът не е намерен' });
  }

  // Delete local video file if it exists
  if (episode.local_video_url) {
    const filePath = resolveLocalVideoFilePath(episode.local_video_url);
    if (filePath) {
      await fs.unlink(filePath).catch(() => { });
    }
  }

  db.prepare(`
    UPDATE episodes
    SET video_source = 'youtube',
        youtube_video_id = ?,
        local_video_url = NULL,
        transcoding_status = NULL,
        updated_at = datetime('now')
    WHERE id = ?
  `).run(youtube_video_id.trim(), req.params.id);

  logAdminAction(req, {
    action: 'episode.migrate_to_youtube',
    entity_type: 'episode',
    entity_id: req.params.id,
    metadata: {
      title: episode.title,
      previous_source: episode.video_source,
      youtube_video_id: youtube_video_id.trim(),
    },
  });

  const updated = db.prepare('SELECT * FROM episodes WHERE id = ?').get(req.params.id);
  res.json({ success: true, episode: updated });
});

// ─── Transcode status (for polling) ───
router.get('/admin/:id/transcode-status', requireAdmin, (req, res) => {
  const episode = db.prepare('SELECT id, transcoding_status, video_source, local_video_url FROM episodes WHERE id = ?').get(req.params.id);
  if (!episode) {
    return res.status(404).json({ error: 'Епизодът не е намерен' });
  }
  res.json({
    transcoding_status: episode.transcoding_status,
    video_source: episode.video_source,
    local_video_url: episode.local_video_url,
  });
});

export default router;
