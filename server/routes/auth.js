import { Router } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import db from '../db.js';
import {
  generateAccessToken,
  generateRefreshToken,
  hashRefreshToken,
  removeRefreshToken,
  requireAuth,
  revokeAllRefreshTokens,
} from '../middleware/auth.js';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret';
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';
const OAUTH_STATE_COOKIE = 'oauth_state';
const OAUTH_STATE_TTL_MS = Number(process.env.OAUTH_STATE_TTL_MS || 10 * 60 * 1000);
const EXCHANGE_CODE_TTL_MS = Number(process.env.EXCHANGE_CODE_TTL_MS || 5 * 60 * 1000);
const IS_PROD = process.env.NODE_ENV === 'production';
const CHARACTER_NAME_REGEX = /^[\p{L}\p{N}\s._-]{2,50}$/u;
const REFRESH_COOKIE_NAME = process.env.REFRESH_COOKIE_NAME || 'refresh_token';
const REFRESH_COOKIE_DOMAIN = process.env.REFRESH_COOKIE_DOMAIN || undefined;
const REFRESH_COOKIE_PATH = process.env.REFRESH_COOKIE_PATH || '/api/auth';
const REFRESH_COOKIE_SAME_SITE_RAW = String(process.env.REFRESH_COOKIE_SAME_SITE || 'lax')
  .trim()
  .toLowerCase();
const REFRESH_COOKIE_SAME_SITE = ['lax', 'strict', 'none'].includes(REFRESH_COOKIE_SAME_SITE_RAW)
  ? REFRESH_COOKIE_SAME_SITE_RAW
  : 'lax';

function parseBooleanEnv(value) {
  if (value === undefined || value === null || value === '') return null;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return null;
}

const REFRESH_COOKIE_SECURE = REFRESH_COOKIE_SAME_SITE === 'none'
  ? true
  : (parseBooleanEnv(process.env.REFRESH_COOKIE_SECURE) ?? IS_PROD);

function oauthCookieOptions(maxAge) {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: IS_PROD,
    path: '/api/auth',
    maxAge,
  };
}

function refreshCookieOptions(maxAge) {
  const options = {
    httpOnly: true,
    sameSite: REFRESH_COOKIE_SAME_SITE,
    secure: REFRESH_COOKIE_SECURE,
    path: REFRESH_COOKIE_PATH,
    maxAge,
  };

  if (REFRESH_COOKIE_DOMAIN) {
    options.domain = REFRESH_COOKIE_DOMAIN;
  }

  return options;
}

function parseCookies(req) {
  const raw = String(req.headers.cookie || '');
  if (!raw) return {};

  const result = {};
  for (const part of raw.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (!key) continue;
    try {
      result[key] = decodeURIComponent(value);
    } catch {
      result[key] = value;
    }
  }
  return result;
}

function redirectWithError(res, code) {
  res.redirect(`${CLIENT_URL}/login?error=${encodeURIComponent(code)}`);
}

function setRefreshCookie(res, refreshToken) {
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, refreshCookieOptions(30 * 24 * 60 * 60 * 1000));
}

function clearRefreshCookie(res) {
  res.clearCookie(REFRESH_COOKIE_NAME, refreshCookieOptions(0));
}

function getRefreshTokenFromCookies(req) {
  return String(parseCookies(req)[REFRESH_COOKIE_NAME] || '').trim();
}

function decodeOptionalAccessToken(req) {
  const authHeader = String(req.headers.authorization || '');
  if (!authHeader.startsWith('Bearer ')) return null;
  try {
    return jwt.verify(authHeader.slice(7), JWT_SECRET);
  } catch {
    return null;
  }
}

function decodeRefreshToken(refreshToken) {
  if (!refreshToken) return null;
  try {
    const decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET);
    if (!decoded?.id || decoded?.type !== 'refresh' || !decoded?.jti) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}

function toUtcDateString(date) {
  return date.toISOString();
}

function cleanupAuthExchangeCodes() {
  db.prepare(`
    DELETE FROM auth_exchange_codes
    WHERE replace(replace(expires_at, 'T', ' '), 'Z', '') <= datetime('now')
       OR used_at IS NOT NULL
  `).run();
}

function cleanupExpiredRefreshTokens() {
  db.prepare(`
    DELETE FROM refresh_tokens
    WHERE replace(replace(expires_at, 'T', ' '), 'Z', '') <= datetime('now')
  `).run();
}

function saveAuthExchangeCode(userId) {
  const code = crypto.randomBytes(24).toString('hex');
  const expiresAt = toUtcDateString(new Date(Date.now() + EXCHANGE_CODE_TTL_MS));
  db.prepare(`
    INSERT INTO auth_exchange_codes (user_id, code, expires_at)
    VALUES (?, ?, ?)
  `).run(userId, code, expiresAt);
  return code;
}

