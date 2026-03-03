import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import crypto from 'crypto';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, readFileSync } from 'fs';

// Import DB (runs migrations on import)
import db from './db.js';
import jwt from 'jsonwebtoken';

// Import routes
import authRoutes from './routes/auth.js';
import productionRoutes from './routes/productions.js';
import episodeRoutes from './routes/episodes.js';
import reactionRoutes from './routes/reactions.js';
import planRoutes from './routes/plans.js';
import paymentRoutes from './routes/payments.js';
import promoRoutes from './routes/promo.js';
import userSelfRoutes from './routes/user-self.js';
import userRoutes from './routes/users.js';
import settingsRoutes from './routes/settings.js';
import auditRoutes from './routes/audit.js';
import dashboardRoutes from './routes/dashboard.js';
import watchlistRoutes from './routes/watchlist.js';
import watchHistoryRoutes from './routes/watch-history.js';
import exportRoutes from './routes/export.js';
import commentsRoutes from './routes/comments.js';
import notificationsRoutes from './routes/notifications.js';
import supportRoutes from './routes/support.js';
import mediaRoutes from './routes/media.js';
import {
  optimizeUploadedImages,
  requireUploadLock,
  upload,
  UPLOAD_MAX_FILE_SIZE_MB,
  VIDEO_MAX_FILE_SIZE_MB,
} from './middleware/upload.js';
import { requireAdmin } from './middleware/auth.js';
import { logAdminAction } from './utils/audit.js';
import { registerUploadedMedia } from './utils/mediaLibrary.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const API_RATE_LIMIT_WINDOW_MS = Number(process.env.API_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000);
const API_RATE_LIMIT_MAX = Number(process.env.API_RATE_LIMIT_MAX || 240);
const AUTH_RATE_LIMIT_WINDOW_MS = Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000);
const AUTH_RATE_LIMIT_MAX = Number(process.env.AUTH_RATE_LIMIT_MAX || 40);
const JSON_LIMIT = process.env.JSON_LIMIT || '1mb';
const TRUST_PROXY_ENV = String(process.env.TRUST_PROXY ?? '1').trim().toLowerCase();
const IS_PROD = process.env.NODE_ENV === 'production';
const JWT_SECRET = process.env.JWT_SECRET || (IS_PROD ? undefined : 'dev-secret-change-me');
const EXTRA_CSP_IMG_SRC = String(process.env.CSP_IMG_SRC_EXTRA || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const CSP_IMG_SRC = Array.from(new Set([
  "'self'",
  'data:',
  'blob:',
  'https:',
  ...(IS_PROD ? [] : ['http:']),
  ...EXTRA_CSP_IMG_SRC,
]));

// ─── Maintenance mode in-memory cache (30s TTL) ───
let _maintenanceCache = { value: false, ts: 0 };
function isMaintenanceMode() {
  if (Date.now() - _maintenanceCache.ts < 30_000) return _maintenanceCache.value;
  const row = db.prepare("SELECT value FROM site_settings WHERE key = 'maintenance_mode'").get();
  _maintenanceCache = { value: row?.value === 'true', ts: Date.now() };
  return _maintenanceCache.value;
}
export function invalidateMaintenanceCache() { _maintenanceCache.ts = 0; }

// ─── ENV validation ───
const REQUIRED_ENV_PROD = ['JWT_SECRET', 'JWT_REFRESH_SECRET', 'DISCORD_CLIENT_ID', 'DISCORD_CLIENT_SECRET', 'DISCORD_REDIRECT_URI'];
const RECOMMENDED_ENV = ['DISCORD_CLIENT_ID', 'DISCORD_CLIENT_SECRET', 'DISCORD_REDIRECT_URI'];
if (process.env.NODE_ENV === 'production') {
  for (const key of REQUIRED_ENV_PROD) {
    if (!process.env[key]) throw new Error(`Missing required ENV variable: ${key}`);
  }
} else {
  for (const key of RECOMMENDED_ENV) {
    if (!process.env[key]) console.warn(`[WARN] Missing ENV variable: ${key} — OAuth login won't work`);
  }
}

export function createApp() {
  const app = express();

  // ─── Middleware ───

  if (TRUST_PROXY_ENV === '0' || TRUST_PROXY_ENV === 'false' || TRUST_PROXY_ENV === 'off') {
    app.set('trust proxy', false);
  } else if (TRUST_PROXY_ENV === 'true' || TRUST_PROXY_ENV === 'on') {
    app.set('trust proxy', 1);
  } else if (!Number.isNaN(Number(TRUST_PROXY_ENV))) {
    app.set('trust proxy', Number(TRUST_PROXY_ENV));
  } else {
    app.set('trust proxy', TRUST_PROXY_ENV);
  }

  const corsOrigin = process.env.CLIENT_URL
    || (process.env.NODE_ENV === 'production' ? false : 'http://localhost:5173');
  app.use(cors({
    origin: corsOrigin,
    credentials: true,
  }));

  // CSP nonce middleware — generate per-request nonce for script tags
  app.use((req, res, next) => {
    res.locals.cspNonce = crypto.randomBytes(16).toString('base64');
    next();
  });

  app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        frameSrc: [
          "'self'",
          'https://www.youtube-nocookie.com',
          'https://www.youtube.com',
          'https://player.twitch.tv',
          'https://www.twitch.tv',
          'https://player.kick.com',
          'https://kick.com',
        ],
        imgSrc: CSP_IMG_SRC,
        scriptSrc: ["'self'", 'https://www.youtube.com', 'https://s.ytimg.com', (req, res) => `'nonce-${res.locals.cspNonce}'`],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      },
    },
  }));

  app.use(compression());
  app.use(express.json({ limit: JSON_LIMIT }));

  // Rate limiting
  const limiter = rateLimit({
    windowMs: API_RATE_LIMIT_WINDOW_MS,
    max: API_RATE_LIMIT_MAX,
    skip: (req) => req.path.startsWith('/auth/'),
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Твърде много заявки. Опитайте отново след малко.' },
  });
  app.use('/api/', limiter);

  // Auth rate limiter (stricter)
  const authLimiter = rateLimit({
    windowMs: AUTH_RATE_LIMIT_WINDOW_MS,
    max: AUTH_RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res, next, options) => {
      // If it's a GET request to a browser-facing auth endpoint, redirect back to login
      if (req.method === 'GET' && (req.path === '/discord' || req.path === '/discord/callback')) {
        const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
        return res.redirect(`${clientUrl}/login?error=rate_limited`);
      }
      res.status(options.statusCode).json(options.message);
    },
    message: { error: 'Твърде много опити за вход. Опитайте отново след малко.' },
  });
  app.use('/api/auth/', authLimiter);

  // Static files
  app.use('/uploads/videos', (req, res) => {
    res.status(404).json({ error: 'Файлът не е намерен' });
  });
  app.use('/uploads', express.static(resolve(__dirname, '..', 'public', 'uploads'), {
    maxAge: '30d',
    etag: true,
    immutable: true,
  }));

  // ─── Maintenance mode middleware ───

  app.use('/api/', (req, res, next) => {
    // Skip auth routes so users can still log in
    if (req.path.startsWith('/auth/')) return next();
    // Skip settings public route so frontend can read maintenance status
    if (req.path === '/settings/public') return next();

    if (!isMaintenanceMode()) return next();

    // Allow admins/superadmins through — check JWT without blocking
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      try {
        const token = authHeader.slice(7);
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded?.role === 'admin' || decoded?.role === 'superadmin') return next();
      } catch { /* token invalid — treat as non-admin */ }
    }

    return res.status(503).json({
      error: 'Платформата е в режим на поддръжка. Моля, опитайте по-късно.',
      maintenance: true,
    });
  });

  // ─── Health check ───
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', uptime: Math.floor(process.uptime()) });
  });

  // ─── API Routes ───

  app.use('/api/auth', authRoutes);
  app.use('/api/productions', productionRoutes);
  app.use('/api/episodes', episodeRoutes);
  app.use('/api/episodes', reactionRoutes);
  app.use('/api/plans', planRoutes);
  app.use('/api/payments', paymentRoutes);
  // Compatibility aliases:
  // /api/subscribe, /api/my-payments, /api/promo/validate, /api/admin/payments
  app.use('/api', paymentRoutes);
  app.use('/api/admin/promo-codes', promoRoutes);
  app.use('/api/users', userSelfRoutes);
  app.use('/api/admin/users', userRoutes);
  app.use('/api/settings', settingsRoutes);
  app.use('/api/admin/settings', settingsRoutes);
  app.use('/api/admin/audit', auditRoutes);
  app.use('/api/admin/dashboard', dashboardRoutes);
  app.use('/api/admin/export', exportRoutes);
  app.use('/api/admin/media', mediaRoutes);
  app.use('/api/watchlist', watchlistRoutes);
  app.use('/api/watch-history', watchHistoryRoutes);
  app.use('/api/comments', commentsRoutes);
  app.use('/api/notifications', notificationsRoutes);
  app.use('/api/support', supportRoutes);

  // Generic upload endpoint for admin
  app.post(
    '/api/admin/upload',
    requireAdmin,
    requireUploadLock,
    upload.single('file'),
    optimizeUploadedImages,
    async (req, res, next) => {
      try {
        if (!req.file) {
          return res.status(400).json({ error: 'Не е качен файл' });
        }
        const url = `/uploads/${req.file.filename}`;
        await registerUploadedMedia(req, [req.file], { source: 'admin.upload' });
        logAdminAction(req, {
          action: 'upload.create',
          entity_type: 'upload',
          entity_id: req.file.filename,
          metadata: {
            url,
            size: req.file.size,
            mimetype: req.file.mimetype,
          },
        });
        return res.json({ url });
      } catch (err) {
        return next(err);
      }
    }
  );

  // ─── Serve frontend in production ───

  const distPath = resolve(__dirname, '..', 'dist');
  if (existsSync(distPath)) {
    const indexHtmlPath = resolve(distPath, 'index.html');
    const indexHtmlTemplate = existsSync(indexHtmlPath) ? readFileSync(indexHtmlPath, 'utf8') : null;

    app.use(express.static(distPath, { index: false }));
    app.get('{*splat}', (req, res, next) => {
      if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/')) return next();
      if (!indexHtmlTemplate) return res.status(404).send('Not found');
      // Inject CSP nonce into all <script> tags
      const html = indexHtmlTemplate.replace(/<script/g, `<script nonce="${res.locals.cspNonce}"`);
      res.setHeader('Content-Type', 'text/html');
      res.send(html);
    });
  }

  // Explicit 404s for API and uploads (prevents hanging requests when SPA fallback is enabled).
  app.use('/api', (req, res) => {
    res.status(404).json({ error: 'Маршрутът не е намерен' });
  });
  app.use('/uploads', (req, res) => {
    res.status(404).json({ error: 'Файлът не е намерен' });
  });

  // ─── Error handler ───

  app.use((err, req, res, next) => {
    console.error('Server error:', err);
    if (err.code === 'LIMIT_FILE_SIZE') {
      const isVideoUpload = err.field === 'video_file';
      const limitLabel = isVideoUpload
        ? `${Math.round((VIDEO_MAX_FILE_SIZE_MB / 1024) * 100) / 100} GB`
        : `${UPLOAD_MAX_FILE_SIZE_MB}MB`;
      return res.status(413).json({ error: `Файлът е твърде голям (макс ${limitLabel})` });
    }
    if (err.message?.includes('Неподдържан формат') || err.message?.includes('Неподдържан видео формат')) {
      return res.status(400).json({ error: err.message });
    }
    return res.status(500).json({ error: 'Вътрешна грешка на сървъра' });
  });

  return app;
}
