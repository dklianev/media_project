import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import db from '../db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret';
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
    throw new Error('Липсват JWT_SECRET и/или JWT_REFRESH_SECRET в production среда');
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
    db.prepare('DELETE FROM refresh_tokens WHERE user_id = ? AND token IN (?, ?)').run(
      userId,
      tokenHash,
      String(token)
    );
    return;
  }

  db.prepare('DELETE FROM refresh_tokens WHERE token IN (?, ?)').run(tokenHash, String(token));
}

export function revokeAllRefreshTokens(userId) {
  db.prepare('DELETE FROM refresh_tokens WHERE user_id = ?').run(userId);
}

export function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Необходима е автентикация' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = db.prepare(`
      SELECT u.*, sp.name as plan_name, sp.tier_level, sp.features as plan_features
      FROM users u
      LEFT JOIN subscription_plans sp ON u.subscription_plan_id = sp.id
      WHERE u.id = ?
    `).get(decoded.id);

    if (!user) {
      return res.status(401).json({ error: 'Потребителят не съществува' });
    }

    if (user.role === 'banned') {
      return res.status(403).json({ error: 'Профилът е ограничен от администратор' });
    }

    if (user.subscription_expires_at) {
      const expiresAt = new Date(user.subscription_expires_at);
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

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Невалиден токен' });
  }
}

export function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'admin' && req.user.role !== 'superadmin') {
      return res.status(403).json({ error: 'Нямате администраторски достъп' });
    }
    next();
  });
}

export function requireSuperAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'superadmin') {
      return res.status(403).json({ error: 'Нямате суперадмин достъп' });
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
          error: 'Нямаш достъп до тази страница. Моля, провери дали имаш необходимия абонамент.',
          required_tier: minTier,
          user_tier: userTier,
        });
      }
      next();
    });
  };
}
