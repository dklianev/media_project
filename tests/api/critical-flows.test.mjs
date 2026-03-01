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
  const token = jwt.sign(
    {
      id: user.id,
      type: 'refresh',
      jti: randomBytes(16).toString('hex'),
    },
    JWT_REFRESH_SECRET,
    { expiresIn: '7d' }
  );

  const tokenHash = createHash('sha256').update(token).digest('hex');
  db.prepare(`
    INSERT INTO refresh_tokens (user_id, token, expires_at)
    VALUES (?, ?, ?)
  `).run(user.id, tokenHash, new Date(Date.now() + REFRESH_TTL_MS).toISOString());

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
      required_tier, access_group, is_active, sort_order
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    overrides.title || `Продукция ${idSuffix}`,
    overrides.slug || `production-${idSuffix}`,
    overrides.description || '',
    overrides.thumbnail_url || null,
    overrides.cover_image_url || null,
    overrides.required_tier ?? 0,
    overrides.access_group || 'subscription',
    overrides.is_active ?? 1,
    overrides.sort_order ?? 0
  );

  return db.prepare('SELECT * FROM productions WHERE id = ?').get(result.lastInsertRowid);
}

function createEpisode(overrides = {}) {
  const result = db.prepare(`
    INSERT INTO episodes (
      production_id, title, description, youtube_video_id, thumbnail_url,
      side_images, side_text, ad_banner_url, ad_banner_link,
      access_group, episode_number, view_count, is_active
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    overrides.episode_number ?? 1,
    overrides.view_count ?? 0,
    overrides.is_active ?? 1
  );

  return db.prepare('SELECT * FROM episodes WHERE id = ?').get(result.lastInsertRowid);
}

async function apiRequest(path, { method = 'GET', token, body } = {}) {
  const headers = {};
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

function resetDatabase() {
  const tables = [
    'admin_audit_logs',
    'notifications',
    'reactions',
    'comments',
    'watch_history',
    'watchlist',
    'episodes',
    'productions',
    'payment_references',
    'refresh_tokens',
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

test('auth refresh ротира токена и блокира повторна употреба на стария', async () => {
  const user = createUser();
  const refreshToken = createRefreshToken(user);

  const first = await apiRequest('/api/auth/refresh', {
    method: 'POST',
    body: { refresh_token: refreshToken },
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
    body: { refresh_token: refreshToken },
  });

  assert.equal(reused.response.status, 401);
  const leftTokens = db.prepare('SELECT COUNT(*) as count FROM refresh_tokens WHERE user_id = ?').get(user.id).count;
  assert.equal(leftTokens, 0);
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
  assert.equal(notifications.length, 2);
  assert.deepEqual(
    notifications.map((item) => item.user_id).sort((a, b) => a - b),
    [admin.id, viewer.id]
  );
  assert.ok(notifications.every((item) => item.title === 'Нов епизод: Scheduled Production'));
  assert.equal(
    db.prepare('SELECT COUNT(*) as count FROM notifications WHERE user_id = ?').get(banned.id).count,
    0
  );
});
