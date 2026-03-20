import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import db from '../db.js';

const JWT_SECRET = process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' ? undefined : 'dev-secret-change-me');
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || (process.env.NODE_ENV === 'production' ? undefined : 'dev-refresh-secret');
if (!JWT_SECRET || !JWT_REFRESH_SECRET) {
  throw new Error('JWT_SECRET and JWT_REFRESH_SECRET must be set in environment variables');
}
const ACCESS_TOKEN_EXPIRY = process.env.ACCESS_TOKEN_EXPIRY || '1h';
const REFRESH_TOKEN_EXPIRY = process.env.REFRESH_TOKEN_EXPIRY || '30d';

function parseDuration(str) {
  const match = /^(\d+)\s*(ms|s|m|h|d)$/.exec(String(str).trim());
  if (!match) return 7 * 24 * 60 * 60 * 1000;
  const n = Number(match[1]);
  const unit = match[2];
  if (unit === 'ms') return n;
  if (unit === 's') return n * 1000;
  if (unit === 'm') return n * 60 * 1000;
  if (unit === 'h') return n * 60 * 60 * 1000;
  if (unit === 'd') return n * 24 * 60 * 60 * 1000;
  return 7 * 24 * 60 * 60 * 1000;
}

const REFRESH_TTL_MS = parseDuration(REFRESH_TOKEN_EXPIRY);

if (process.env.NODE_ENV === 'production') {
  if (!process.env.JWT_SECRET || !process.env.JWT_REFRESH_SECRET) {
    throw new Error('Missing JWT secrets in production environment');
  }
}

export function generateAccessToken(user) {
  return jwt.sign(
    { id: user.id, discord_id: user.discord_id, role: user.role },
    JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );
}

export function hashUserAgent(userAgent) {
  const raw = String(userAgent || '').trim();
  if (!raw) return '';
  return crypto.createHash('sha256').update(raw).digest('hex');
}

export function generateRefreshToken(user, options = {}) {
  const jti = crypto.randomBytes(16).toString('hex');
  const token = jwt.sign(
    { id: user.id, type: 'refresh', jti },
    JWT_REFRESH_SECRET,
    { expiresIn: REFRESH_TOKEN_EXPIRY }
  );

  const expiresAt = new Date(Date.now() + REFRESH_TTL_MS).toISOString();
  const tokenHash = hashRefreshToken(token);
  db.prepare(
    `INSERT INTO refresh_tokens (user_id, token, jti, user_agent_hash, expires_at, last_used_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'))`
  ).run(
    user.id,
    tokenHash,
    jti,
    hashUserAgent(options.userAgent),
    expiresAt
  );

  return token;
}

export function hashRefreshToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

export function removeRefreshToken(token, userId = null) {
  if (!token) return;
  const tokenHash = hashRefreshToken(token);

  if (userId !== null && userId !== undefined) {
    db.prepare('DELETE FROM refresh_tokens WHERE user_id = ? AND token = ?').run(userId, tokenHash);
    return;
  }

  db.prepare('DELETE FROM refresh_tokens WHERE token = ?').run(tokenHash);
}

export function revokeAllRefreshTokens(userId) {
  db.prepare('DELETE FROM refresh_tokens WHERE user_id = ?').run(userId);
}

export function resolveAuthenticatedUser(token) {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = db.prepare(`
      SELECT u.*, sp.name as plan_name, sp.tier_level, sp.features as plan_features
      FROM users u
      LEFT JOIN subscription_plans sp ON u.subscription_plan_id = sp.id
      WHERE u.id = ?
    `).get(decoded.id);

    if (!user) {
      return { ok: false, status: 401, error: 'missing_user' };
    }

    if (user.role === 'banned') {
      return { ok: false, status: 403, error: 'banned_user' };
    }

    if (user.subscription_expires_at) {
      const raw = String(user.subscription_expires_at).trim();
      const isoStr = raw.includes('T') || raw.includes('Z') ? raw : raw.replace(' ', 'T') + 'Z';
      const expiresAt = new Date(isoStr);
      if (!Number.isNaN(expiresAt.getTime()) && expiresAt <= new Date()) {
        db.prepare(`
          UPDATE users
          SET subscription_plan_id = NULL,
              subscription_expires_at = NULL,
              updated_at = datetime('now')
          WHERE id = ?
        `).run(user.id);

        user.subscription_plan_id = null;
        user.subscription_expires_at = null;
        user.plan_name = null;
        user.tier_level = 0;
        user.plan_features = null;
      }
    }

    return { ok: true, user };
  } catch {
    return { ok: false, status: 401, error: 'invalid_token' };
  }
}

export function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Липсва удостоверяване.' });
  }

  const token = authHeader.split(' ')[1];
  const resolved = resolveAuthenticatedUser(token);
  if (!resolved.ok) {
    if (resolved.error === 'missing_user') {
      return res.status(401).json({ error: 'Потребителят не е намерен.' });
    }
    if (resolved.error === 'banned_user') {
      return res.status(403).json({ error: 'Профилът е ограничен и няма достъп.' });
    }
    return res.status(401).json({ error: 'Невалиден токен.' });
  }

  req.user = resolved.user;
  next();
}

export function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'admin' && req.user.role !== 'superadmin') {
      return res.status(403).json({ error: 'Нямате административни права.' });
    }
    next();
  });
}

export function requireSuperAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'superadmin') {
      return res.status(403).json({ error: 'Нямате superadmin права.' });
    }
    next();
  });
}

export function requireTier(minTier) {
  return (req, res, next) => {
    requireAuth(req, res, () => {
      const userTier = req.user.tier_level || 0;
      if (userTier < minTier && req.user.role !== 'admin' && req.user.role !== 'superadmin') {
        return res.status(403).json({
          error: 'Нямате достатъчно ниво на достъп. Моля, изберете по-висок абонаментен план.',
          required_tier: minTier,
          user_tier: userTier,
        });
      }
      next();
    });
  };
}