function getDiscordEnvReady() {
  return (
    process.env.DISCORD_CLIENT_ID &&
    process.env.DISCORD_CLIENT_SECRET &&
    process.env.DISCORD_REDIRECT_URI
  );
}

// Discord OAuth - redirect to Discord
router.get('/discord', (req, res) => {
  if (!getDiscordEnvReady()) {
    return redirectWithError(res, 'oauth_not_configured');
  }

  const state = crypto.randomBytes(24).toString('hex');
  res.cookie(OAUTH_STATE_COOKIE, state, oauthCookieOptions(OAUTH_STATE_TTL_MS));

  const params = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID,
    redirect_uri: process.env.DISCORD_REDIRECT_URI,
    response_type: 'code',
    scope: 'identify',
    state,
  });

  res.redirect(`https://discord.com/api/oauth2/authorize?${params}`);
});

// Discord OAuth callback
router.get('/discord/callback', async (req, res) => {
  const { code, state } = req.query;
  const cookies = parseCookies(req);
  const expectedState = cookies[OAUTH_STATE_COOKIE];

  res.clearCookie(OAUTH_STATE_COOKIE, oauthCookieOptions(0));

  if (!code) {
    return redirectWithError(res, 'no_code');
  }
  if (!state || !expectedState || String(state) !== String(expectedState)) {
    return redirectWithError(res, 'invalid_state');
  }

  if (!getDiscordEnvReady()) {
    return redirectWithError(res, 'oauth_not_configured');
  }

  try {
    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID,
        client_secret: process.env.DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code: String(code),
        redirect_uri: process.env.DISCORD_REDIRECT_URI,
      }),
    });

    if (!tokenRes.ok) {
      return redirectWithError(res, 'token_exchange');
    }

    const tokenData = await tokenRes.json();
    const userRes = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    if (!userRes.ok) {
      return redirectWithError(res, 'user_fetch');
    }

    const discordUser = await userRes.json();
    let user = db.prepare('SELECT * FROM users WHERE discord_id = ?').get(discordUser.id);

    if (!user) {
      const avatar = discordUser.avatar
        ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`
        : null;
      const role = discordUser.id === process.env.ADMIN_DISCORD_ID ? 'superadmin' : 'user';

      const result = db.prepare(`
        INSERT INTO users (discord_id, discord_username, discord_avatar, role)
        VALUES (?, ?, ?, ?)
      `).run(discordUser.id, discordUser.username, avatar, role);

      user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
    } else {
      const avatar = discordUser.avatar
        ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`
        : user.discord_avatar;

      db.prepare(`
        UPDATE users
        SET discord_username = ?, discord_avatar = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(discordUser.username, avatar, user.id);

      user = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
    }

    if (user.role === 'banned') {
      return redirectWithError(res, 'banned');
    }

    cleanupAuthExchangeCodes();
    const authCode = saveAuthExchangeCode(user.id);
    res.redirect(`${CLIENT_URL}/auth/callback?code=${encodeURIComponent(authCode)}`);
  } catch (err) {
    console.error('Discord OAuth error:', err);
    redirectWithError(res, 'server');
  }
});

// Exchange one-time auth code for access/refresh tokens
router.post('/exchange', (req, res) => {
  const code = String(req.body?.code || '').trim();
  if (!code || code.length < 20) {
    return res.status(400).json({ error: 'Невалиден код за вход' });
  }

  cleanupAuthExchangeCodes();
  const row = db.prepare(`
    SELECT id, user_id, expires_at, used_at
    FROM auth_exchange_codes
    WHERE code = ?
  `).get(code);

  if (!row) {
    return res.status(400).json({ error: 'Невалиден код за вход' });
  }
  if (row.used_at) {
    return res.status(400).json({ error: 'Кодът за вход вече е използван' });
  }
  if (new Date(row.expires_at) <= new Date()) {
    db.prepare('DELETE FROM auth_exchange_codes WHERE id = ?').run(row.id);
    return res.status(400).json({ error: 'Кодът за вход е изтекъл' });
  }

  const mark = db.prepare(`
    UPDATE auth_exchange_codes
    SET used_at = datetime('now')
    WHERE id = ? AND used_at IS NULL
  `).run(row.id);
  if (mark.changes === 0) {
    return res.status(400).json({ error: 'Кодът за вход вече е използван' });
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(row.user_id);
  db.prepare('DELETE FROM auth_exchange_codes WHERE id = ?').run(row.id);

  if (!user) {
    return res.status(401).json({ error: 'Потребителят не съществува' });
  }
  if (user.role === 'banned') {
    revokeAllRefreshTokens(user.id);
    clearRefreshCookie(res);
    return res.status(403).json({ error: 'Профилът е ограничен от администратор' });
  }

  cleanupExpiredRefreshTokens();
  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user, { userAgent: req.get('user-agent') });
  setRefreshCookie(res, refreshToken);
  res.json({ access_token: accessToken });
});

// Set public profile name (first login)
router.post('/character-name', requireAuth, (req, res) => {
  const characterName = String(req.body?.character_name || '').trim();
  if (!characterName || characterName.length < 2 || characterName.length > 50) {
    return res.status(400).json({ error: 'Публичното име трябва да е между 2 и 50 символа' });
  }
  if (!CHARACTER_NAME_REGEX.test(characterName)) {
    return res.status(400).json({ error: 'Името съдържа невалидни символи' });
  }

  db.prepare(`
    UPDATE users
    SET character_name = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(characterName, req.user.id);

  res.json({ success: true, character_name: characterName });
});

