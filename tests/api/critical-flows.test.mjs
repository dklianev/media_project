import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import os from 'node:os';
import Database from 'better-sqlite3';
import jwt from 'jsonwebtoken';

const JWT_SECRET = 'test-jwt-secret';
const JWT_REFRESH_SECRET = 'test-refresh-secret';
const EMBED_TOKEN_SECRET = 'test-embed-secret';
const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const TINY_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF9sAAAAASUVORK5CYII=';

let server;
let baseUrl;
let db;
let tempDir;
let dbPath;
let userCounter = 1;

function createAccessToken(user) {
  return jwt.sign(
    { id: user.id, discord_id: user.discord_id, role: user.role },
    JWT_SECRET,
    { expiresIn: '15m' }
  );
}

function createRefreshToken(user) {
  const jti = randomBytes(16).toString('hex');
  const token = jwt.sign(
    {
      id: user.id,
      type: 'refresh',
      jti,
    },
    JWT_REFRESH_SECRET,
    { expiresIn: '7d' }
  );

  const tokenHash = createHash('sha256').update(token).digest('hex');
  db.prepare(`
    INSERT INTO refresh_tokens (user_id, token, jti, expires_at, last_used_at)
    VALUES (?, ?, ?, ?, datetime('now'))
  `).run(user.id, tokenHash, jti, new Date(Date.now() + REFRESH_TTL_MS).toISOString());

  return token;
}

function createUser(overrides = {}) {
  const suffix = userCounter++;
  const role = overrides.role || 'user';
  const discordId = overrides.discord_id || `test-discord-${suffix}`;
  const discordUsername = overrides.discord_username || `test_user_${suffix}`;
  const characterName = overrides.character_name || `Тест Потребител ${suffix}`;

  const result = db.prepare(`
    INSERT INTO users (
      discord_id,
      discord_username,
      discord_avatar,
      character_name,
      role,
      subscription_plan_id,
      subscription_expires_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    discordId,
    discordUsername,
    overrides.discord_avatar || null,
    characterName,
    role,
    overrides.subscription_plan_id ?? null,
    overrides.subscription_expires_at ?? null
  );

  return db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
}

function createPlan(overrides = {}) {
  const result = db.prepare(`
    INSERT INTO subscription_plans (
      name, description, price, tier_level, duration_days, features, is_active, sort_order
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    overrides.name || `План ${userCounter}`,
    overrides.description || '',
    overrides.price ?? 10,
    overrides.tier_level ?? 1,
    overrides.duration_days ?? 30,
    JSON.stringify(overrides.features || []),
    overrides.is_active ?? 1,
    overrides.sort_order ?? 0
  );

  return db.prepare('SELECT * FROM subscription_plans WHERE id = ?').get(result.lastInsertRowid);
}

function createPromoCode(overrides = {}) {
  const result = db.prepare(`
    INSERT INTO promo_codes (
      code, discount_percent, is_active, uses_count, max_uses, expires_at
    )
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    overrides.code || `PROMO${userCounter}`,
    overrides.discount_percent ?? 10,
    overrides.is_active ?? 1,
    overrides.uses_count ?? 0,
    overrides.max_uses ?? null,
    overrides.expires_at ?? null
  );

  return db.prepare('SELECT * FROM promo_codes WHERE id = ?').get(result.lastInsertRowid);
}

function parseDbTimestamp(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (raw.includes('T')) return new Date(raw);
  return new Date(raw.replace(' ', 'T') + 'Z');
}

function createProduction(overrides = {}) {
  const idSuffix = userCounter++;
  const result = db.prepare(`
    INSERT INTO productions (
      title, slug, description, thumbnail_url, cover_image_url,
      required_tier, access_group, is_active, sort_order, purchase_mode, purchase_price
    )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    overrides.title || `Продукция ${idSuffix}`,
    overrides.slug || `production-${idSuffix}`,
    overrides.description || '',
    overrides.thumbnail_url || null,
    overrides.cover_image_url || null,
    overrides.required_tier ?? 0,
    overrides.access_group || 'subscription',
    overrides.is_active ?? 1,
    overrides.sort_order ?? 0,
    overrides.purchase_mode || 'none',
    overrides.purchase_price ?? null
  );

  return db.prepare('SELECT * FROM productions WHERE id = ?').get(result.lastInsertRowid);
}

function createEpisode(overrides = {}) {
  const result = db.prepare(`
    INSERT INTO episodes (
      production_id, title, description, youtube_video_id, thumbnail_url,
      side_images, side_text, ad_banner_url, ad_banner_link,
      access_group, purchase_enabled, purchase_price, episode_number, view_count, is_active
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    overrides.production_id,
    overrides.title || 'Епизод',
    overrides.description || '',
    overrides.youtube_video_id || 'dQw4w9WgXcQ',
    overrides.thumbnail_url || null,
    JSON.stringify(overrides.side_images || []),
    overrides.side_text || '',
    overrides.ad_banner_url || null,
    overrides.ad_banner_link || null,
    overrides.access_group || 'inherit',
    overrides.purchase_enabled ?? 0,
    overrides.purchase_price ?? null,
    overrides.episode_number ?? 1,
    overrides.view_count ?? 0,
    overrides.is_active ?? 1
  );

  return db.prepare('SELECT * FROM episodes WHERE id = ?').get(result.lastInsertRowid);
}

async function apiRequest(path, { method = 'GET', token, body, headers: extraHeaders } = {}) {
  const headers = { ...(extraHeaders || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  let data = null;
  try {
    data = await response.json();
  } catch {}

  return { response, data };
}

async function apiTextRequest(path, { method = 'GET', token, body, headers: extraHeaders } = {}) {
  const headers = { ...(extraHeaders || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  return { response, text };
}

async function apiFormRequest(path, { method = 'POST', token, formData, headers: extraHeaders } = {}) {
  const headers = { ...(extraHeaders || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: formData,
  });

  let data = null;
  try {
    data = await response.json();
  } catch {}

  return { response, data };
}

function createTinyPngBlob() {
  return new Blob([Buffer.from(TINY_PNG_BASE64, 'base64')], { type: 'image/png' });
}

function extractCookieValue(setCookieHeader, name) {
  const match = String(setCookieHeader || '').match(new RegExp(`${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : '';
}

function resetDatabase() {
  const tables = [
    'admin_audit_logs',
    'media_assets',
    'notifications',
    'support_ticket_messages',
    'support_tickets',
    'watch_party_messages',
    'watch_party_participants',
    'watch_parties',
    'content_entitlements',
    'content_purchase_requests',
    'reactions',
    'comments',
    'watch_history',
    'watchlist',
    'episodes',
    'productions',
    'payment_references',
    'refresh_tokens',
    'ratings',
    'promotion_usages',
    'promotions',
    'bundles',
    'purchase_wishlist',
    'gift_codes',
    'referral_rewards',
    'auth_exchange_codes',
    'users',
    'promo_codes',
    'subscription_plans',
  ];
  for (const table of tables) {
    db.prepare(`DELETE FROM ${table}`).run();
  }
}

before(async () => {
  tempDir = mkdtempSync(join(os.tmpdir(), 'media-project-tests-'));
  dbPath = join(tempDir, 'media-test.sqlite');

  process.env.NODE_ENV = 'test';
  process.env.DB_PATH = dbPath;
  process.env.CLIENT_URL = 'http://127.0.0.1';
  process.env.JWT_SECRET = JWT_SECRET;
  process.env.JWT_REFRESH_SECRET = JWT_REFRESH_SECRET;
  process.env.EMBED_TOKEN_SECRET = EMBED_TOKEN_SECRET;
  process.env.TRUST_PROXY = '0';
  process.env.ADMIN_DISCORD_ID = 'admin-test-discord-id';

  const { createApp } = await import(new URL('../../server/app.js', import.meta.url));
  const app = createApp();

  await new Promise((resolvePromise) => {
    server = app.listen(0, () => resolvePromise());
  });

  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  baseUrl = `http://127.0.0.1:${port}`;

  db = new Database(dbPath);
  db.pragma('foreign_keys = ON');
});

after(async () => {
  try {
    db?.close();
  } catch {}

  if (server) {
    await new Promise((resolvePromise) => server.close(() => resolvePromise()));
  }

  try {
    const { default: serverDb } = await import(new URL('../../server/db.js', import.meta.url));
    serverDb.close();
  } catch {}

  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

beforeEach(() => {
  resetDatabase();
});

test('content purchase request creates pending production request and blocks duplicate pending request', async () => {
  const production = createProduction({
    title: 'One Time Production',
    slug: 'one-time-production',
    required_tier: 2,
    access_group: 'subscription',
    purchase_mode: 'production',
    purchase_price: 34.5,
    is_active: 1,
  });
  const viewer = createUser({ character_name: 'Purchase Viewer' });
  const viewerToken = createAccessToken(viewer);

  const created = await apiRequest('/api/content-purchases', {
    method: 'POST',
    token: viewerToken,
    body: { target_type: 'production', target_id: production.id },
  });

  assert.equal(created.response.status, 201);
  assert.equal(created.data?.target_type, 'production');
  assert.equal(Number(created.data?.target_id), Number(production.id));
  assert.equal(created.data?.target_title, production.title);
  assert.equal(created.data?.final_price, 34.5);
  assert.match(created.data?.reference_code || '', /^BUY-PRO-/);

  const stored = db.prepare(`
    SELECT status, target_type, target_id, final_price
    FROM content_purchase_requests
    WHERE user_id = ?
  `).get(viewer.id);
  assert.equal(stored.status, 'pending');
  assert.equal(stored.target_type, 'production');
  assert.equal(Number(stored.target_id), Number(production.id));
  assert.equal(stored.final_price, 34.5);

  const duplicate = await apiRequest('/api/content-purchases', {
    method: 'POST',
    token: viewerToken,
    body: { target_type: 'production', target_id: production.id },
  });

  assert.equal(duplicate.response.status, 409);
  assert.equal(duplicate.data?.request?.status, 'pending');
  assert.equal(duplicate.data?.request?.target_type, 'production');
  assert.equal(Number(duplicate.data?.request?.target_id), Number(production.id));
});

test('content purchase request blocks unavailable production and episode targets', async () => {
  const viewer = createUser({ character_name: 'Unavailable Purchase Viewer' });
  const viewerToken = createAccessToken(viewer);
  const production = createProduction({
    title: 'Unavailable Purchase Production',
    slug: 'unavailable-purchase-production',
    access_group: 'free',
    purchase_mode: 'production',
    purchase_price: 22,
    is_active: 1,
  });
  db.prepare("UPDATE productions SET available_from = datetime('now', '+5 days') WHERE id = ?")
    .run(production.id);

  const episodeProduction = createProduction({
    title: 'Unavailable Episode Purchase Production',
    slug: 'unavailable-episode-purchase-production',
    access_group: 'free',
    purchase_mode: 'episodes',
    is_active: 1,
  });
  const episode = createEpisode({
    production_id: episodeProduction.id,
    title: 'Future Purchase Episode',
    access_group: 'inherit',
    purchase_enabled: 1,
    purchase_price: 9.99,
    is_active: 1,
  });
  db.prepare("UPDATE episodes SET available_from = datetime('now', '+5 days') WHERE id = ?")
    .run(episode.id);

  const blockedProduction = await apiRequest('/api/content-purchases', {
    method: 'POST',
    token: viewerToken,
    body: { target_type: 'production', target_id: production.id },
  });
  assert.equal(blockedProduction.response.status, 400);
  assert.equal(blockedProduction.data?.error, 'Продукцията в момента не е налична за покупка.');

  const blockedEpisode = await apiRequest('/api/content-purchases', {
    method: 'POST',
    token: viewerToken,
    body: { target_type: 'episode', target_id: episode.id },
  });
  assert.equal(blockedEpisode.response.status, 400);
  assert.equal(blockedEpisode.data?.error, 'Епизодът в момента не е наличен за покупка.');

  const purchaseCount = db.prepare('SELECT COUNT(*) as count FROM content_purchase_requests').get().count;
  assert.equal(purchaseCount, 0);
});

test('production purchase confirm grants production entitlement, cancels covered episode requests and unlocks episode features', async () => {
  const production = createProduction({
    title: 'Feature Unlock Production',
    slug: 'feature-unlock-production',
    required_tier: 2,
    access_group: 'subscription',
    purchase_mode: 'both',
    purchase_price: 59.9,
    is_active: 1,
  });
  const episodeOne = createEpisode({
    production_id: production.id,
    title: 'Episode Purchase 1',
    access_group: 'inherit',
    purchase_enabled: 1,
    purchase_price: 8.5,
    youtube_video_id: 'dQw4w9WgXcQ',
  });
  const episodeTwo = createEpisode({
    production_id: production.id,
    title: 'Episode Purchase 2',
    access_group: 'inherit',
    purchase_enabled: 1,
    purchase_price: 9.5,
    episode_number: 2,
    youtube_video_id: 'dQw4w9WgXcQ',
  });
  const viewer = createUser({ character_name: 'Feature Viewer' });
  const admin = createUser({ role: 'admin', character_name: 'Purchase Admin' });
  const viewerToken = createAccessToken(viewer);
  const adminToken = createAccessToken(admin);

  const productionRequest = await apiRequest('/api/content-purchases', {
    method: 'POST',
    token: viewerToken,
    body: { target_type: 'production', target_id: production.id },
  });
  assert.equal(productionRequest.response.status, 201);

  const episodeRequest = await apiRequest('/api/content-purchases', {
    method: 'POST',
    token: viewerToken,
    body: { target_type: 'episode', target_id: episodeTwo.id },
  });
  assert.equal(episodeRequest.response.status, 201);

  const confirm = await apiRequest(`/api/content-purchases/admin/${productionRequest.data.request_id}/confirm`, {
    method: 'PUT',
    token: adminToken,
  });
  assert.equal(confirm.response.status, 200);
  assert.equal(confirm.data?.success, true);

  const productionEntitlement = db.prepare(`
    SELECT target_type, target_id, source_request_id
    FROM content_entitlements
    WHERE user_id = ?
  `).get(viewer.id);
  assert.equal(productionEntitlement.target_type, 'production');
  assert.equal(Number(productionEntitlement.target_id), Number(production.id));
  assert.equal(Number(productionEntitlement.source_request_id), Number(productionRequest.data.request_id));

  const cancelledEpisodeRequest = db.prepare(`
    SELECT status, cancelled_reason
    FROM content_purchase_requests
    WHERE id = ?
  `).get(episodeRequest.data.request_id);
  assert.equal(cancelledEpisodeRequest.status, 'cancelled');
  assert.match(cancelledEpisodeRequest.cancelled_reason || '', /production|продукц/i);

  const productionPage = await apiRequest(`/api/productions/${production.slug}`, {
    method: 'GET',
    token: viewerToken,
  });
  assert.equal(productionPage.response.status, 200);
  assert.equal(productionPage.data?.has_access, true);
  assert.equal(productionPage.data?.is_purchased, true);

  const unlockedEpisode = await apiRequest(`/api/episodes/${episodeOne.id}`, {
    method: 'GET',
    token: viewerToken,
  });
  assert.equal(unlockedEpisode.response.status, 200);
  assert.equal(unlockedEpisode.data?.has_access, true);
  assert.equal(unlockedEpisode.data?.purchase_source, 'production');

  const comment = await apiRequest('/api/comments', {
    method: 'POST',
    token: viewerToken,
    body: {
      episode_id: episodeOne.id,
      content: 'Unlocked through production purchase',
    },
  });
  assert.equal(comment.response.status, 201);

  const reaction = await apiRequest(`/api/episodes/${episodeOne.id}/react`, {
    method: 'POST',
    token: viewerToken,
    body: { reaction_type: 'like' },
  });
  assert.equal(reaction.response.status, 200);
  assert.equal(reaction.data?.user_reaction, 'like');

  const watchHistory = await apiRequest(`/api/watch-history/${episodeOne.id}`, {
    method: 'PUT',
    token: viewerToken,
    body: { progress_seconds: 245 },
  });
  assert.equal(watchHistory.response.status, 200);
  assert.equal(watchHistory.data?.success, true);

  const audit = db.prepare(`
    SELECT action, entity_type, entity_id, admin_user_id
    FROM admin_audit_logs
    WHERE action = 'content_purchase.confirm'
    ORDER BY id DESC
    LIMIT 1
  `).get();
  assert.ok(audit);
  assert.equal(audit.entity_type, 'content_purchase_request');
  assert.equal(Number(audit.entity_id), Number(productionRequest.data.request_id));
  assert.equal(audit.admin_user_id, admin.id);
});

test('episode purchase confirm unlocks only the bought episode and keeps the production locked', async () => {
  const production = createProduction({
    title: 'Episode Unlock Production',
    slug: 'episode-unlock-production',
    required_tier: 2,
    access_group: 'subscription',
    purchase_mode: 'both',
    purchase_price: 49.9,
    is_active: 1,
  });
  const episodeOne = createEpisode({
    production_id: production.id,
    title: 'Single Episode Unlock',
    access_group: 'inherit',
    purchase_enabled: 1,
    purchase_price: 4.5,
    youtube_video_id: 'dQw4w9WgXcQ',
  });
  const episodeTwo = createEpisode({
    production_id: production.id,
    title: 'Still Locked Episode',
    access_group: 'inherit',
    purchase_enabled: 1,
    purchase_price: 5.5,
    episode_number: 2,
    youtube_video_id: 'dQw4w9WgXcQ',
  });
  const viewer = createUser({ character_name: 'Episode Buyer' });
  const admin = createUser({ role: 'admin', character_name: 'Episode Admin' });
  const viewerToken = createAccessToken(viewer);
  const adminToken = createAccessToken(admin);

  const request = await apiRequest('/api/content-purchases', {
    method: 'POST',
    token: viewerToken,
    body: { target_type: 'episode', target_id: episodeOne.id },
  });
  assert.equal(request.response.status, 201);

  const confirm = await apiRequest(`/api/content-purchases/admin/${request.data.request_id}/confirm`, {
    method: 'PUT',
    token: adminToken,
  });
  assert.equal(confirm.response.status, 200);

  const unlockedEpisode = await apiRequest(`/api/episodes/${episodeOne.id}`, {
    method: 'GET',
    token: viewerToken,
  });
  assert.equal(unlockedEpisode.response.status, 200);
  assert.equal(unlockedEpisode.data?.has_access, true);
  assert.equal(unlockedEpisode.data?.is_purchased_episode, true);
  assert.equal(unlockedEpisode.data?.purchase_source, 'episode');

  const stillLockedEpisode = await apiRequest(`/api/episodes/${episodeTwo.id}`, {
    method: 'GET',
    token: viewerToken,
  });
  assert.equal(stillLockedEpisode.response.status, 200);
  assert.equal(stillLockedEpisode.data?.has_access, false);

  const productionPage = await apiRequest(`/api/productions/${production.slug}`, {
    method: 'GET',
    token: viewerToken,
  });
  assert.equal(productionPage.response.status, 200);
  assert.equal(productionPage.data?.has_access, false);
  const listedEpisodeOne = productionPage.data?.episodes?.find((item) => Number(item.id) === Number(episodeOne.id));
  const listedEpisodeTwo = productionPage.data?.episodes?.find((item) => Number(item.id) === Number(episodeTwo.id));
  assert.equal(listedEpisodeOne?.has_access, true);
  assert.equal(listedEpisodeTwo?.has_access, false);

  const repeatRequest = await apiRequest('/api/content-purchases', {
    method: 'POST',
    token: viewerToken,
    body: { target_type: 'episode', target_id: episodeOne.id },
  });
  assert.equal(repeatRequest.response.status, 409);
  assert.match(repeatRequest.data?.error || '', /купен|purchase/i);
});

test('auth refresh ротира токена и блокира повторна употреба на стария', async () => {
  const user = createUser();
  const refreshToken = createRefreshToken(user);
  const cookieHeader = { Cookie: `refresh_token=${encodeURIComponent(refreshToken)}` };

  const first = await apiRequest('/api/auth/refresh', {
    method: 'POST',
    headers: cookieHeader,
  });

  assert.equal(first.response.status, 200);
  assert.equal(typeof first.data?.access_token, 'string');
  assert.ok(first.data.access_token.length > 20);

  const setCookie = first.response.headers.get('set-cookie') || '';
  assert.match(setCookie, /refresh_token=/);

  const oldTokenHash = createHash('sha256').update(refreshToken).digest('hex');
  const storedRows = db.prepare('SELECT token FROM refresh_tokens WHERE user_id = ?').all(user.id);
  assert.equal(storedRows.length, 1);
  assert.notEqual(storedRows[0].token, oldTokenHash);

  const reused = await apiRequest('/api/auth/refresh', {
    method: 'POST',
    headers: cookieHeader,
  });

  assert.equal(reused.response.status, 401);
  const leftTokens = db.prepare('SELECT COUNT(*) as count FROM refresh_tokens WHERE user_id = ?').get(user.id).count;
  assert.equal(leftTokens, 1);
});

test('стар refresh token не инвалидира новата сесия при паралелен race', async () => {
  const user = createUser();
  const originalToken = createRefreshToken(user);
  const originalCookie = { Cookie: `refresh_token=${encodeURIComponent(originalToken)}` };

  const firstRefresh = await apiRequest('/api/auth/refresh', {
    method: 'POST',
    headers: originalCookie,
  });
  assert.equal(firstRefresh.response.status, 200);

  const rotatedToken = extractCookieValue(firstRefresh.response.headers.get('set-cookie'), 'refresh_token');
  assert.ok(rotatedToken);

  const staleRefresh = await apiRequest('/api/auth/refresh', {
    method: 'POST',
    headers: originalCookie,
  });
  assert.equal(staleRefresh.response.status, 401);

  const activeRefresh = await apiRequest('/api/auth/refresh', {
    method: 'POST',
    headers: { Cookie: `refresh_token=${encodeURIComponent(rotatedToken)}` },
  });
  assert.equal(activeRefresh.response.status, 200);
  assert.equal(typeof activeRefresh.data?.access_token, 'string');
});

test('logout работи и при изтекъл access token ако refresh cookie-то е налично', async () => {
  const user = createUser();
  const refreshToken = createRefreshToken(user);
  const expiredAccessToken = jwt.sign(
    { id: user.id, discord_id: user.discord_id, role: user.role },
    JWT_SECRET,
    { expiresIn: -10 }
  );

  const logout = await apiRequest('/api/auth/logout', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${expiredAccessToken}`,
      Cookie: `refresh_token=${encodeURIComponent(refreshToken)}`,
    },
  });
  assert.equal(logout.response.status, 200);
  assert.match(logout.response.headers.get('set-cookie') || '', /refresh_token=/);

  const remaining = db.prepare('SELECT COUNT(*) as count FROM refresh_tokens WHERE user_id = ?').get(user.id).count;
  assert.equal(remaining, 0);
});

test('banned user не може да exchange-не auth code', async () => {
  const bannedUser = createUser({ role: 'banned', character_name: 'Banned Exchange' });
  const code = randomBytes(24).toString('hex');
  db.prepare(`
    INSERT INTO auth_exchange_codes (user_id, code, expires_at)
    VALUES (?, ?, ?)
  `).run(bannedUser.id, code, new Date(Date.now() + 5 * 60 * 1000).toISOString());

  const exchanged = await apiRequest('/api/auth/exchange', {
    method: 'POST',
    body: { code },
  });
  assert.equal(exchanged.response.status, 403);
  assert.match(exchanged.data?.error || '', /ограничен/);

  const tokenCount = db.prepare('SELECT COUNT(*) as count FROM refresh_tokens WHERE user_id = ?').get(bannedUser.id).count;
  assert.equal(tokenCount, 0);
});

test('banned user не може да refresh-не съществуваща сесия', async () => {
  const bannedUser = createUser({ role: 'banned', character_name: 'Banned Refresh' });
  const refreshToken = createRefreshToken(bannedUser);

  const refreshed = await apiRequest('/api/auth/refresh', {
    method: 'POST',
    headers: { Cookie: `refresh_token=${encodeURIComponent(refreshToken)}` },
  });
  assert.equal(refreshed.response.status, 403);
  assert.match(refreshed.data?.error || '', /ограничен/);

  const tokenCount = db.prepare('SELECT COUNT(*) as count FROM refresh_tokens WHERE user_id = ?').get(bannedUser.id).count;
  assert.equal(tokenCount, 0);
});

test('admin confirm на плащане активира абонамент и записва audit лог', async () => {
  const plan = createPlan({ name: 'Gold', tier_level: 2, price: 149 });
  const customer = createUser({ character_name: 'Клиент Тест' });
  const admin = createUser({ role: 'admin', character_name: 'Админ Тест' });
  const adminToken = createAccessToken(admin);

  const payment = db.prepare(`
    INSERT INTO payment_references (
      user_id, plan_id, reference_code, original_price, discount_percent, final_price, status
    )
    VALUES (?, ?, ?, ?, ?, ?, 'pending')
  `).run(
    customer.id,
    plan.id,
    `SUB-GLD-${randomBytes(3).toString('hex').toUpperCase()}`,
    149,
    0,
    149
  );

  const { response, data } = await apiRequest(`/api/admin/payments/${payment.lastInsertRowid}/confirm`, {
    method: 'PUT',
    token: adminToken,
  });

  assert.equal(response.status, 200);
  assert.equal(data?.success, true);

  const updatedPayment = db.prepare('SELECT * FROM payment_references WHERE id = ?').get(payment.lastInsertRowid);
  assert.equal(updatedPayment.status, 'confirmed');
  assert.equal(updatedPayment.confirmed_by, admin.id);

  const updatedUser = db.prepare('SELECT subscription_plan_id FROM users WHERE id = ?').get(customer.id);
  assert.equal(updatedUser.subscription_plan_id, plan.id);

  const audit = db.prepare(`
    SELECT action, entity_type, entity_id, admin_user_id
    FROM admin_audit_logs
    WHERE action = 'payment.confirm'
    ORDER BY id DESC
    LIMIT 1
  `).get();
  assert.ok(audit);
  assert.equal(audit.entity_type, 'payment_reference');
  assert.equal(Number(audit.entity_id), Number(payment.lastInsertRowid));
  assert.equal(audit.admin_user_id, admin.id);
});

test('admin reject на плащане променя статус и записва причина', async () => {
  const plan = createPlan({ name: 'Silver', tier_level: 1, price: 59 });
  const customer = createUser({ character_name: 'Потребител Reject' });
  const admin = createUser({ role: 'admin', character_name: 'Админ Reject' });
  const adminToken = createAccessToken(admin);

  const payment = db.prepare(`
    INSERT INTO payment_references (
      user_id, plan_id, reference_code, original_price, discount_percent, final_price, status
    )
    VALUES (?, ?, ?, ?, ?, ?, 'pending')
  `).run(
    customer.id,
    plan.id,
    `SUB-SLV-${randomBytes(3).toString('hex').toUpperCase()}`,
    59,
    5,
    56.05
  );

  const { response, data } = await apiRequest(`/api/admin/payments/${payment.lastInsertRowid}/reject`, {
    method: 'PUT',
    token: adminToken,
    body: { reason: 'Невалидно основание' },
  });

  assert.equal(response.status, 200);
  assert.equal(data?.success, true);

  const updatedPayment = db.prepare('SELECT status, rejection_reason, rejected_by FROM payment_references WHERE id = ?')
    .get(payment.lastInsertRowid);
  assert.equal(updatedPayment.status, 'rejected');
  assert.equal(updatedPayment.rejection_reason, 'Невалидно основание');
  assert.equal(updatedPayment.rejected_by, admin.id);

  const audit = db.prepare(`
    SELECT action, entity_id
    FROM admin_audit_logs
    WHERE action = 'payment.reject'
    ORDER BY id DESC
    LIMIT 1
  `).get();
  assert.ok(audit);
  assert.equal(Number(audit.entity_id), Number(payment.lastInsertRowid));
});

test('access gate блокира без абонамент и допуска при достатъчно ниво', async () => {
  const premiumPlan = createPlan({ name: 'Premium', tier_level: 2, price: 199 });
  const production = createProduction({
    title: 'Премиум формат',
    slug: 'premium-format',
    required_tier: 2,
    access_group: 'subscription',
    is_active: 1,
  });
  const episode = createEpisode({
    production_id: production.id,
    title: 'Епизод 1',
    access_group: 'inherit',
    youtube_video_id: 'dQw4w9WgXcQ',
  });
  const viewer = createUser({ character_name: 'Гост Потребител' });
  const viewerToken = createAccessToken(viewer);

  const denied = await apiRequest(`/api/episodes/${episode.id}`, {
    method: 'GET',
    token: viewerToken,
  });
  assert.equal(denied.response.status, 200);
  assert.equal(denied.data?.has_access, false);
  assert.equal(denied.data?.video_embed_url, null);
  assert.equal(denied.data?.youtube_video_id, undefined);

  db.prepare(`
    UPDATE users
    SET subscription_plan_id = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(premiumPlan.id, viewer.id);

  const allowed = await apiRequest(`/api/episodes/${episode.id}`, {
    method: 'GET',
    token: viewerToken,
  });
  assert.equal(allowed.response.status, 200);
  assert.equal(allowed.data?.has_access, true);
  assert.equal(typeof allowed.data?.video_embed_url, 'string');
  assert.equal(allowed.data?.youtube_video_id, 'dQw4w9WgXcQ');
});

test('watch-history update блокира заключен епизод и допуска при активен план', async () => {
  const premiumPlan = createPlan({ name: 'Premium Plus', tier_level: 2, price: 249 });
  const production = createProduction({
    title: 'Истински истории',
    slug: 'real-stories',
    required_tier: 2,
    access_group: 'subscription',
    is_active: 1,
  });
  const episode = createEpisode({
    production_id: production.id,
    title: 'Епизод 7',
    access_group: 'inherit',
    youtube_video_id: 'dQw4w9WgXcQ',
  });
  const viewer = createUser({ character_name: 'Viewer WH' });
  const viewerToken = createAccessToken(viewer);

  const denied = await apiRequest(`/api/watch-history/${episode.id}`, {
    method: 'PUT',
    token: viewerToken,
    body: { progress_seconds: 120 },
  });
  assert.equal(denied.response.status, 403);

  db.prepare(`
    UPDATE users
    SET subscription_plan_id = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(premiumPlan.id, viewer.id);

  const allowed = await apiRequest(`/api/watch-history/${episode.id}`, {
    method: 'PUT',
    token: viewerToken,
    body: { progress_seconds: 180 },
  });
  assert.equal(allowed.response.status, 200);
  assert.equal(allowed.data?.success, true);
});

test('watch-history list keeps individually purchased locked episodes visible', async () => {
  const production = createProduction({
    title: 'Purchased History Production',
    slug: 'purchased-history-production',
    required_tier: 2,
    access_group: 'subscription',
    purchase_mode: 'episodes',
    is_active: 1,
  });
  const episode = createEpisode({
    production_id: production.id,
    title: 'Purchased History Episode',
    access_group: 'inherit',
    purchase_enabled: 1,
    purchase_price: 11,
    is_active: 1,
  });
  const viewer = createUser({ character_name: 'Purchased History Viewer' });
  const viewerToken = createAccessToken(viewer);

  db.prepare(`
    INSERT INTO content_entitlements (user_id, target_type, target_id)
    VALUES (?, 'episode', ?)
  `).run(viewer.id, episode.id);
  db.prepare(`
    INSERT INTO watch_history (user_id, episode_id, progress_seconds, last_watched_at)
    VALUES (?, ?, ?, datetime('now'))
  `).run(viewer.id, episode.id, 133);

  const res = await apiRequest('/api/watch-history', {
    method: 'GET',
    token: viewerToken,
  });
  assert.equal(res.response.status, 200);
  assert.equal(res.data?.length, 1);
  assert.equal(Number(res.data?.[0]?.episode_id), Number(episode.id));
  assert.equal(Number(res.data?.[0]?.progress_seconds), 133);
});

test('admin plan create валидира цена, ниво и продължителност', async () => {
  const admin = createUser({ role: 'admin', character_name: 'План Админ' });
  const adminToken = createAccessToken(admin);

  const invalidPrice = await apiRequest('/api/plans/admin', {
    method: 'POST',
    token: adminToken,
    body: {
      name: 'VIP',
      price: -10,
      tier_level: 2,
      duration_days: 30,
      features: ['A'],
    },
  });
  assert.equal(invalidPrice.response.status, 400);

  const invalidTier = await apiRequest('/api/plans/admin', {
    method: 'POST',
    token: adminToken,
    body: {
      name: 'VIP',
      price: 19.99,
      tier_level: 0,
      duration_days: 30,
      features: ['A'],
    },
  });
  assert.equal(invalidTier.response.status, 400);

  const invalidDuration = await apiRequest('/api/plans/admin', {
    method: 'POST',
    token: adminToken,
    body: {
      name: 'VIP',
      price: 19.99,
      tier_level: 2,
      duration_days: 0,
      features: ['A'],
    },
  });
  assert.equal(invalidDuration.response.status, 400);

  const valid = await apiRequest('/api/plans/admin', {
    method: 'POST',
    token: adminToken,
    body: {
      name: 'VIP Pro',
      price: 24.5,
      tier_level: 3,
      duration_days: 45,
      features: ['Приоритетен достъп'],
      sort_order: 2,
      is_active: true,
      is_popular: true,
    },
  });

  assert.equal(valid.response.status, 201);
  assert.equal(valid.data?.name, 'VIP Pro');
  assert.equal(valid.data?.price, 24.5);
  assert.equal(valid.data?.tier_level, 3);
  assert.equal(valid.data?.duration_days, 45);
});

test('promo update връща 400 при дублиран код', async () => {
  const admin = createUser({ role: 'admin', character_name: 'Промо Админ' });
  const adminToken = createAccessToken(admin);

  const first = db.prepare(`
    INSERT INTO promo_codes (code, discount_percent, is_active)
    VALUES ('SPRING30', 30, 1)
  `).run();
  const second = db.prepare(`
    INSERT INTO promo_codes (code, discount_percent, is_active)
    VALUES ('SUMMER20', 20, 1)
  `).run();

  const duplicateUpdate = await apiRequest(`/api/admin/promo-codes/${second.lastInsertRowid}`, {
    method: 'PUT',
    token: adminToken,
    body: { code: 'SPRING30' },
  });

  assert.equal(duplicateUpdate.response.status, 400);

  const unchanged = db.prepare('SELECT code FROM promo_codes WHERE id = ?').get(second.lastInsertRowid);
  assert.equal(unchanged.code, 'SUMMER20');
});

test('admin subscription update валидира expires_at', async () => {
  const admin = createUser({ role: 'admin', character_name: 'Users Админ' });
  const target = createUser({ character_name: 'Target User' });
  const adminToken = createAccessToken(admin);

  const invalid = await apiRequest(`/api/admin/users/${target.id}/subscription`, {
    method: 'PUT',
    token: adminToken,
    body: { plan_id: 0, expires_at: 'not-a-date' },
  });

  assert.equal(invalid.response.status, 400);
});

test('confirm payment удължава от текущата бъдеща дата на абонамент', async () => {
  const plan = createPlan({ name: 'Ultra', tier_level: 4, price: 299, duration_days: 30 });
  const currentExpiry = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();
  const customer = createUser({
    character_name: 'Renew User',
    subscription_plan_id: plan.id,
    subscription_expires_at: currentExpiry,
  });
  const admin = createUser({ role: 'admin', character_name: 'Renew Admin' });
  const adminToken = createAccessToken(admin);

  const payment = db.prepare(`
    INSERT INTO payment_references (
      user_id, plan_id, reference_code, original_price, discount_percent, final_price, status
    )
    VALUES (?, ?, ?, ?, ?, ?, 'pending')
  `).run(
    customer.id,
    plan.id,
    `SUB-ULT-${randomBytes(3).toString('hex').toUpperCase()}`,
    299,
    0,
    299
  );

  const confirmed = await apiRequest(`/api/admin/payments/${payment.lastInsertRowid}/confirm`, {
    method: 'PUT',
    token: adminToken,
  });
  assert.equal(confirmed.response.status, 200);

  const updatedUser = db.prepare('SELECT subscription_expires_at FROM users WHERE id = ?').get(customer.id);
  const oldExpiryDate = new Date(currentExpiry);
  const newExpiryDate = parseDbTimestamp(updatedUser.subscription_expires_at);
  assert.ok(newExpiryDate > oldExpiryDate);

  const dayDiff = (newExpiryDate.getTime() - oldExpiryDate.getTime()) / (24 * 60 * 60 * 1000);
  assert.ok(dayDiff >= 29 && dayDiff <= 31.2);
});

test('payments admin date филтър работи с range сравнение', async () => {
  const plan = createPlan({ name: 'Filter Plan', tier_level: 1, price: 19 });
  const customer = createUser({ character_name: 'Date Filter Customer' });
  const admin = createUser({ role: 'admin', character_name: 'Date Filter Admin' });
  const adminToken = createAccessToken(admin);

  db.prepare(`
    INSERT INTO payment_references (
      user_id, plan_id, reference_code, original_price, discount_percent, final_price, status, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)
  `).run(
    customer.id,
    plan.id,
    `SUB-DT1-${randomBytes(3).toString('hex').toUpperCase()}`,
    19,
    0,
    19,
    '2025-01-01 10:00:00'
  );
  db.prepare(`
    INSERT INTO payment_references (
      user_id, plan_id, reference_code, original_price, discount_percent, final_price, status, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)
  `).run(
    customer.id,
    plan.id,
    `SUB-DT2-${randomBytes(3).toString('hex').toUpperCase()}`,
    19,
    0,
    19,
    '2025-01-03 10:00:00'
  );

  const filtered = await apiRequest('/api/admin/payments?date_from=2025-01-01&date_to=2025-01-02', {
    method: 'GET',
    token: adminToken,
  });
  assert.equal(filtered.response.status, 200);
  assert.equal(filtered.data?.items?.length, 1);

  const invalidDate = await apiRequest('/api/admin/payments?date_from=2025-13-99', {
    method: 'GET',
    token: adminToken,
  });
  assert.equal(invalidDate.response.status, 400);
});

test('profile stats endpoint е достъпен за потребителя и връща очаквания payload', async () => {
  const user = createUser({ character_name: 'Stats User' });
  const token = createAccessToken(user);
  const production = createProduction({
    title: 'Stats Production',
    slug: 'stats-production',
    access_group: 'free',
    is_active: 1,
  });
  const episode = createEpisode({
    production_id: production.id,
    title: 'Stats Episode',
    access_group: 'free',
    is_active: 1,
  });

  db.prepare('UPDATE episodes SET duration_seconds = ? WHERE id = ?').run(1800, episode.id);
  db.prepare(`
    INSERT INTO watch_history (user_id, episode_id, progress_seconds, last_watched_at)
    VALUES (?, ?, ?, datetime('now'))
  `).run(user.id, episode.id, 420);

  const { response, data } = await apiRequest('/api/users/me/stats', {
    method: 'GET',
    token,
  });

  assert.equal(response.status, 200);
  assert.equal(data?.total_watch_seconds, 420);
  assert.equal(data?.episodes_started, 1);
  assert.equal(data?.recently_watched?.length, 1);
  assert.equal(data?.recently_watched?.[0]?.episode_id, episode.id);
  assert.equal(data?.recently_watched?.[0]?.episode_title, 'Stats Episode');
  assert.equal(data?.recently_watched?.[0]?.duration_seconds, 1800);
});

test('watchlist items endpoint връща готов production payload за профила', async () => {
  const user = createUser({ tier_level: 1, character_name: 'Watchlist User' });
  const token = createAccessToken(user);
  const production = createProduction({
    title: 'Watchlist Production',
    slug: 'watchlist-production',
    access_group: 'free',
    required_tier: 0,
    is_active: 1,
  });

  db.prepare(`
    INSERT INTO watchlist (user_id, production_id, created_at)
    VALUES (?, ?, datetime('now'))
  `).run(user.id, production.id);

  const { response, data } = await apiRequest('/api/watchlist/items', {
    method: 'GET',
    token,
  });

  assert.equal(response.status, 200);
  assert.equal(Array.isArray(data), true);
  assert.equal(data.length, 1);
  assert.equal(data[0]?.id, production.id);
  assert.equal(data[0]?.title, 'Watchlist Production');
  assert.equal(data[0]?.slug, 'watchlist-production');
  assert.equal(data[0]?.access_group, 'free');
  assert.equal(data[0]?.has_access, true);
});

test('non-admin users prefix не expose-ва admin user routes', async () => {
  const admin = createUser({ role: 'admin', character_name: 'Scoped Admin' });
  const target = createUser({ character_name: 'Scoped Target' });

  const result = await apiRequest(`/api/users/${target.id}/subscription`, {
    method: 'PUT',
    token: createAccessToken(admin),
    body: { plan_id: null },
  });

  assert.equal(result.response.status, 404);
});

test('comments routes изискват достъп до епизода', async () => {
  const premiumPlan = createPlan({ name: 'Comments Premium', tier_level: 2, price: 50 });
  const production = createProduction({
    title: 'Locked Comments',
    slug: 'locked-comments',
    required_tier: 2,
    access_group: 'subscription',
    is_active: 1,
  });
  const episode = createEpisode({
    production_id: production.id,
    title: 'Locked Episode',
    access_group: 'inherit',
    is_active: 1,
  });
  const freeUser = createUser({ character_name: 'Free User' });
  const paidUser = createUser({
    character_name: 'Paid User',
    subscription_plan_id: premiumPlan.id,
  });

  const deniedGet = await apiRequest(`/api/comments/episode/${episode.id}`, {
    method: 'GET',
    token: createAccessToken(freeUser),
  });
  assert.equal(deniedGet.response.status, 403);

  const deniedPost = await apiRequest('/api/comments', {
    method: 'POST',
    token: createAccessToken(freeUser),
    body: { episode_id: episode.id, content: 'Нямам достъп' },
  });
  assert.equal(deniedPost.response.status, 403);

  const allowedPost = await apiRequest('/api/comments', {
    method: 'POST',
    token: createAccessToken(paidUser),
    body: { episode_id: episode.id, content: 'Имам достъп' },
  });
  assert.equal(allowedPost.response.status, 201);

  const allowedGet = await apiRequest(`/api/comments/episode/${episode.id}`, {
    method: 'GET',
    token: createAccessToken(paidUser),
  });
  assert.equal(allowedGet.response.status, 200);
  assert.equal(allowedGet.data?.length, 1);
  assert.equal(allowedGet.data?.[0]?.content, 'Имам достъп');
});

test('secondary episode guards respect episode availability windows', async () => {
  const viewer = createUser({ character_name: 'Availability Guard Viewer' });
  const viewerToken = createAccessToken(viewer);
  const production = createProduction({
    title: 'Availability Guard Production',
    slug: 'availability-guard-production',
    access_group: 'free',
    is_active: 1,
  });
  const episode = createEpisode({
    production_id: production.id,
    title: 'Availability Guard Episode',
    access_group: 'free',
    is_active: 1,
  });
  db.prepare("UPDATE episodes SET available_from = datetime('now', '+3 days') WHERE id = ?")
    .run(episode.id);

  const commentsRes = await apiRequest(`/api/comments/episode/${episode.id}`, {
    method: 'GET',
    token: viewerToken,
  });
  assert.equal(commentsRes.response.status, 403);

  const reactionRes = await apiRequest(`/api/episodes/${episode.id}/react`, {
    method: 'POST',
    token: viewerToken,
    body: { reaction_type: 'like' },
  });
  assert.equal(reactionRes.response.status, 403);

  const historyRes = await apiRequest(`/api/watch-history/${episode.id}`, {
    method: 'PUT',
    token: viewerToken,
    body: { progress_seconds: 45 },
  });
  assert.equal(historyRes.response.status, 403);
});

test('admin settings приема и публикува новите community keys', async () => {
  const admin = createUser({ role: 'admin', character_name: 'Settings Admin' });
  const token = createAccessToken(admin);

  const putResult = await apiRequest('/api/settings', {
    method: 'PUT',
    token,
      body: {
        nav_label_calendar: 'Програма',
        comments_title: 'Коментари',
        notifications_title: 'Алерти',
        faq_title: 'Помощ',
        calendar_title: 'График',
        profile_stat_recent: 'Последно гледано',
        home_hero_accent_label: 'Премиера',
        home_hero_production_ids: '[3,5,8]',
      },
  });

  assert.equal(putResult.response.status, 200);
  assert.deepEqual(putResult.data?.rejected_keys, []);

  const publicResult = await apiRequest('/api/settings/public', { method: 'GET' });
  assert.equal(publicResult.response.status, 200);
  assert.equal(publicResult.data?.nav_label_calendar, 'Програма');
  assert.equal(publicResult.data?.comments_title, 'Коментари');
    assert.equal(publicResult.data?.notifications_title, 'Алерти');
    assert.equal(publicResult.data?.faq_title, 'Помощ');
    assert.equal(publicResult.data?.calendar_title, 'График');
    assert.equal(publicResult.data?.profile_stat_recent, 'Последно гледано');
    assert.equal(publicResult.data?.home_hero_accent_label, 'Премиера');
    assert.equal(publicResult.data?.home_hero_production_ids, '[3,5,8]');
  });

test('faq_items settings round-trip запазва дълъг JSON без отрязване', async () => {
  const admin = createUser({ role: 'admin', character_name: 'FAQ Admin' });
  const token = createAccessToken(admin);
  const faqItems = JSON.stringify([
    {
      category: 'Плащания',
      items: [
        {
          q: 'Какво правя при проблем?',
          a: `Отговор ${'А'.repeat(900)}`,
        },
      ],
    },
  ]);

  const putResult = await apiRequest('/api/settings', {
    method: 'PUT',
    token,
    body: { faq_items: faqItems },
  });

  assert.equal(putResult.response.status, 200);
  assert.deepEqual(putResult.data?.rejected_keys, []);

  const publicResult = await apiRequest('/api/settings/public', { method: 'GET' });
  assert.equal(publicResult.response.status, 200);
  assert.equal(publicResult.data?.faq_items, faqItems);
});

test('episode delete премахва коментарите преди изтриването', async () => {
  const admin = createUser({ role: 'admin', character_name: 'Delete Admin' });
  const commenter = createUser({ character_name: 'Comment User' });
  const production = createProduction({
    title: 'Delete Comments Prod',
    slug: 'delete-comments-prod',
    access_group: 'free',
    is_active: 1,
  });
  const episode = createEpisode({
    production_id: production.id,
    title: 'Delete Me',
    access_group: 'free',
    is_active: 1,
  });

  db.prepare(`
    INSERT INTO comments (episode_id, user_id, content)
    VALUES (?, ?, ?)
  `).run(episode.id, commenter.id, 'Коментар за триене');

  const { response, data } = await apiRequest(`/api/episodes/admin/${episode.id}`, {
    method: 'DELETE',
    token: createAccessToken(admin),
  });

  assert.equal(response.status, 200);
  assert.equal(data?.success, true);

  const commentCount = db.prepare('SELECT COUNT(*) as count FROM comments WHERE episode_id = ?').get(episode.id).count;
  const episodeRow = db.prepare('SELECT id FROM episodes WHERE id = ?').get(episode.id);
  assert.equal(commentCount, 0);
  assert.equal(episodeRow, undefined);
});

test('comment delete е soft delete и скрива коментара от публичния поток', async () => {
  const user = createUser({ character_name: 'Soft Delete User' });
  const token = createAccessToken(user);
  const production = createProduction({
    title: 'Soft Delete Production',
    slug: 'soft-delete-production',
    access_group: 'free',
    is_active: 1,
  });
  const episode = createEpisode({
    production_id: production.id,
    title: 'Soft Delete Episode',
    access_group: 'free',
    is_active: 1,
  });

  const created = await apiRequest('/api/comments', {
    method: 'POST',
    token,
    body: { episode_id: episode.id, content: 'Коментар за soft delete' },
  });
  assert.equal(created.response.status, 201);

  const removed = await apiRequest(`/api/comments/${created.data.id}`, {
    method: 'DELETE',
    token,
  });
  assert.equal(removed.response.status, 200);
  assert.equal(removed.data?.success, true);

  const stored = db.prepare('SELECT status, deleted_by, deleted_at FROM comments WHERE id = ?').get(created.data.id);
  assert.equal(stored.status, 'deleted');
  assert.equal(stored.deleted_by, user.id);
  assert.ok(stored.deleted_at);

  const visible = await apiRequest(`/api/comments/episode/${episode.id}`, {
    method: 'GET',
    token,
  });
  assert.equal(visible.response.status, 200);
  assert.equal(visible.data?.length, 0);
});

test('admin hard delete премахва коментара окончателно и записва audit лог', async () => {
  const admin = createUser({ role: 'admin', character_name: 'Hard Delete Admin' });
  const commenter = createUser({ character_name: 'Hard Delete User' });
  const production = createProduction({
    title: 'Hard Delete Production',
    slug: 'hard-delete-production',
    access_group: 'free',
    is_active: 1,
  });
  const episode = createEpisode({
    production_id: production.id,
    title: 'Hard Delete Episode',
    access_group: 'free',
    is_active: 1,
  });

  const created = await apiRequest('/api/comments', {
    method: 'POST',
    token: createAccessToken(commenter),
    body: { episode_id: episode.id, content: 'Коментар за hard delete' },
  });
  assert.equal(created.response.status, 201);

  const removed = await apiRequest(`/api/comments/admin/${created.data.id}/hard`, {
    method: 'DELETE',
    token: createAccessToken(admin),
  });
  assert.equal(removed.response.status, 200);
  assert.equal(removed.data?.success, true);

  const stored = db.prepare('SELECT id FROM comments WHERE id = ?').get(created.data.id);
  assert.equal(stored, undefined);

  const audit = db.prepare(`
    SELECT action, entity_id
    FROM admin_audit_logs
    WHERE action = 'comment.hard_delete'
    ORDER BY id DESC
    LIMIT 1
  `).get();
  assert.ok(audit);
  assert.equal(Number(audit.entity_id), Number(created.data.id));
});

test('admin comments filtering и moderation статусите работят', async () => {
  const admin = createUser({ role: 'admin', character_name: 'Comments Admin' });
  const commenter = createUser({ character_name: 'Moderated User' });
  const adminToken = createAccessToken(admin);
  const userToken = createAccessToken(commenter);
  const production = createProduction({
    title: 'Admin Comments Production',
    slug: 'admin-comments-production',
    access_group: 'free',
    is_active: 1,
  });
  const episode = createEpisode({
    production_id: production.id,
    title: 'Admin Comments Episode',
    access_group: 'free',
    is_active: 1,
  });

  const created = await apiRequest('/api/comments', {
    method: 'POST',
    token: userToken,
    body: { episode_id: episode.id, content: 'Нежелан коментар' },
  });
  assert.equal(created.response.status, 201);

  const hidden = await apiRequest(`/api/comments/admin/${created.data.id}/status`, {
    method: 'PUT',
    token: adminToken,
    body: { status: 'hidden' },
  });
  assert.equal(hidden.response.status, 200);
  assert.equal(hidden.data?.status, 'hidden');

  const hiddenList = await apiRequest('/api/comments/admin?status=hidden&q=Нежелан', {
    method: 'GET',
    token: adminToken,
  });
  assert.equal(hiddenList.response.status, 200);
  assert.equal(hiddenList.data?.items?.length, 1);
  assert.equal(hiddenList.data?.items?.[0]?.status, 'hidden');

  const publicList = await apiRequest(`/api/comments/episode/${episode.id}`, {
    method: 'GET',
    token: userToken,
  });
  assert.equal(publicList.response.status, 200);
  assert.equal(publicList.data?.length, 0);

  const restored = await apiRequest(`/api/comments/admin/${created.data.id}/status`, {
    method: 'PUT',
    token: adminToken,
    body: { status: 'published' },
  });
  assert.equal(restored.response.status, 200);
  assert.equal(restored.data?.status, 'published');

  const publicAfterRestore = await apiRequest(`/api/comments/episode/${episode.id}`, {
    method: 'GET',
    token: userToken,
  });
  assert.equal(publicAfterRestore.response.status, 200);
  assert.equal(publicAfterRestore.data?.length, 1);
});

test('episode notifications не се създават преждевременно за future published_at', async () => {
  const admin = createUser({ role: 'admin', character_name: 'Episode Admin' });
  const viewer = createUser({ character_name: 'Episode Viewer' });
  const banned = createUser({ role: 'banned', character_name: 'Banned Viewer' });
  const adminToken = createAccessToken(admin);
  const production = createProduction({
    title: 'Scheduled Production',
    slug: 'scheduled-production',
    access_group: 'free',
    is_active: 1,
  });

  // Add users to watchlist so they receive new-episode notifications
  db.prepare('INSERT INTO watchlist (user_id, production_id) VALUES (?, ?)').run(admin.id, production.id);
  db.prepare('INSERT INTO watchlist (user_id, production_id) VALUES (?, ?)').run(viewer.id, production.id);
  db.prepare('INSERT INTO watchlist (user_id, production_id) VALUES (?, ?)').run(banned.id, production.id);

  const futureResult = await apiRequest('/api/episodes/admin', {
    method: 'POST',
    token: adminToken,
    body: {
      production_id: production.id,
      title: 'Scheduled Episode',
      youtube_video_id: 'dQw4w9WgXcQ',
      access_group: 'free',
      episode_number: 1,
      is_active: true,
      published_at: '2099-01-01T12:00:00Z',
    },
  });
  assert.equal(futureResult.response.status, 201);
  assert.equal(db.prepare('SELECT COUNT(*) as count FROM notifications').get().count, 0);

  const liveResult = await apiRequest('/api/episodes/admin', {
    method: 'POST',
    token: adminToken,
    body: {
      production_id: production.id,
      title: 'Live Episode',
      youtube_video_id: 'dQw4w9WgXcQ',
      access_group: 'free',
      episode_number: 2,
      is_active: true,
    },
  });
  assert.equal(liveResult.response.status, 201);

  const notifications = db.prepare(`
    SELECT user_id, title
    FROM notifications
    ORDER BY id ASC
  `).all();
  // Notifications go to watchlist users minus the creator (admin).
  // Banned users are not filtered by the notification system.
  assert.equal(notifications.length, 2);
  assert.deepEqual(
    notifications.map((item) => item.user_id).sort((a, b) => a - b),
    [viewer.id, banned.id].sort((a, b) => a - b)
  );
  assert.ok(notifications.every((item) => item.title === 'Нов епизод: Live Episode'));
  assert.equal(
    db.prepare('SELECT COUNT(*) as count FROM notifications WHERE user_id = ?').get(admin.id).count,
    0,
    'admin (the episode creator) should not receive a notification'
  );
});

test('admin може да променя active статуса на епизод', async () => {
  const admin = createUser({ role: 'admin', character_name: 'Episode Status Admin' });
  const adminToken = createAccessToken(admin);
  const production = createProduction({
    title: 'Episode Status Production',
    slug: 'episode-status-production',
    access_group: 'free',
    is_active: 1,
  });
  const episode = createEpisode({
    production_id: production.id,
    title: 'Episode Status Episode',
    access_group: 'free',
    is_active: 1,
  });

  const hidden = await apiRequest(`/api/episodes/admin/${episode.id}/status`, {
    method: 'PUT',
    token: adminToken,
    body: { is_active: false },
  });
  assert.equal(hidden.response.status, 200);
  assert.equal(hidden.data?.is_active, 0);
  assert.equal(db.prepare('SELECT is_active FROM episodes WHERE id = ?').get(episode.id).is_active, 0);

  const restored = await apiRequest(`/api/episodes/admin/${episode.id}/status`, {
    method: 'PUT',
    token: adminToken,
    body: { is_active: true },
  });
  assert.equal(restored.response.status, 200);
  assert.equal(restored.data?.is_active, 1);
  assert.equal(db.prepare('SELECT is_active FROM episodes WHERE id = ?').get(episode.id).is_active, 1);

  const audit = db.prepare(`
    SELECT action, entity_type, entity_id
    FROM admin_audit_logs
    WHERE action = 'episode.status_update'
    ORDER BY id DESC
    LIMIT 1
  `).get();
  assert.ok(audit);
  assert.equal(audit.action, 'episode.status_update');
  assert.equal(audit.entity_type, 'episode');
  assert.equal(Number(audit.entity_id), Number(episode.id));
});

test('admin може да променя active статуса на план без schema грешка', async () => {
  const admin = createUser({ role: 'admin', character_name: 'Plan Status Admin' });
  const adminToken = createAccessToken(admin);
  const plan = createPlan({ name: 'Status Plan', is_active: 1 });

  const disabled = await apiRequest(`/api/plans/admin/${plan.id}/status`, {
    method: 'PUT',
    token: adminToken,
    body: { is_active: false },
  });
  assert.equal(disabled.response.status, 200);
  assert.equal(disabled.data?.is_active, 0);

  const stored = db.prepare('SELECT is_active, updated_at FROM subscription_plans WHERE id = ?').get(plan.id);
  assert.equal(stored.is_active, 0);
  assert.equal(typeof stored.updated_at, 'string');
});

test('admin може да променя active статуса на промо код без schema грешка', async () => {
  const admin = createUser({ role: 'admin', character_name: 'Promo Status Admin' });
  const adminToken = createAccessToken(admin);
  const promo = createPromoCode({ code: 'STATUS24', is_active: 1 });

  const disabled = await apiRequest(`/api/admin/promo-codes/${promo.id}/status`, {
    method: 'PUT',
    token: adminToken,
    body: { is_active: false },
  });
  assert.equal(disabled.response.status, 200);
  assert.equal(disabled.data?.is_active, 0);

  const stored = db.prepare('SELECT is_active, updated_at FROM promo_codes WHERE id = ?').get(promo.id);
  assert.equal(stored.is_active, 0);
  assert.equal(typeof stored.updated_at, 'string');
});

test('stale pending promo reservations се освобождават след 24 часа', async () => {
  const user = createUser({ character_name: 'Promo TTL User' });
  const userToken = createAccessToken(user);
  const plan = createPlan({ name: 'Promo TTL Plan', price: 99 });
  const promo = createPromoCode({ code: 'TTL24', discount_percent: 15, max_uses: 1 });
  const staleCreatedAt = new Date(Date.now() - 25 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 19)
    .replace('T', ' ');

  const stalePayment = db.prepare(`
    INSERT INTO payment_references (
      user_id, plan_id, reference_code, original_price, discount_percent, final_price,
      promo_code_id, status, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)
  `).run(
    user.id,
    plan.id,
    'SUB-TTL-OLD',
    99,
    15,
    84.15,
    promo.id,
    staleCreatedAt
  );

  const validation = await apiRequest('/api/promo/validate', {
    method: 'POST',
    token: userToken,
    body: { code: promo.code },
  });
  assert.equal(validation.response.status, 200);
  assert.equal(validation.data?.valid, true);
  assert.equal(validation.data?.discount_percent, 15);

  const payment = db.prepare('SELECT status, cancelled_reason FROM payment_references WHERE id = ?')
    .get(stalePayment.lastInsertRowid);
  assert.equal(payment.status, 'cancelled');
  assert.match(payment.cancelled_reason, /24 часа/);
});

test('reactions не допускат достъп до непубликуван епизод', async () => {
  const viewer = createUser({ character_name: 'Reaction Viewer' });
  const viewerToken = createAccessToken(viewer);
  const production = createProduction({
    title: 'Scheduled Reactions Production',
    slug: 'scheduled-reactions-production',
    access_group: 'free',
    is_active: 1,
  });
  const episode = createEpisode({
    production_id: production.id,
    title: 'Scheduled Reaction Episode',
    access_group: 'free',
    is_active: 1,
  });
  db.prepare('UPDATE episodes SET published_at = ? WHERE id = ?').run('2099-01-01 12:00:00', episode.id);

  const reaction = await apiRequest(`/api/episodes/${episode.id}/react`, {
    method: 'POST',
    token: viewerToken,
    body: { reaction_type: 'like' },
  });
  assert.equal(reaction.response.status, 404);

  const count = db.prepare('SELECT COUNT(*) as count FROM reactions WHERE episode_id = ?').get(episode.id).count;
  assert.equal(count, 0);
});

test('media library качва изображение и го регистрира за повторна употреба', async () => {
  const admin = createUser({ role: 'admin', character_name: 'Media Admin' });
  const formData = new FormData();
  formData.append('files', createTinyPngBlob(), 'poster.png');

  const uploaded = await apiFormRequest('/api/admin/media', {
    method: 'POST',
    token: createAccessToken(admin),
    formData,
  });

  assert.equal(uploaded.response.status, 201);
  assert.equal(uploaded.data?.items?.length, 1);
  assert.equal(uploaded.data?.items?.[0]?.original_name, 'poster.png');
  assert.match(uploaded.data?.items?.[0]?.url || '', /^\/uploads\/.+\.webp$/);

  const stored = db.prepare('SELECT source, created_by, mime_type FROM media_assets WHERE id = ?')
    .get(uploaded.data.items[0].id);
  assert.equal(stored.source, 'media.library');
  assert.equal(stored.created_by, admin.id);
  assert.equal(stored.mime_type, 'image/webp');
});

test('episode create приема URL-и от media library вместо нов upload', async () => {
  const admin = createUser({ role: 'admin', character_name: 'Media Episode Admin' });
  const production = createProduction({
    title: 'Media-backed Production',
    slug: 'media-backed-production',
    access_group: 'free',
    is_active: 1,
  });

  const uploadData = new FormData();
  uploadData.append('files', createTinyPngBlob(), 'episode-art.png');
  const uploaded = await apiFormRequest('/api/admin/media', {
    method: 'POST',
    token: createAccessToken(admin),
    formData: uploadData,
  });
  const mediaUrl = uploaded.data?.items?.[0]?.url;
  assert.ok(mediaUrl);

  const formData = new FormData();
  formData.append('production_id', String(production.id));
  formData.append('title', 'Episode From Library');
  formData.append('description', 'Uses library assets');
  formData.append('youtube_video_id', 'dQw4w9WgXcQ');
  formData.append('side_text', 'Side panel');
  formData.append('ad_banner_link', 'https://example.com');
  formData.append('access_group', 'free');
  formData.append('episode_number', '3');
  formData.append('is_active', 'true');
  formData.append('thumbnail_url', mediaUrl);
  formData.append('ad_banner_url', mediaUrl);
  formData.append('side_images_urls', JSON.stringify([mediaUrl]));

  const created = await apiFormRequest('/api/episodes/admin', {
    method: 'POST',
    token: createAccessToken(admin),
    formData,
  });

  assert.equal(created.response.status, 201);
  assert.equal(created.data?.thumbnail_url, mediaUrl);
  assert.equal(created.data?.ad_banner_url, mediaUrl);

  const stored = db.prepare('SELECT thumbnail_url, ad_banner_url, side_images FROM episodes WHERE id = ?')
    .get(created.data.id);
  assert.equal(stored.thumbnail_url, mediaUrl);
  assert.equal(stored.ad_banner_url, mediaUrl);
  assert.equal(stored.side_images, JSON.stringify([mediaUrl]));
});

test('media library може да преименува и изтрие неизползван asset', async () => {
  const admin = createUser({ role: 'admin', character_name: 'Media Rename Admin' });
  const adminToken = createAccessToken(admin);
  const formData = new FormData();
  formData.append('files', createTinyPngBlob(), 'rename-me.png');

  const uploaded = await apiFormRequest('/api/admin/media', {
    method: 'POST',
    token: adminToken,
    formData,
  });
  assert.equal(uploaded.response.status, 201);

  const assetId = uploaded.data?.items?.[0]?.id;
  assert.ok(assetId);

  const renamed = await apiRequest(`/api/admin/media/${assetId}`, {
    method: 'PUT',
    token: adminToken,
    body: { original_name: 'hero-cover.webp' },
  });
  assert.equal(renamed.response.status, 200);
  assert.equal(renamed.data?.original_name, 'hero-cover.webp');
  assert.equal(
    db.prepare('SELECT original_name FROM media_assets WHERE id = ?').get(assetId)?.original_name,
    'hero-cover.webp'
  );

  const deleted = await apiRequest(`/api/admin/media/${assetId}`, {
    method: 'DELETE',
    token: adminToken,
  });
  assert.equal(deleted.response.status, 200);
  assert.equal(deleted.data?.success, true);
  assert.equal(
    db.prepare('SELECT COUNT(*) as count FROM media_assets WHERE id = ?').get(assetId).count,
    0
  );
});

test('media library отказва delete когато asset-ът се използва', async () => {
  const admin = createUser({ role: 'admin', character_name: 'Media Delete Guard Admin' });
  const adminToken = createAccessToken(admin);
  const formData = new FormData();
  formData.append('files', createTinyPngBlob(), 'used-poster.png');

  const uploaded = await apiFormRequest('/api/admin/media', {
    method: 'POST',
    token: adminToken,
    formData,
  });
  assert.equal(uploaded.response.status, 201);

  const assetId = uploaded.data?.items?.[0]?.id;
  const mediaUrl = uploaded.data?.items?.[0]?.url;
  assert.ok(assetId);
  assert.ok(mediaUrl);

  createProduction({
    title: 'Used Media Production',
    slug: 'used-media-production',
    thumbnail_url: mediaUrl,
    access_group: 'free',
    is_active: 1,
  });

  const list = await apiRequest('/api/admin/media?page=1&page_size=24', {
    method: 'GET',
    token: adminToken,
  });
  assert.equal(list.response.status, 200);
  const listedAsset = list.data?.items?.find((item) => Number(item.id) === Number(assetId));
  assert.equal(listedAsset?.usage_count, 1);
  assert.equal(listedAsset?.in_use, true);

  const deleted = await apiRequest(`/api/admin/media/${assetId}`, {
    method: 'DELETE',
    token: adminToken,
  });
  assert.equal(deleted.response.status, 409);
  assert.equal(deleted.data?.usage_count, 1);
  assert.equal(deleted.data?.usages?.[0]?.type, 'production.thumbnail');
  assert.equal(
    db.prepare('SELECT COUNT(*) as count FROM media_assets WHERE id = ?').get(assetId).count,
    1
  );
});

test('support, notifications и audit happy path работят за реален ticket lifecycle', async () => {
  const admin = createUser({ role: 'admin', character_name: 'Support Admin' });
  const user = createUser({ character_name: 'Support User' });
  const adminToken = createAccessToken(admin);
  const userToken = createAccessToken(user);

  const created = await apiRequest('/api/support', {
    method: 'POST',
    token: userToken,
    body: {
      subject: 'Проблем с достъпа',
      message: 'Не виждам премиум епизода',
    },
  });
  assert.equal(created.response.status, 201);
  assert.equal(created.data?.success, true);
  assert.ok(Number(created.data?.ticketId) > 0);

  const ticketId = created.data.ticketId;

  const adminList = await apiRequest('/api/support/admin?status=open', {
    method: 'GET',
    token: adminToken,
  });
  assert.equal(adminList.response.status, 200);
  assert.equal(adminList.data?.length, 1);
  assert.equal(Number(adminList.data?.[0]?.id), Number(ticketId));

  const closed = await apiRequest(`/api/support/admin/${ticketId}/status`, {
    method: 'PUT',
    token: adminToken,
    body: { status: 'closed' },
  });
  assert.equal(closed.response.status, 200);
  assert.equal(closed.data?.success, true);
  assert.equal(
    db.prepare('SELECT status FROM support_tickets WHERE id = ?').get(ticketId)?.status,
    'closed'
  );

  const userReplyText = 'Добавям още детайли по проблема';
  const userReply = await apiRequest(`/api/support/${ticketId}/reply`, {
    method: 'POST',
    token: userToken,
    body: { replyText: userReplyText },
  });
  assert.equal(userReply.response.status, 200);
  assert.equal(userReply.data?.success, true);
  assert.equal(
    db.prepare('SELECT status FROM support_tickets WHERE id = ?').get(ticketId)?.status,
    'open'
  );

  const adminReplyText = 'Проблемът е коригиран, опитай отново';
  const adminReply = await apiRequest(`/api/support/${ticketId}/reply`, {
    method: 'POST',
    token: adminToken,
    body: { replyText: adminReplyText },
  });
  assert.equal(adminReply.response.status, 200);
  assert.equal(adminReply.data?.success, true);
  assert.equal(
    db.prepare('SELECT status FROM support_tickets WHERE id = ?').get(ticketId)?.status,
    'closed'
  );

  const thread = await apiRequest(`/api/support/${ticketId}`, {
    method: 'GET',
    token: userToken,
  });
  assert.equal(thread.response.status, 200);
  assert.equal(thread.data?.ticket?.subject, 'Проблем с достъпа');
  assert.equal(thread.data?.messages?.length, 2);
  assert.equal(thread.data?.messages?.[0]?.message, userReplyText);
  assert.equal(thread.data?.messages?.[1]?.message, adminReplyText);

  const notifications = await apiRequest('/api/notifications', {
    method: 'GET',
    token: userToken,
  });
  assert.equal(notifications.response.status, 200);
  assert.equal(notifications.data?.length, 1);
  assert.match(notifications.data?.[0]?.title || '', /Отговор на Вашето запитване/);
  assert.equal(notifications.data?.[0]?.message, adminReplyText);

  const notificationId = notifications.data[0].id;
  const readOne = await apiRequest(`/api/notifications/${notificationId}/read`, {
    method: 'PUT',
    token: userToken,
  });
  assert.equal(readOne.response.status, 200);
  assert.equal(readOne.data?.success, true);
  assert.equal(
    db.prepare('SELECT is_read FROM notifications WHERE id = ?').get(notificationId)?.is_read,
    1
  );

  db.prepare(`
    INSERT INTO notifications (user_id, title, message, link)
    VALUES (?, ?, ?, ?)
  `).run(user.id, 'Допълнително известие', 'Второ съобщение', '/support');

  const readAll = await apiRequest('/api/notifications/read-all', {
    method: 'PUT',
    token: userToken,
  });
  assert.equal(readAll.response.status, 200);
  assert.equal(readAll.data?.success, true);
  assert.equal(
    db.prepare('SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0').get(user.id).count,
    0
  );

  const audit = await apiRequest('/api/admin/audit?action=support_ticket.reply', {
    method: 'GET',
    token: adminToken,
  });
  assert.equal(audit.response.status, 200);
  assert.equal(audit.data?.items?.length, 1);
  assert.equal(audit.data?.items?.[0]?.entity_type, 'support_ticket');
  assert.equal(audit.data?.items?.[0]?.metadata?.reply, adminReplyText);
});

test('support status update връща 404 за липсващ ticket', async () => {
  const admin = createUser({ role: 'admin', character_name: 'Support Admin' });
  const adminToken = createAccessToken(admin);

  const response = await apiRequest('/api/support/admin/999/status', {
    method: 'PUT',
    token: adminToken,
    body: { status: 'closed' },
  });
  assert.equal(response.response.status, 404);
});

test('dashboard endpoint агрегира потребители, епизоди, гледания и payment statuses', async () => {
  const admin = createUser({ role: 'admin', character_name: 'Dashboard Admin' });
  const adminToken = createAccessToken(admin);
  const plan = createPlan({ name: 'Dashboard Plan', tier_level: 2, price: 99 });
  const subscriber = createUser({
    character_name: 'Dashboard Subscriber',
    subscription_plan_id: plan.id,
    subscription_expires_at: '2099-01-01T00:00:00.000Z',
  });
  createUser({ character_name: 'Dashboard Free User' });

  const production = createProduction({
    title: 'Dashboard Production',
    slug: 'dashboard-production',
    access_group: 'free',
    is_active: 1,
  });
  createEpisode({
    production_id: production.id,
    title: 'Dashboard Episode 1',
    access_group: 'free',
    is_active: 1,
    view_count: 45,
  });
  createEpisode({
    production_id: production.id,
    title: 'Dashboard Episode 2',
    access_group: 'free',
    is_active: 1,
    view_count: 7,
  });

  db.prepare(`
    INSERT INTO payment_references (
      user_id, plan_id, reference_code, original_price, discount_percent, final_price, status
    )
    VALUES
      (?, ?, 'SUB-DASH-PND', 99, 0, 99, 'pending'),
      (?, ?, 'SUB-DASH-CNF', 99, 10, 89.1, 'confirmed'),
      (?, ?, 'SUB-DASH-REJ', 99, 0, 99, 'rejected'),
      (?, ?, 'SUB-DASH-CNL', 99, 0, 99, 'cancelled')
  `).run(subscriber.id, plan.id, subscriber.id, plan.id, subscriber.id, plan.id, subscriber.id, plan.id);

  const result = await apiRequest('/api/admin/dashboard', {
    method: 'GET',
    token: adminToken,
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.data?.total_users, 3);
  assert.equal(result.data?.subscribed_users, 1);
  assert.equal(result.data?.total_productions, 1);
  assert.equal(result.data?.total_episodes, 2);
  assert.equal(result.data?.total_views, 52);
  assert.equal(result.data?.total_payments, 4);
  assert.equal(result.data?.pending_payments, 1);
  assert.equal(result.data?.confirmed_payments, 1);
  assert.equal(result.data?.rejected_payments, 1);
  assert.equal(result.data?.cancelled_payments, 1);
});

test('CSV export не оставя spreadsheet formulas изпълними', async () => {
  const admin = createUser({ role: 'admin', character_name: 'Export Admin' });
  const adminToken = createAccessToken(admin);
  createUser({
    character_name: '=2+5',
    discord_username: 'formula_user',
  });

  const exported = await apiTextRequest('/api/admin/export/users', {
    method: 'GET',
    token: adminToken,
  });
  assert.equal(exported.response.status, 200);
  assert.match(exported.text, /'=2\+5/);
});

test('episode purchase confirm rejects requests for deleted episode targets', async () => {
  const production = createProduction({
    title: 'Deleted Episode Purchase Production',
    slug: 'deleted-episode-purchase-production',
    required_tier: 2,
    access_group: 'subscription',
    purchase_mode: 'episodes',
    is_active: 1,
  });
  const episode = createEpisode({
    production_id: production.id,
    title: 'Deleted Episode Purchase',
    access_group: 'inherit',
    purchase_enabled: 1,
    purchase_price: 6.5,
    youtube_video_id: 'dQw4w9WgXcQ',
  });
  const viewer = createUser({ character_name: 'Deleted Episode Viewer' });
  const admin = createUser({ role: 'admin', character_name: 'Deleted Episode Admin' });
  const viewerToken = createAccessToken(viewer);
  const adminToken = createAccessToken(admin);

  const request = await apiRequest('/api/content-purchases', {
    method: 'POST',
    token: viewerToken,
    body: { target_type: 'episode', target_id: episode.id },
  });
  assert.equal(request.response.status, 201);

  const deleted = await apiRequest(`/api/episodes/admin/${episode.id}`, {
    method: 'DELETE',
    token: adminToken,
  });
  assert.equal(deleted.response.status, 200);
  assert.equal(deleted.data?.success, true);

  const confirm = await apiRequest(`/api/content-purchases/admin/${request.data.request_id}/confirm`, {
    method: 'PUT',
    token: adminToken,
  });
  assert.equal(confirm.response.status, 400);

  const requestAfterConfirm = db.prepare(`
    SELECT status
    FROM content_purchase_requests
    WHERE id = ?
  `).get(request.data.request_id);
  assert.equal(requestAfterConfirm.status, 'pending');

  const entitlementCount = db.prepare(`
    SELECT COUNT(*) as count
    FROM content_entitlements
    WHERE source_request_id = ?
  `).get(request.data.request_id).count;
  assert.equal(entitlementCount, 0);
});

test('deleted episode purchase requests keep snapshot metadata in admin list', async () => {
  const production = createProduction({
    title: 'Snapshot Metadata Production',
    slug: 'snapshot-metadata-production',
    required_tier: 2,
    access_group: 'subscription',
    purchase_mode: 'episodes',
    is_active: 1,
  });
  const episode = createEpisode({
    production_id: production.id,
    title: 'Snapshot Metadata Episode',
    access_group: 'inherit',
    purchase_enabled: 1,
    purchase_price: 7.5,
    episode_number: 3,
    youtube_video_id: 'dQw4w9WgXcQ',
  });
  const viewer = createUser({ character_name: 'Snapshot Viewer' });
  const admin = createUser({ role: 'admin', character_name: 'Snapshot Admin' });
  const viewerToken = createAccessToken(viewer);
  const adminToken = createAccessToken(admin);

  const request = await apiRequest('/api/content-purchases', {
    method: 'POST',
    token: viewerToken,
    body: { target_type: 'episode', target_id: episode.id },
  });
  assert.equal(request.response.status, 201);

  const deleted = await apiRequest(`/api/episodes/admin/${episode.id}`, {
    method: 'DELETE',
    token: adminToken,
  });
  assert.equal(deleted.response.status, 200);

  const adminList = await apiRequest('/api/content-purchases/admin?q=Snapshot%20Metadata%20Episode', {
    method: 'GET',
    token: adminToken,
  });
  assert.equal(adminList.response.status, 200);

  const listedRequest = adminList.data?.items?.find((item) => Number(item.id) === Number(request.data.request_id));
  assert.ok(listedRequest);
  assert.equal(listedRequest.target_title, 'Snapshot Metadata Episode');
  assert.equal(listedRequest.production_title, 'Snapshot Metadata Production');
  assert.equal(listedRequest.production_slug, 'snapshot-metadata-production');
  assert.equal(Number(listedRequest.episode_number), 3);
});

// ═══════════════════════════════════════════════════════════════════════════
// RATINGS
// ═══════════════════════════════════════════════════════════════════════════

test('ratings: create a rating for an episode (1-5 stars)', async () => {
  const production = createProduction({ access_group: 'free' });
  const episode = createEpisode({ production_id: production.id, access_group: 'free' });
  const user = createUser();
  const token = createAccessToken(user);

  const res = await apiRequest('/api/ratings', {
    method: 'POST',
    token,
    body: { target_type: 'episode', target_id: episode.id, score: 4 },
  });
  assert.equal(res.response.status, 200);
  assert.equal(res.data.success, true);
  assert.equal(res.data.score, 4);

  const row = db.prepare(
    'SELECT * FROM ratings WHERE user_id = ? AND target_type = ? AND target_id = ?'
  ).get(user.id, 'episode', episode.id);
  assert.ok(row);
  assert.equal(row.score, 4);
});

test('ratings: get average rating and count', async () => {
  const production = createProduction({ access_group: 'free' });
  const episode = createEpisode({ production_id: production.id, access_group: 'free' });
  const user1 = createUser();
  const user2 = createUser();
  const token1 = createAccessToken(user1);
  const token2 = createAccessToken(user2);

  await apiRequest('/api/ratings', {
    method: 'POST',
    token: token1,
    body: { target_type: 'episode', target_id: episode.id, score: 5 },
  });
  await apiRequest('/api/ratings', {
    method: 'POST',
    token: token2,
    body: { target_type: 'episode', target_id: episode.id, score: 3 },
  });

  const res = await apiRequest(`/api/ratings/episode/${episode.id}`, { token: token1 });
  assert.equal(res.response.status, 200);
  assert.equal(res.data.average, 4);
  assert.equal(res.data.count, 2);
  assert.equal(res.data.user_score, 5);
});

test('ratings: update rating via upsert', async () => {
  const production = createProduction({ access_group: 'free' });
  const episode = createEpisode({ production_id: production.id, access_group: 'free' });
  const user = createUser();
  const token = createAccessToken(user);

  await apiRequest('/api/ratings', {
    method: 'POST',
    token,
    body: { target_type: 'episode', target_id: episode.id, score: 2 },
  });

  const updated = await apiRequest('/api/ratings', {
    method: 'POST',
    token,
    body: { target_type: 'episode', target_id: episode.id, score: 5 },
  });
  assert.equal(updated.response.status, 200);
  assert.equal(updated.data.score, 5);

  const row = db.prepare(
    'SELECT score FROM ratings WHERE user_id = ? AND target_type = ? AND target_id = ?'
  ).get(user.id, 'episode', episode.id);
  assert.equal(row.score, 5);
});

test('ratings: delete a rating', async () => {
  const production = createProduction({ access_group: 'free' });
  const episode = createEpisode({ production_id: production.id, access_group: 'free' });
  const user = createUser();
  const token = createAccessToken(user);

  await apiRequest('/api/ratings', {
    method: 'POST',
    token,
    body: { target_type: 'episode', target_id: episode.id, score: 3 },
  });

  const del = await apiRequest(`/api/ratings/episode/${episode.id}`, {
    method: 'DELETE',
    token,
  });
  assert.equal(del.response.status, 200);
  assert.equal(del.data.success, true);

  const row = db.prepare(
    'SELECT * FROM ratings WHERE user_id = ? AND target_type = ? AND target_id = ?'
  ).get(user.id, 'episode', episode.id);
  assert.equal(row, undefined);
});

test('ratings: reject invalid target_type', async () => {
  const user = createUser();
  const token = createAccessToken(user);

  const res = await apiRequest('/api/ratings', {
    method: 'POST',
    token,
    body: { target_type: 'invalid', target_id: 1, score: 3 },
  });
  assert.equal(res.response.status, 400);
});

test('ratings: reject invalid score (out of range)', async () => {
  const user = createUser();
  const token = createAccessToken(user);

  const tooHigh = await apiRequest('/api/ratings', {
    method: 'POST',
    token,
    body: { target_type: 'episode', target_id: 1, score: 6 },
  });
  assert.equal(tooHigh.response.status, 400);

  const tooLow = await apiRequest('/api/ratings', {
    method: 'POST',
    token,
    body: { target_type: 'episode', target_id: 1, score: 0 },
  });
  assert.equal(tooLow.response.status, 400);

  const notInt = await apiRequest('/api/ratings', {
    method: 'POST',
    token,
    body: { target_type: 'episode', target_id: 1, score: 3.5 },
  });
  assert.equal(notInt.response.status, 400);
});

// ═══════════════════════════════════════════════════════════════════════════
// PROMOTIONS
// ═══════════════════════════════════════════════════════════════════════════

test('promotions: admin creates a promotion', async () => {
  const admin = createUser({ role: 'admin' });
  const adminToken = createAccessToken(admin);

  const res = await apiRequest('/api/promotions/admin', {
    method: 'POST',
    token: adminToken,
    body: {
      name: 'Summer Sale',
      description: 'Big summer discount',
      type: 'flash_sale',
      discount_type: 'percent',
      discount_value: 20,
      applies_to: 'all',
    },
  });
  assert.equal(res.response.status, 201);
  assert.equal(res.data.success, true);
  assert.ok(res.data.id);

  const row = db.prepare('SELECT * FROM promotions WHERE id = ?').get(res.data.id);
  assert.equal(row.name, 'Summer Sale');
  assert.equal(row.discount_value, 20);
});

test('promotions: admin lists promotions', async () => {
  const admin = createUser({ role: 'admin' });
  const adminToken = createAccessToken(admin);

  await apiRequest('/api/promotions/admin', {
    method: 'POST',
    token: adminToken,
    body: { name: 'Promo A', type: 'seasonal', discount_type: 'percent', discount_value: 10 },
  });
  await apiRequest('/api/promotions/admin', {
    method: 'POST',
    token: adminToken,
    body: { name: 'Promo B', type: 'loyalty', discount_type: 'fixed', discount_value: 5 },
  });

  const res = await apiRequest('/api/promotions/admin', { token: adminToken });
  assert.equal(res.response.status, 200);
  assert.ok(Array.isArray(res.data.items));
  assert.equal(res.data.items.length, 2);
});

test('promotions: admin updates a promotion', async () => {
  const admin = createUser({ role: 'admin' });
  const adminToken = createAccessToken(admin);

  const created = await apiRequest('/api/promotions/admin', {
    method: 'POST',
    token: adminToken,
    body: { name: 'Old Name', type: 'flash_sale', discount_type: 'percent', discount_value: 15 },
  });

  const updated = await apiRequest(`/api/promotions/admin/${created.data.id}`, {
    method: 'PUT',
    token: adminToken,
    body: { name: 'New Name', discount_value: 25 },
  });
  assert.equal(updated.response.status, 200);
  assert.equal(updated.data.success, true);

  const row = db.prepare('SELECT * FROM promotions WHERE id = ?').get(created.data.id);
  assert.equal(row.name, 'New Name');
  assert.equal(row.discount_value, 25);
});

test('promotions: admin deletes a promotion', async () => {
  const admin = createUser({ role: 'admin' });
  const adminToken = createAccessToken(admin);

  const created = await apiRequest('/api/promotions/admin', {
    method: 'POST',
    token: adminToken,
    body: { name: 'To Delete', type: 'flash_sale', discount_type: 'percent', discount_value: 10 },
  });

  const del = await apiRequest(`/api/promotions/admin/${created.data.id}`, {
    method: 'DELETE',
    token: adminToken,
  });
  assert.equal(del.response.status, 200);
  assert.equal(del.data.success, true);

  const row = db.prepare('SELECT * FROM promotions WHERE id = ?').get(created.data.id);
  assert.equal(row, undefined);
});

test('promotions: non-admin can GET /api/promotions/active', async () => {
  const admin = createUser({ role: 'admin' });
  const adminToken = createAccessToken(admin);
  const user = createUser();
  const userToken = createAccessToken(user);

  // Create an active promotion (no start/end constraints)
  await apiRequest('/api/promotions/admin', {
    method: 'POST',
    token: adminToken,
    body: {
      name: 'Active Promo',
      type: 'flash_sale',
      discount_type: 'percent',
      discount_value: 10,
      applies_to: 'all',
    },
  });

  const res = await apiRequest('/api/promotions/active', { token: userToken });
  assert.equal(res.response.status, 200);
  assert.ok(Array.isArray(res.data));
});

test('promotions: non-admin cannot access admin endpoints', async () => {
  const user = createUser();
  const userToken = createAccessToken(user);

  const list = await apiRequest('/api/promotions/admin', { token: userToken });
  assert.equal(list.response.status, 403);

  const create = await apiRequest('/api/promotions/admin', {
    method: 'POST',
    token: userToken,
    body: { name: 'Hack', type: 'flash_sale', discount_type: 'percent', discount_value: 99 },
  });
  assert.equal(create.response.status, 403);
});

// ═══════════════════════════════════════════════════════════════════════════
// PURCHASE WISHLIST
// ═══════════════════════════════════════════════════════════════════════════

test('wishlist: add item to wishlist', async () => {
  const production = createProduction({ purchase_mode: 'production', purchase_price: 20 });
  const user = createUser();
  const token = createAccessToken(user);

  const res = await apiRequest('/api/wishlist', {
    method: 'POST',
    token,
    body: { target_type: 'production', target_id: production.id },
  });
  assert.equal(res.response.status, 201);
  assert.equal(res.data.success, true);
});

test('wishlist: list wishlist items', async () => {
  const production = createProduction({ purchase_mode: 'production', purchase_price: 20 });
  const user = createUser();
  const token = createAccessToken(user);

  await apiRequest('/api/wishlist', {
    method: 'POST',
    token,
    body: { target_type: 'production', target_id: production.id },
  });

  const res = await apiRequest('/api/wishlist', { token });
  assert.equal(res.response.status, 200);
  assert.ok(Array.isArray(res.data));
  assert.equal(res.data.length, 1);
  assert.equal(res.data[0].target_type, 'production');
  assert.equal(Number(res.data[0].target_id), Number(production.id));
});

test('wishlist: remove from wishlist', async () => {
  const production = createProduction({ purchase_mode: 'production', purchase_price: 20 });
  const user = createUser();
  const token = createAccessToken(user);

  await apiRequest('/api/wishlist', {
    method: 'POST',
    token,
    body: { target_type: 'production', target_id: production.id },
  });

  const del = await apiRequest(`/api/wishlist/production/${production.id}`, {
    method: 'DELETE',
    token,
  });
  assert.equal(del.response.status, 200);
  assert.equal(del.data.success, true);

  const list = await apiRequest('/api/wishlist', { token });
  assert.equal(list.data.length, 0);
});

test('wishlist: reject duplicate addition (returns already_exists)', async () => {
  const production = createProduction({ purchase_mode: 'production', purchase_price: 20 });
  const user = createUser();
  const token = createAccessToken(user);

  await apiRequest('/api/wishlist', {
    method: 'POST',
    token,
    body: { target_type: 'production', target_id: production.id },
  });

  const dup = await apiRequest('/api/wishlist', {
    method: 'POST',
    token,
    body: { target_type: 'production', target_id: production.id },
  });
  assert.equal(dup.response.status, 200);
  assert.equal(dup.data.already_exists, true);
});

test('wishlist: rejects nonexistent or unsellable targets', async () => {
  const user = createUser();
  const token = createAccessToken(user);
  const lockedProduction = createProduction({
    access_group: 'free',
    purchase_mode: 'none',
    is_active: 1,
  });
  const lockedEpisode = createEpisode({
    production_id: lockedProduction.id,
    access_group: 'inherit',
    purchase_enabled: 0,
    purchase_price: null,
    is_active: 1,
  });

  const missing = await apiRequest('/api/wishlist', {
    method: 'POST',
    token,
    body: { target_type: 'production', target_id: 999999 },
  });
  assert.equal(missing.response.status, 404);

  const unsellableProduction = await apiRequest('/api/wishlist', {
    method: 'POST',
    token,
    body: { target_type: 'production', target_id: lockedProduction.id },
  });
  assert.equal(unsellableProduction.response.status, 400);

  const unsellableEpisode = await apiRequest('/api/wishlist', {
    method: 'POST',
    token,
    body: { target_type: 'episode', target_id: lockedEpisode.id },
  });
  assert.equal(unsellableEpisode.response.status, 400);

  const count = db.prepare('SELECT COUNT(*) as count FROM purchase_wishlist WHERE user_id = ?').get(user.id).count;
  assert.equal(count, 0);
});

test('wishlist: require auth', async () => {
  const res = await apiRequest('/api/wishlist');
  assert.equal(res.response.status, 401);
});

// ═══════════════════════════════════════════════════════════════════════════
// GIFTS
// ═══════════════════════════════════════════════════════════════════════════

test('gifts: create a gift for an episode creates pending purchase request', async () => {
  const production = createProduction({ access_group: 'free', purchase_mode: 'episodes' });
  const episode = createEpisode({ production_id: production.id, access_group: 'free', purchase_enabled: 1, purchase_price: 15 });
  const sender = createUser();
  const senderToken = createAccessToken(sender);

  const res = await apiRequest('/api/gifts/create', {
    method: 'POST',
    token: senderToken,
    body: { gift_type: 'episode', target_id: episode.id, message: 'Enjoy!' },
  });
  assert.equal(res.response.status, 201);
  assert.equal(res.data.success, true);
  assert.ok(res.data.code);
  assert.match(res.data.code, /^GIFT-/);
  assert.equal(res.data.price, 15);
  assert.ok(res.data.reference_code);

  // Gift should be pending_payment, not immediately redeemable
  const gift = db.prepare('SELECT * FROM gift_codes WHERE code = ?').get(res.data.code);
  assert.equal(gift.status, 'pending_payment');
  assert.ok(gift.source_request_id);

  // A purchase request should exist
  const pr = db.prepare('SELECT * FROM content_purchase_requests WHERE id = ?').get(gift.source_request_id);
  assert.equal(pr.status, 'pending');
  assert.equal(pr.final_price, 15);
});

test('gifts: create returns 409 when a pending request for the same target already exists', async () => {
  const production = createProduction({ access_group: 'free', purchase_mode: 'episodes' });
  const episode = createEpisode({ production_id: production.id, access_group: 'free', purchase_enabled: 1, purchase_price: 12 });
  const sender = createUser();
  const senderToken = createAccessToken(sender);

  const first = await apiRequest('/api/gifts/create', {
    method: 'POST',
    token: senderToken,
    body: { gift_type: 'episode', target_id: episode.id },
  });
  assert.equal(first.response.status, 201);

  const second = await apiRequest('/api/gifts/create', {
    method: 'POST',
    token: senderToken,
    body: { gift_type: 'episode', target_id: episode.id },
  });
  assert.equal(second.response.status, 409);
  assert.match(second.data?.error || '', /активна заявка/i);
});

test('gifts: create blocks unpublished or unavailable targets', async () => {
  const sender = createUser({ character_name: 'Gift Availability Sender' });
  const senderToken = createAccessToken(sender);

  const episodeProduction = createProduction({
    title: 'Gift Future Episode Production',
    slug: 'gift-future-episode-production',
    access_group: 'free',
    purchase_mode: 'episodes',
    is_active: 1,
  });
  const futureEpisode = createEpisode({
    production_id: episodeProduction.id,
    title: 'Gift Future Episode',
    access_group: 'inherit',
    purchase_enabled: 1,
    purchase_price: 7,
    is_active: 1,
  });
  db.prepare("UPDATE episodes SET published_at = datetime('now', '+2 days') WHERE id = ?")
    .run(futureEpisode.id);

  const unavailableProduction = createProduction({
    title: 'Gift Unavailable Production',
    slug: 'gift-unavailable-production',
    access_group: 'free',
    purchase_mode: 'production',
    purchase_price: 29,
    is_active: 1,
  });
  db.prepare("UPDATE productions SET available_until = datetime('now', '-1 day') WHERE id = ?")
    .run(unavailableProduction.id);

  const futureEpisodeGift = await apiRequest('/api/gifts/create', {
    method: 'POST',
    token: senderToken,
    body: { gift_type: 'episode', target_id: futureEpisode.id },
  });
  assert.equal(futureEpisodeGift.response.status, 404);

  const unavailableProductionGift = await apiRequest('/api/gifts/create', {
    method: 'POST',
    token: senderToken,
    body: { gift_type: 'production', target_id: unavailableProduction.id },
  });
  assert.equal(unavailableProductionGift.response.status, 400);
  assert.equal(unavailableProductionGift.data?.error, 'Тази продукция в момента не е налична и не може да бъде подарена.');

  const giftCount = db.prepare('SELECT COUNT(*) as count FROM gift_codes').get().count;
  assert.equal(giftCount, 0);
});

test('gifts: redeem rejects deleted gifted content', async () => {
  const production = createProduction({ access_group: 'free', purchase_mode: 'episodes' });
  const episode = createEpisode({ production_id: production.id, access_group: 'free', purchase_enabled: 1, purchase_price: 10 });
  const sender = createUser();
  const recipient = createUser();
  const admin = createUser({ role: 'admin' });
  const created = await apiRequest('/api/gifts/create', {
    method: 'POST',
    token: createAccessToken(sender),
    body: { gift_type: 'episode', target_id: episode.id },
  });
  assert.equal(created.response.status, 201);

  const gift = db.prepare('SELECT * FROM gift_codes WHERE code = ?').get(created.data.code);
  const confirmed = await apiRequest(`/api/content-purchases/admin/${gift.source_request_id}/confirm`, {
    method: 'PUT',
    token: createAccessToken(admin),
  });
  assert.equal(confirmed.response.status, 200);

  db.prepare('DELETE FROM episodes WHERE id = ?').run(episode.id);

  const redeemed = await apiRequest('/api/gifts/redeem', {
    method: 'POST',
    token: createAccessToken(recipient),
    body: { code: created.data.code },
  });
  assert.equal(redeemed.response.status, 400);
  assert.equal(redeemed.data?.error, 'Подареното съдържание вече не е налично.');

  const entitlementCount = db.prepare('SELECT COUNT(*) as count FROM content_entitlements WHERE user_id = ?').get(recipient.id).count;
  assert.equal(entitlementCount, 0);
});

test('gifts: redeem requires payment confirmation', async () => {
  const production = createProduction({ access_group: 'free', purchase_mode: 'episodes' });
  const episode = createEpisode({ production_id: production.id, access_group: 'free', purchase_enabled: 1, purchase_price: 10 });
  const sender = createUser();
  const senderToken = createAccessToken(sender);
  const recipient = createUser();
  const recipientToken = createAccessToken(recipient);
  const admin = createUser({ role: 'admin' });
  const adminToken = createAccessToken(admin);

  const created = await apiRequest('/api/gifts/create', {
    method: 'POST',
    token: senderToken,
    body: { gift_type: 'episode', target_id: episode.id },
  });
  assert.equal(created.response.status, 201);

  // Attempt redeem before payment confirmation — should fail
  const earlyRedeem = await apiRequest('/api/gifts/redeem', {
    method: 'POST',
    token: recipientToken,
    body: { code: created.data.code },
  });
  assert.equal(earlyRedeem.response.status, 404);

  // Admin confirms the purchase request
  const gift = db.prepare('SELECT * FROM gift_codes WHERE code = ?').get(created.data.code);
  const confirmRes = await apiRequest(`/api/content-purchases/admin/${gift.source_request_id}/confirm`, {
    method: 'PUT',
    token: adminToken,
  });
  assert.equal(confirmRes.response.status, 200);

  // Gift should now be redeemable
  const updatedGift = db.prepare('SELECT status FROM gift_codes WHERE code = ?').get(created.data.code);
  assert.equal(updatedGift.status, 'redeemable');

  // No entitlement for the sender (buyer) — it's a gift
  const senderEntitlement = db.prepare(
    'SELECT 1 FROM content_entitlements WHERE user_id = ? AND target_type = ? AND target_id = ?'
  ).get(sender.id, 'episode', episode.id);
  assert.equal(senderEntitlement, undefined);

  // Now redeem succeeds
  const redeemed = await apiRequest('/api/gifts/redeem', {
    method: 'POST',
    token: recipientToken,
    body: { code: created.data.code },
  });
  assert.equal(redeemed.response.status, 200);
  assert.equal(redeemed.data.success, true);

  // Recipient gets the entitlement
  const entitlement = db.prepare(
    'SELECT * FROM content_entitlements WHERE user_id = ? AND target_type = ? AND target_id = ?'
  ).get(recipient.id, 'episode', episode.id);
  assert.ok(entitlement);
});

test('gifts: list sent gifts', async () => {
  const production = createProduction({ access_group: 'free', purchase_mode: 'episodes' });
  const episode = createEpisode({ production_id: production.id, access_group: 'free', purchase_enabled: 1, purchase_price: 5 });
  const sender = createUser();
  const senderToken = createAccessToken(sender);

  await apiRequest('/api/gifts/create', {
    method: 'POST',
    token: senderToken,
    body: { gift_type: 'episode', target_id: episode.id },
  });

  const res = await apiRequest('/api/gifts/sent', { token: senderToken });
  assert.equal(res.response.status, 200);
  assert.ok(Array.isArray(res.data));
  assert.equal(res.data.length, 1);
  assert.equal(res.data[0].gift_type, 'episode');
  assert.equal(res.data[0].status, 'pending_payment');
});

test('gifts: list received gifts', async () => {
  const production = createProduction({ access_group: 'free', purchase_mode: 'episodes' });
  const episode = createEpisode({ production_id: production.id, access_group: 'free', purchase_enabled: 1, purchase_price: 5 });
  const sender = createUser();
  const senderToken = createAccessToken(sender);
  const recipient = createUser();
  const recipientToken = createAccessToken(recipient);
  const admin = createUser({ role: 'admin' });
  const adminToken = createAccessToken(admin);

  const created = await apiRequest('/api/gifts/create', {
    method: 'POST',
    token: senderToken,
    body: { gift_type: 'episode', target_id: episode.id },
  });

  // Confirm payment and redeem
  const gift = db.prepare('SELECT * FROM gift_codes WHERE code = ?').get(created.data.code);
  await apiRequest(`/api/content-purchases/admin/${gift.source_request_id}/confirm`, {
    method: 'PUT', token: adminToken,
  });
  await apiRequest('/api/gifts/redeem', {
    method: 'POST', token: recipientToken,
    body: { code: created.data.code },
  });

  const res = await apiRequest('/api/gifts/received', { token: recipientToken });
  assert.equal(res.response.status, 200);
  assert.ok(Array.isArray(res.data));
  assert.equal(res.data.length, 1);
});

test('gifts: reject expired gift code', async () => {
  const production = createProduction({ access_group: 'free', purchase_mode: 'episodes' });
  const episode = createEpisode({ production_id: production.id, access_group: 'free', purchase_enabled: 1, purchase_price: 5 });
  const sender = createUser();
  const senderToken = createAccessToken(sender);
  const recipient = createUser();
  const recipientToken = createAccessToken(recipient);

  const created = await apiRequest('/api/gifts/create', {
    method: 'POST',
    token: senderToken,
    body: { gift_type: 'episode', target_id: episode.id },
  });

  // Make it redeemable then expire it
  db.prepare("UPDATE gift_codes SET status = 'redeemable', expires_at = datetime('now', '-1 day') WHERE code = ?")
    .run(created.data.code);

  const redeemed = await apiRequest('/api/gifts/redeem', {
    method: 'POST',
    token: recipientToken,
    body: { code: created.data.code },
  });
  assert.equal(redeemed.response.status, 404);
});

test('gifts: reject already-redeemed gift code', async () => {
  const production = createProduction({ access_group: 'free', purchase_mode: 'episodes' });
  const episode = createEpisode({ production_id: production.id, access_group: 'free', purchase_enabled: 1, purchase_price: 5 });
  const sender = createUser();
  const senderToken = createAccessToken(sender);
  const admin = createUser({ role: 'admin' });
  const adminToken = createAccessToken(admin);
  const recipient1 = createUser();
  const recipient1Token = createAccessToken(recipient1);
  const recipient2 = createUser();
  const recipient2Token = createAccessToken(recipient2);

  const created = await apiRequest('/api/gifts/create', {
    method: 'POST',
    token: senderToken,
    body: { gift_type: 'episode', target_id: episode.id },
  });

  // Confirm payment
  const gift = db.prepare('SELECT * FROM gift_codes WHERE code = ?').get(created.data.code);
  await apiRequest(`/api/content-purchases/admin/${gift.source_request_id}/confirm`, {
    method: 'PUT', token: adminToken,
  });

  // First redeem succeeds
  await apiRequest('/api/gifts/redeem', {
    method: 'POST',
    token: recipient1Token,
    body: { code: created.data.code },
  });

  // Second redeem fails
  const second = await apiRequest('/api/gifts/redeem', {
    method: 'POST',
    token: recipient2Token,
    body: { code: created.data.code },
  });
  assert.equal(second.response.status, 404);
});

// ═══════════════════════════════════════════════════════════════════════════
// BUNDLES
// ═══════════════════════════════════════════════════════════════════════════

test('bundles: admin creates a bundle', async () => {
  const admin = createUser({ role: 'admin' });
  const adminToken = createAccessToken(admin);

  const res = await apiRequest('/api/bundles/admin', {
    method: 'POST',
    token: adminToken,
    body: {
      name: 'Buy 3 Pay 2',
      bundle_type: 'quantity',
      buy_count: 3,
      pay_count: 2,
    },
  });
  assert.equal(res.response.status, 201);
  assert.equal(res.data.success, true);
  assert.ok(res.data.id);

  const row = db.prepare('SELECT * FROM bundles WHERE id = ?').get(res.data.id);
  assert.equal(row.name, 'Buy 3 Pay 2');
  assert.equal(row.bundle_type, 'quantity');
});

test('bundles: user lists available bundles', async () => {
  const admin = createUser({ role: 'admin' });
  const adminToken = createAccessToken(admin);
  const user = createUser();
  const userToken = createAccessToken(user);

  await apiRequest('/api/bundles/admin', {
    method: 'POST',
    token: adminToken,
    body: { name: 'Available Bundle', bundle_type: 'quantity', buy_count: 3, pay_count: 2 },
  });

  const res = await apiRequest('/api/bundles/available', { token: userToken });
  assert.equal(res.response.status, 200);
  assert.ok(Array.isArray(res.data));
  assert.ok(res.data.length >= 1);
  assert.equal(res.data[0].name, 'Available Bundle');
});

test('bundles: purchase rejects episodes that are not individually sellable', async () => {
  const admin = createUser({ role: 'admin' });
  const user = createUser();
  const production = createProduction({
    title: 'Bundle Locked Production',
    slug: 'bundle-locked-production',
    access_group: 'free',
    purchase_mode: 'none',
    is_active: 1,
  });
  const episode = createEpisode({
    production_id: production.id,
    title: 'Bundle Locked Episode',
    access_group: 'inherit',
    purchase_enabled: 0,
    purchase_price: null,
    is_active: 1,
  });

  const bundleCreated = await apiRequest('/api/bundles/admin', {
    method: 'POST',
    token: createAccessToken(admin),
    body: {
      name: 'Locked Bundle',
      bundle_type: 'fixed',
      fixed_price: 5,
      episode_ids: [episode.id],
    },
  });
  assert.equal(bundleCreated.response.status, 201);

  const purchase = await apiRequest('/api/bundles/purchase', {
    method: 'POST',
    token: createAccessToken(user),
    body: {
      bundle_id: bundleCreated.data.id,
    },
  });
  assert.equal(purchase.response.status, 400);
  assert.match(purchase.data?.error || '', /не може да бъде закупен индивидуално/i);

  const requestCount = db.prepare('SELECT COUNT(*) as count FROM content_purchase_requests WHERE user_id = ?').get(user.id).count;
  assert.equal(requestCount, 0);
});

test('bundles: admin deletes a bundle', async () => {
  const admin = createUser({ role: 'admin' });
  const adminToken = createAccessToken(admin);

  const created = await apiRequest('/api/bundles/admin', {
    method: 'POST',
    token: adminToken,
    body: { name: 'To Delete Bundle', bundle_type: 'quantity', buy_count: 3, pay_count: 2 },
  });

  const del = await apiRequest(`/api/bundles/admin/${created.data.id}`, {
    method: 'DELETE',
    token: adminToken,
  });
  assert.equal(del.response.status, 200);
  assert.equal(del.data.success, true);

  const row = db.prepare('SELECT * FROM bundles WHERE id = ?').get(created.data.id);
  assert.equal(row, undefined);
});

// ═══════════════════════════════════════════════════════════════════════════
// WATCH PARTY
// ═══════════════════════════════════════════════════════════════════════════

test('watch party: create a watch party', async () => {
  const production = createProduction({ access_group: 'free' });
  const episode = createEpisode({ production_id: production.id, access_group: 'free' });
  const host = createUser();
  const hostToken = createAccessToken(host);

  const res = await apiRequest('/api/watch-party/create', {
    method: 'POST',
    token: hostToken,
    body: { episode_id: episode.id, max_participants: 5 },
  });
  assert.equal(res.response.status, 201);
  assert.equal(res.data.success, true);
  assert.ok(res.data.party_id);
  assert.ok(res.data.invite_code);
  assert.equal(res.data.episode_title, episode.title);
});

test('watch party: join a watch party', async () => {
  const production = createProduction({ access_group: 'free' });
  const episode = createEpisode({ production_id: production.id, access_group: 'free' });
  const host = createUser();
  const hostToken = createAccessToken(host);
  const guest = createUser();
  const guestToken = createAccessToken(guest);

  const created = await apiRequest('/api/watch-party/create', {
    method: 'POST',
    token: hostToken,
    body: { episode_id: episode.id },
  });

  const joined = await apiRequest(`/api/watch-party/${created.data.invite_code}/join`, {
    method: 'POST',
    token: guestToken,
  });
  assert.equal(joined.response.status, 200);
  assert.equal(joined.data.success, true);
  assert.equal(joined.data.party_id, created.data.party_id);
});

test('watch party: send messages', async () => {
  const production = createProduction({ access_group: 'free' });
  const episode = createEpisode({ production_id: production.id, access_group: 'free' });
  const host = createUser();
  const hostToken = createAccessToken(host);

  const created = await apiRequest('/api/watch-party/create', {
    method: 'POST',
    token: hostToken,
    body: { episode_id: episode.id },
  });

  const msg = await apiRequest(`/api/watch-party/${created.data.invite_code}/message`, {
    method: 'POST',
    token: hostToken,
    body: { message: 'Hello everyone!' },
  });
  assert.equal(msg.response.status, 201);
  assert.equal(msg.data.success, true);
  assert.equal(msg.data.message, 'Hello everyone!');
  assert.ok(msg.data.message_id);
});

test('watch party: leave party', async () => {
  const production = createProduction({ access_group: 'free' });
  const episode = createEpisode({ production_id: production.id, access_group: 'free' });
  const host = createUser();
  const hostToken = createAccessToken(host);
  const guest = createUser();
  const guestToken = createAccessToken(guest);

  const created = await apiRequest('/api/watch-party/create', {
    method: 'POST',
    token: hostToken,
    body: { episode_id: episode.id },
  });

  await apiRequest(`/api/watch-party/${created.data.invite_code}/join`, {
    method: 'POST',
    token: guestToken,
  });

  const left = await apiRequest(`/api/watch-party/${created.data.invite_code}/leave`, {
    method: 'POST',
    token: guestToken,
  });
  assert.equal(left.response.status, 200);
  assert.equal(left.data.success, true);

  // Verify participant has left_at set
  const participant = db.prepare(
    'SELECT * FROM watch_party_participants WHERE party_id = ? AND user_id = ?'
  ).get(created.data.party_id, guest.id);
  assert.ok(participant.left_at);
});

test('watch party: end party (host only)', async () => {
  const production = createProduction({ access_group: 'free' });
  const episode = createEpisode({ production_id: production.id, access_group: 'free' });
  const host = createUser();
  const hostToken = createAccessToken(host);
  const guest = createUser();
  const guestToken = createAccessToken(guest);

  const created = await apiRequest('/api/watch-party/create', {
    method: 'POST',
    token: hostToken,
    body: { episode_id: episode.id },
  });

  // Non-host cannot end
  const nonHostEnd = await apiRequest(`/api/watch-party/${created.data.invite_code}/end`, {
    method: 'PUT',
    token: guestToken,
  });
  assert.equal(nonHostEnd.response.status, 403);

  // Host can end
  const hostEnd = await apiRequest(`/api/watch-party/${created.data.invite_code}/end`, {
    method: 'PUT',
    token: hostToken,
  });
  assert.equal(hostEnd.response.status, 200);
  assert.equal(hostEnd.data.success, true);

  const party = db.prepare('SELECT * FROM watch_parties WHERE id = ?').get(created.data.party_id);
  assert.equal(party.status, 'ended');
});

// ═══════════════════════════════════════════════════════════════════════════
// TIME-LIMITED CONTENT
// ═══════════════════════════════════════════════════════════════════════════

test('time-limited: episode with available_from in the future is inaccessible', async () => {
  const production = createProduction({ access_group: 'free' });
  const episode = createEpisode({ production_id: production.id, access_group: 'free' });
  const user = createUser();
  const token = createAccessToken(user);

  // Set available_from to far in the future
  db.prepare("UPDATE episodes SET available_from = datetime('now', '+30 days') WHERE id = ?")
    .run(episode.id);

  const res = await apiRequest(`/api/episodes/${episode.id}`, { token });
  assert.equal(res.response.status, 200);
  assert.equal(res.data.has_access, false);
  // youtube_video_id should be hidden when access is denied
  assert.equal(res.data.youtube_video_id, undefined);
});

test('time-limited: episode with available_until in the past is inaccessible', async () => {
  const production = createProduction({ access_group: 'free' });
  const episode = createEpisode({ production_id: production.id, access_group: 'free' });
  const user = createUser();
  const token = createAccessToken(user);

  // Set available_until to the past
  db.prepare("UPDATE episodes SET available_until = datetime('now', '-1 day') WHERE id = ?")
    .run(episode.id);

  const res = await apiRequest(`/api/episodes/${episode.id}`, { token });
  assert.equal(res.response.status, 200);
  assert.equal(res.data.has_access, false);
  assert.equal(res.data.youtube_video_id, undefined);
});

test('time-limited: episode within the availability window is accessible', async () => {
  const production = createProduction({ access_group: 'free' });
  const episode = createEpisode({ production_id: production.id, access_group: 'free' });
  const user = createUser();
  const token = createAccessToken(user);

  // Set a window that includes now
  db.prepare(
    "UPDATE episodes SET available_from = datetime('now', '-1 day'), available_until = datetime('now', '+30 days') WHERE id = ?"
  ).run(episode.id);

  const res = await apiRequest(`/api/episodes/${episode.id}`, { token });
  assert.equal(res.response.status, 200);
  assert.equal(res.data.has_access, true);
  assert.ok(res.data.youtube_video_id);
});

// ═══════════════════════════════════════════════════════════════════════════
// DASHBOARD NEW ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════

test('dashboard: admin can access /api/admin/dashboard/revenue', async () => {
  const admin = createUser({ role: 'admin' });
  const adminToken = createAccessToken(admin);

  const res = await apiRequest('/api/admin/dashboard/revenue', { token: adminToken });
  assert.equal(res.response.status, 200);
  assert.ok(res.data.subscriptions !== undefined);
  assert.ok(res.data.purchases !== undefined);
});

test('dashboard: admin can access /api/admin/dashboard/retention', async () => {
  const admin = createUser({ role: 'admin' });
  const adminToken = createAccessToken(admin);

  const res = await apiRequest('/api/admin/dashboard/retention', { token: adminToken });
  assert.equal(res.response.status, 200);
  assert.ok('total_ever_subscribed' in res.data);
  assert.ok('renewals' in res.data);
  assert.ok('renewal_rate' in res.data);
  assert.ok('active_subscribers' in res.data);
  assert.ok('churned' in res.data);
});

test('dashboard: admin can access /api/admin/dashboard/top-content', async () => {
  const admin = createUser({ role: 'admin' });
  const adminToken = createAccessToken(admin);

  const res = await apiRequest('/api/admin/dashboard/top-content', { token: adminToken });
  assert.equal(res.response.status, 200);
  assert.ok(Array.isArray(res.data.episodes));
  assert.ok(Array.isArray(res.data.productions));
});

test('dashboard: admin can access /api/admin/dashboard/conversion', async () => {
  const admin = createUser({ role: 'admin' });
  const adminToken = createAccessToken(admin);

  const res = await apiRequest('/api/admin/dashboard/conversion', { token: adminToken });
  assert.equal(res.response.status, 200);
  assert.ok('total_users' in res.data);
  assert.ok('free_only' in res.data);
  assert.ok('ever_subscribed' in res.data);
  assert.ok('ever_purchased' in res.data);
  assert.ok('subscription_rate' in res.data);
});

test('dashboard: non-admin is blocked from /api/admin/dashboard/revenue', async () => {
  const user = createUser();
  const userToken = createAccessToken(user);

  const res = await apiRequest('/api/admin/dashboard/revenue', { token: userToken });
  assert.equal(res.response.status, 403);
});

test('dashboard: non-admin is blocked from /api/admin/dashboard/retention', async () => {
  const user = createUser();
  const userToken = createAccessToken(user);

  const res = await apiRequest('/api/admin/dashboard/retention', { token: userToken });
  assert.equal(res.response.status, 403);
});

test('dashboard: non-admin is blocked from /api/admin/dashboard/top-content', async () => {
  const user = createUser();
  const userToken = createAccessToken(user);

  const res = await apiRequest('/api/admin/dashboard/top-content', { token: userToken });
  assert.equal(res.response.status, 403);
});

test('dashboard: non-admin is blocked from /api/admin/dashboard/conversion', async () => {
  const user = createUser();
  const userToken = createAccessToken(user);

  const res = await apiRequest('/api/admin/dashboard/conversion', { token: userToken });
  assert.equal(res.response.status, 403);
});