// Get current user
router.get('/me', requireAuth, (req, res) => {
  const user = db.prepare(`
    SELECT u.id, u.discord_id, u.discord_username, u.discord_avatar,
           u.character_name, u.role, u.subscription_plan_id,
           u.subscription_expires_at, u.created_at,
           sp.name as plan_name, sp.tier_level, sp.features as plan_features, sp.price as plan_price
    FROM users u
    LEFT JOIN subscription_plans sp ON u.subscription_plan_id = sp.id
    WHERE u.id = ?
  `).get(req.user.id);

  res.json(user);
});

// Rotate refresh token and issue new access token
router.post('/refresh', (req, res) => {
  const refreshToken = getRefreshTokenFromCookies(req);
  if (!refreshToken) {
    return res.status(400).json({ error: 'Липсва валидна сесия' });
  }

  const decoded = decodeRefreshToken(refreshToken);
  if (!decoded) {
    clearRefreshCookie(res);
    return res.status(401).json({ error: 'Невалиден refresh token' });
  }

  cleanupExpiredRefreshTokens();
  const tokenHash = hashRefreshToken(refreshToken);

  let stored = db.prepare(`
    SELECT *
    FROM refresh_tokens
    WHERE user_id = ? AND jti = ?
  `).get(decoded.id, decoded.jti);

  if (!stored) {
    stored = db.prepare(`
      SELECT *
      FROM refresh_tokens
      WHERE user_id = ? AND token = ?
    `).get(decoded.id, tokenHash);

    if (stored && !stored.jti) {
      db.prepare(`
        UPDATE refresh_tokens
        SET jti = ?, last_used_at = datetime('now')
        WHERE id = ?
      `).run(decoded.jti, stored.id);
      stored = { ...stored, jti: decoded.jti };
    }
  }

  if (!stored) {
    clearRefreshCookie(res);
    return res.status(401).json({ error: 'Сесията е невалидна. Влез отново.' });
  }

  if (stored.token !== tokenHash) {
    db.prepare('DELETE FROM refresh_tokens WHERE id = ?').run(stored.id);
    clearRefreshCookie(res);
    return res.status(401).json({ error: 'Сесията е невалидна. Влез отново.' });
  }

  if (new Date(stored.expires_at) <= new Date()) {
    db.prepare('DELETE FROM refresh_tokens WHERE id = ?').run(stored.id);
    clearRefreshCookie(res);
    return res.status(401).json({ error: 'Refresh token е изтекъл' });
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(decoded.id);
  if (!user) {
    revokeAllRefreshTokens(decoded.id);
    clearRefreshCookie(res);
    return res.status(401).json({ error: 'Потребителят не съществува' });
  }
  if (user.role === 'banned') {
    revokeAllRefreshTokens(decoded.id);
    clearRefreshCookie(res);
    return res.status(403).json({ error: 'Профилът е ограничен от администратор' });
  }

  const rotated = db.transaction(() => {
    db.prepare('DELETE FROM refresh_tokens WHERE id = ?').run(stored.id);
    const nextAccessToken = generateAccessToken(user);
    const nextRefreshToken = generateRefreshToken(user, { userAgent: req.get('user-agent') });
    return {
      accessToken: nextAccessToken,
      refreshToken: nextRefreshToken,
    };
  })();

  setRefreshCookie(res, rotated.refreshToken);
  res.json({
    access_token: rotated.accessToken,
  });
});

// Logout
router.post('/logout', (req, res) => {
  const refreshToken = getRefreshTokenFromCookies(req);
  const logoutAll = Boolean(req.body?.all_sessions);
  const accessPayload = decodeOptionalAccessToken(req);
  const refreshPayload = decodeRefreshToken(refreshToken);
  const userId = accessPayload?.id || refreshPayload?.id || null;

  if (logoutAll && userId) {
    revokeAllRefreshTokens(userId);
  } else if (refreshToken) {
    removeRefreshToken(refreshToken, userId);
  }

  clearRefreshCookie(res);
  res.json({ success: true });
});

export default router;
