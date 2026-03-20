import Database from 'better-sqlite3';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH
  ? resolve(process.env.DB_PATH)
  : resolve(__dirname, '..', 'data', 'media.db');

mkdirSync(dirname(dbPath), { recursive: true });

const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    discord_id TEXT UNIQUE NOT NULL,
    discord_username TEXT NOT NULL,
    discord_avatar TEXT,
    character_name TEXT,
    role TEXT DEFAULT 'user',
    subscription_plan_id INTEGER,
    subscription_expires_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (subscription_plan_id) REFERENCES subscription_plans(id)
  );

  CREATE TABLE IF NOT EXISTS subscription_plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    price REAL NOT NULL,
    tier_level INTEGER NOT NULL,
    features TEXT,
    is_active INTEGER DEFAULT 1,
    sort_order INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS promo_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    discount_percent INTEGER NOT NULL,
    is_active INTEGER DEFAULT 1,
    uses_count INTEGER DEFAULT 0,
    max_uses INTEGER,
    expires_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS productions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    description TEXT,
    thumbnail_url TEXT,
    cover_image_url TEXT,
    required_tier INTEGER DEFAULT 0,
    access_group TEXT DEFAULT 'subscription',
    is_active INTEGER DEFAULT 1,
    sort_order INTEGER DEFAULT 0,
    purchase_mode TEXT DEFAULT 'none',
    purchase_price REAL,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS episodes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    production_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    youtube_video_id TEXT,
    thumbnail_url TEXT,
    side_images TEXT,
    side_text TEXT,
    ad_banner_url TEXT,
    ad_banner_link TEXT,
    access_group TEXT DEFAULT 'inherit',
    purchase_enabled INTEGER DEFAULT 0,
    purchase_price REAL,
    episode_number INTEGER,
    view_count INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (production_id) REFERENCES productions(id)
  );

  CREATE TABLE IF NOT EXISTS reactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    episode_id INTEGER NOT NULL,
    reaction_type TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(user_id, episode_id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (episode_id) REFERENCES episodes(id)
  );

  CREATE TABLE IF NOT EXISTS payment_references (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    plan_id INTEGER NOT NULL,
    reference_code TEXT UNIQUE NOT NULL,
    original_price REAL NOT NULL,
    discount_percent INTEGER DEFAULT 0,
    final_price REAL NOT NULL,
    promo_code_id INTEGER,
    status TEXT DEFAULT 'pending',
    confirmed_by INTEGER,
    confirmed_at TEXT,
    rejected_by INTEGER,
    rejected_at TEXT,
    rejection_reason TEXT,
    cancelled_at TEXT,
    cancelled_reason TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (plan_id) REFERENCES subscription_plans(id),
    FOREIGN KEY (promo_code_id) REFERENCES promo_codes(id)
  );

  CREATE TABLE IF NOT EXISTS content_purchase_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    target_type TEXT NOT NULL,
    target_id INTEGER NOT NULL,
    target_title_snapshot TEXT,
    production_title_snapshot TEXT,
    production_slug_snapshot TEXT,
    episode_number_snapshot INTEGER,
    reference_code TEXT UNIQUE NOT NULL,
    original_price REAL NOT NULL,
    final_price REAL NOT NULL,
    status TEXT DEFAULT 'pending',
    confirmed_by INTEGER,
    confirmed_at TEXT,
    rejected_by INTEGER,
    rejected_at TEXT,
    rejection_reason TEXT,
    cancelled_at TEXT,
    cancelled_reason TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (confirmed_by) REFERENCES users(id),
    FOREIGN KEY (rejected_by) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS content_entitlements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    target_type TEXT NOT NULL,
    target_id INTEGER NOT NULL,
    source_request_id INTEGER,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(user_id, target_type, target_id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (source_request_id) REFERENCES content_purchase_requests(id)
  );

  CREATE TABLE IF NOT EXISTS refresh_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token TEXT UNIQUE NOT NULL,
    jti TEXT UNIQUE,
    user_agent_hash TEXT,
    expires_at TEXT NOT NULL,
    last_used_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS auth_exchange_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    code TEXT UNIQUE NOT NULL,
    expires_at TEXT NOT NULL,
    used_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS admin_audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_user_id INTEGER NOT NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT,
    target_user_id INTEGER,
    metadata TEXT,
    ip_address TEXT,
    user_agent TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (admin_user_id) REFERENCES users(id),
    FOREIGN KEY (target_user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS site_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS watchlist (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    production_id INTEGER NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(user_id, production_id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (production_id) REFERENCES productions(id)
  );

  CREATE TABLE IF NOT EXISTS watch_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    episode_id INTEGER NOT NULL,
    progress_seconds REAL DEFAULT 0,
    last_watched_at TEXT DEFAULT (datetime('now')),
    UNIQUE(user_id, episode_id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (episode_id) REFERENCES episodes(id)
  );

  CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    episode_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'published',
    moderation_reason TEXT,
    moderated_at TEXT,
    moderated_by INTEGER,
    deleted_at TEXT,
    deleted_by INTEGER,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (episode_id) REFERENCES episodes(id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (moderated_by) REFERENCES users(id),
    FOREIGN KEY (deleted_by) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    message TEXT,
    link TEXT,
    is_read INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS media_assets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    original_name TEXT NOT NULL,
    stored_name TEXT NOT NULL,
    url TEXT UNIQUE NOT NULL,
    mime_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL DEFAULT 0,
    width INTEGER,
    height INTEGER,
    source TEXT,
    created_by INTEGER,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (created_by) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS support_tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    subject TEXT NOT NULL,
    message TEXT NOT NULL,
    status TEXT DEFAULT 'open',
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS support_ticket_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    message TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (ticket_id) REFERENCES support_tickets(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS ratings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    target_type TEXT NOT NULL,
    target_id INTEGER NOT NULL,
    score INTEGER NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(user_id, target_type, target_id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS promotions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    type TEXT NOT NULL,
    discount_type TEXT DEFAULT 'percent',
    discount_value REAL NOT NULL,
    conditions TEXT,
    applies_to TEXT DEFAULT 'all',
    starts_at TEXT,
    ends_at TEXT,
    is_active INTEGER DEFAULT 1,
    max_uses INTEGER,
    uses_count INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS promotion_usages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    promotion_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    applied_to_type TEXT,
    applied_to_id INTEGER,
    discount_amount REAL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (promotion_id) REFERENCES promotions(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS bundles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    production_id INTEGER,
    bundle_type TEXT DEFAULT 'quantity',
    buy_count INTEGER,
    pay_count INTEGER,
    fixed_price REAL,
    episode_ids TEXT,
    is_active INTEGER DEFAULT 1,
    starts_at TEXT,
    ends_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS purchase_wishlist (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    target_type TEXT NOT NULL,
    target_id INTEGER NOT NULL,
    notified_price REAL,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(user_id, target_type, target_id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS gift_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    sender_id INTEGER NOT NULL,
    recipient_id INTEGER,
    gift_type TEXT NOT NULL,
    target_id INTEGER,
    plan_id INTEGER,
    plan_duration_days INTEGER,
    source_request_id INTEGER,
    status TEXT DEFAULT 'pending',
    message TEXT,
    redeemed_at TEXT,
    expires_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (sender_id) REFERENCES users(id),
    FOREIGN KEY (recipient_id) REFERENCES users(id),
    FOREIGN KEY (plan_id) REFERENCES subscription_plans(id)
  );

  CREATE TABLE IF NOT EXISTS referral_rewards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    referrer_id INTEGER NOT NULL,
    referred_id INTEGER NOT NULL,
    reward_type TEXT NOT NULL,
    reward_value REAL NOT NULL,
    trigger_event TEXT,
    applied INTEGER DEFAULT 0,
    applied_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (referrer_id) REFERENCES users(id),
    FOREIGN KEY (referred_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS watch_parties (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    host_id INTEGER NOT NULL,
    episode_id INTEGER NOT NULL,
    invite_code TEXT UNIQUE NOT NULL,
    status TEXT DEFAULT 'active',
    max_participants INTEGER DEFAULT 10,
    playback_state TEXT DEFAULT 'paused',
    playback_position_seconds REAL DEFAULT 0,
    playback_updated_at TEXT DEFAULT (datetime('now')),
    playback_version INTEGER DEFAULT 0,
    started_at TEXT DEFAULT (datetime('now')),
    ended_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (host_id) REFERENCES users(id),
    FOREIGN KEY (episode_id) REFERENCES episodes(id)
  );

  CREATE TABLE IF NOT EXISTS watch_party_participants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    party_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    joined_at TEXT DEFAULT (datetime('now')),
    left_at TEXT,
    UNIQUE(party_id, user_id),
    FOREIGN KEY (party_id) REFERENCES watch_parties(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS watch_party_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    party_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    message TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (party_id) REFERENCES watch_parties(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);

function hasColumn(table, column) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some((item) => item.name === column);
}

if (!hasColumn('productions', 'access_group')) {
  db.exec(`ALTER TABLE productions ADD COLUMN access_group TEXT DEFAULT 'subscription'`);
}
if (!hasColumn('productions', 'purchase_mode')) {
  db.exec(`ALTER TABLE productions ADD COLUMN purchase_mode TEXT DEFAULT 'none'`);
}
if (!hasColumn('productions', 'purchase_price')) {
  db.exec(`ALTER TABLE productions ADD COLUMN purchase_price REAL`);
}
if (!hasColumn('episodes', 'access_group')) {
  db.exec(`ALTER TABLE episodes ADD COLUMN access_group TEXT DEFAULT 'inherit'`);
}
if (!hasColumn('episodes', 'purchase_enabled')) {
  db.exec(`ALTER TABLE episodes ADD COLUMN purchase_enabled INTEGER DEFAULT 0`);
}
if (!hasColumn('episodes', 'purchase_price')) {
  db.exec(`ALTER TABLE episodes ADD COLUMN purchase_price REAL`);
}
if (!hasColumn('watch_parties', 'playback_state')) {
  db.exec(`ALTER TABLE watch_parties ADD COLUMN playback_state TEXT DEFAULT 'paused'`);
}
if (!hasColumn('watch_parties', 'playback_position_seconds')) {
  db.exec(`ALTER TABLE watch_parties ADD COLUMN playback_position_seconds REAL DEFAULT 0`);
}
if (!hasColumn('watch_parties', 'playback_updated_at')) {
  db.exec(`ALTER TABLE watch_parties ADD COLUMN playback_updated_at TEXT DEFAULT (datetime('now'))`);
  db.exec(`UPDATE watch_parties SET playback_updated_at = COALESCE(started_at, created_at, datetime('now')) WHERE playback_updated_at IS NULL`);
}
if (!hasColumn('watch_parties', 'playback_version')) {
  db.exec(`ALTER TABLE watch_parties ADD COLUMN playback_version INTEGER DEFAULT 0`);
}
if (!hasColumn('payment_references', 'rejected_by')) {
  db.exec(`ALTER TABLE payment_references ADD COLUMN rejected_by INTEGER`);
}
if (!hasColumn('payment_references', 'rejected_at')) {
  db.exec(`ALTER TABLE payment_references ADD COLUMN rejected_at TEXT`);
}
if (!hasColumn('payment_references', 'rejection_reason')) {
  db.exec(`ALTER TABLE payment_references ADD COLUMN rejection_reason TEXT`);
}
if (!hasColumn('payment_references', 'cancelled_at')) {
  db.exec(`ALTER TABLE payment_references ADD COLUMN cancelled_at TEXT`);
}
if (!hasColumn('payment_references', 'cancelled_reason')) {
  db.exec(`ALTER TABLE payment_references ADD COLUMN cancelled_reason TEXT`);
}
if (!hasColumn('content_purchase_requests', 'target_title_snapshot')) {
  db.exec(`ALTER TABLE content_purchase_requests ADD COLUMN target_title_snapshot TEXT`);
}
if (!hasColumn('content_purchase_requests', 'production_title_snapshot')) {
  db.exec(`ALTER TABLE content_purchase_requests ADD COLUMN production_title_snapshot TEXT`);
}
if (!hasColumn('content_purchase_requests', 'production_slug_snapshot')) {
  db.exec(`ALTER TABLE content_purchase_requests ADD COLUMN production_slug_snapshot TEXT`);
}
if (!hasColumn('content_purchase_requests', 'episode_number_snapshot')) {
  db.exec(`ALTER TABLE content_purchase_requests ADD COLUMN episode_number_snapshot INTEGER`);
}

if (!hasColumn('refresh_tokens', 'jti')) {
  db.exec(`ALTER TABLE refresh_tokens ADD COLUMN jti TEXT`);
}
if (!hasColumn('refresh_tokens', 'user_agent_hash')) {
  db.exec(`ALTER TABLE refresh_tokens ADD COLUMN user_agent_hash TEXT`);
}
if (!hasColumn('refresh_tokens', 'last_used_at')) {
  db.exec(`ALTER TABLE refresh_tokens ADD COLUMN last_used_at TEXT`);
}

if (!hasColumn('episodes', 'published_at')) {
  db.exec(`ALTER TABLE episodes ADD COLUMN published_at TEXT`);
}

// Keep published_at in index-friendly "YYYY-MM-DD HH:MM:SS" format.
db.exec(`
  UPDATE episodes
  SET published_at = CASE
    WHEN published_at IS NULL OR trim(published_at) = '' THEN NULL
    WHEN length(replace(replace(trim(published_at), 'T', ' '), 'Z', '')) = 16
      THEN replace(replace(trim(published_at), 'T', ' '), 'Z', '') || ':00'
    ELSE substr(replace(replace(trim(published_at), 'T', ' '), 'Z', ''), 1, 19)
  END
  WHERE published_at IS NOT NULL
`);

if (!hasColumn('episodes', 'duration_seconds')) {
  db.exec(`ALTER TABLE episodes ADD COLUMN duration_seconds INTEGER`);
}

// ─── Local video hosting columns ───
if (!hasColumn('episodes', 'video_source')) {
  db.exec(`ALTER TABLE episodes ADD COLUMN video_source TEXT DEFAULT 'youtube'`);
}
if (!hasColumn('episodes', 'local_video_url')) {
  db.exec(`ALTER TABLE episodes ADD COLUMN local_video_url TEXT`);
}
if (!hasColumn('episodes', 'transcoding_status')) {
  db.exec(`ALTER TABLE episodes ADD COLUMN transcoding_status TEXT`);
}

if (!hasColumn('subscription_plans', 'duration_days')) {
  db.exec(`ALTER TABLE subscription_plans ADD COLUMN duration_days INTEGER DEFAULT 30`);
}

if (!hasColumn('subscription_plans', 'is_popular')) {
  db.exec(`ALTER TABLE subscription_plans ADD COLUMN is_popular INTEGER DEFAULT 0`);
}

if (!hasColumn('subscription_plans', 'updated_at')) {
  db.exec(`ALTER TABLE subscription_plans ADD COLUMN updated_at TEXT`);
}

if (!hasColumn('promo_codes', 'updated_at')) {
  db.exec(`ALTER TABLE promo_codes ADD COLUMN updated_at TEXT`);
}

if (!hasColumn('productions', 'genres')) {
  db.exec(`ALTER TABLE productions ADD COLUMN genres TEXT DEFAULT '[]'`);
}

// Notifications
if (!hasColumn('notifications', 'type')) {
  db.exec("ALTER TABLE notifications ADD COLUMN type TEXT");
}
if (!hasColumn('notifications', 'metadata')) {
  db.exec("ALTER TABLE notifications ADD COLUMN metadata TEXT");
}

// Time-limited content
if (!hasColumn('episodes', 'available_from')) {
  db.exec("ALTER TABLE episodes ADD COLUMN available_from TEXT");
}
if (!hasColumn('episodes', 'available_until')) {
  db.exec("ALTER TABLE episodes ADD COLUMN available_until TEXT");
}
if (!hasColumn('productions', 'available_from')) {
  db.exec("ALTER TABLE productions ADD COLUMN available_from TEXT");
}
if (!hasColumn('productions', 'available_until')) {
  db.exec("ALTER TABLE productions ADD COLUMN available_until TEXT");
}

// Promo codes extension for purchases
if (!hasColumn('promo_codes', 'applies_to')) {
  db.exec("ALTER TABLE promo_codes ADD COLUMN applies_to TEXT DEFAULT 'subscriptions'");
}

// Referral system
if (!hasColumn('users', 'referral_code')) {
  db.exec("ALTER TABLE users ADD COLUMN referral_code TEXT");
}
if (!hasColumn('users', 'referred_by')) {
  db.exec("ALTER TABLE users ADD COLUMN referred_by INTEGER");
}

db.exec(`
  UPDATE subscription_plans
  SET updated_at = COALESCE(updated_at, created_at, datetime('now'))
`);

db.exec(`
  UPDATE productions
  SET purchase_mode = 'none'
  WHERE purchase_mode IS NULL OR trim(purchase_mode) = ''
`);

db.exec(`
  UPDATE episodes
  SET purchase_enabled = COALESCE(purchase_enabled, 0)
`);

db.exec(`
  UPDATE productions
  SET purchase_price = NULL
  WHERE purchase_price IS NOT NULL
    AND CAST(purchase_price AS REAL) <= 0
`);

db.exec(`
  UPDATE episodes
  SET purchase_price = NULL
  WHERE purchase_price IS NOT NULL
    AND CAST(purchase_price AS REAL) <= 0
`);

db.exec(`
  UPDATE content_purchase_requests
  SET target_title_snapshot = COALESCE(
    NULLIF(target_title_snapshot, ''),
    CASE
      WHEN target_type = 'production' THEN (
        SELECT title
        FROM productions
        WHERE productions.id = content_purchase_requests.target_id
      )
      ELSE (
        SELECT title
        FROM episodes
        WHERE episodes.id = content_purchase_requests.target_id
      )
    END
  )
  WHERE target_title_snapshot IS NULL OR trim(target_title_snapshot) = ''
`);

db.exec(`
  UPDATE content_purchase_requests
  SET production_title_snapshot = COALESCE(
    NULLIF(production_title_snapshot, ''),
    CASE
      WHEN target_type = 'production' THEN (
        SELECT title
        FROM productions
        WHERE productions.id = content_purchase_requests.target_id
      )
      ELSE (
        SELECT p.title
        FROM episodes e
        JOIN productions p ON p.id = e.production_id
        WHERE e.id = content_purchase_requests.target_id
      )
    END
  )
  WHERE production_title_snapshot IS NULL OR trim(production_title_snapshot) = ''
`);

db.exec(`
  UPDATE content_purchase_requests
  SET production_slug_snapshot = COALESCE(
    NULLIF(production_slug_snapshot, ''),
    CASE
      WHEN target_type = 'production' THEN (
        SELECT slug
        FROM productions
        WHERE productions.id = content_purchase_requests.target_id
      )
      ELSE (
        SELECT p.slug
        FROM episodes e
        JOIN productions p ON p.id = e.production_id
        WHERE e.id = content_purchase_requests.target_id
      )
    END
  )
  WHERE production_slug_snapshot IS NULL OR trim(production_slug_snapshot) = ''
`);

db.exec(`
  UPDATE content_purchase_requests
  SET episode_number_snapshot = COALESCE(
    episode_number_snapshot,
    (
      SELECT episode_number
      FROM episodes
      WHERE episodes.id = content_purchase_requests.target_id
    )
  )
  WHERE target_type = 'episode'
    AND episode_number_snapshot IS NULL
`);

db.exec(`
  UPDATE promo_codes
  SET updated_at = COALESCE(updated_at, created_at, datetime('now'))
`);

// Legacy rows created before access groups were configured correctly may end up
// as "subscription" with tier 0, which breaks catalog filtering and labels.
db.exec(`
  UPDATE productions
  SET access_group = 'free'
  WHERE access_group = 'subscription'
    AND COALESCE(required_tier, 0) <= 0
`);
if (!hasColumn('comments', 'status')) {
  db.exec(`ALTER TABLE comments ADD COLUMN status TEXT DEFAULT 'published'`);
}
if (!hasColumn('comments', 'moderation_reason')) {
  db.exec(`ALTER TABLE comments ADD COLUMN moderation_reason TEXT`);
}
if (!hasColumn('comments', 'moderated_at')) {
  db.exec(`ALTER TABLE comments ADD COLUMN moderated_at TEXT`);
}
if (!hasColumn('comments', 'moderated_by')) {
  db.exec(`ALTER TABLE comments ADD COLUMN moderated_by INTEGER`);
}
if (!hasColumn('comments', 'deleted_at')) {
  db.exec(`ALTER TABLE comments ADD COLUMN deleted_at TEXT`);
}
if (!hasColumn('comments', 'deleted_by')) {
  db.exec(`ALTER TABLE comments ADD COLUMN deleted_by INTEGER`);
}

db.exec(`
  UPDATE comments
  SET status = 'published'
  WHERE status IS NULL OR trim(status) = ''
`);

db.exec(`
  UPDATE refresh_tokens
  SET last_used_at = COALESCE(last_used_at, created_at, datetime('now'))
`);

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_watchlist_user ON watchlist(user_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_watchlist_prod ON watchlist(production_id);
  CREATE INDEX IF NOT EXISTS idx_watch_history_user ON watch_history(user_id, last_watched_at);
  CREATE INDEX IF NOT EXISTS idx_watch_history_episode ON watch_history(episode_id);
  CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
  CREATE INDEX IF NOT EXISTS idx_users_plan ON users(subscription_plan_id);
  CREATE INDEX IF NOT EXISTS idx_productions_active_sort ON productions(is_active, sort_order, created_at);
  CREATE INDEX IF NOT EXISTS idx_productions_group ON productions(access_group, required_tier);
  CREATE INDEX IF NOT EXISTS idx_episodes_prod_active ON episodes(production_id, is_active, episode_number);
  CREATE INDEX IF NOT EXISTS idx_episodes_active_created ON episodes(is_active, created_at DESC, id DESC);
  CREATE INDEX IF NOT EXISTS idx_episodes_active_published_created ON episodes(is_active, published_at, created_at DESC, id DESC);
  CREATE INDEX IF NOT EXISTS idx_episodes_prod_active_published ON episodes(production_id, is_active, published_at, episode_number);
  CREATE INDEX IF NOT EXISTS idx_episodes_group ON episodes(access_group);
  CREATE INDEX IF NOT EXISTS idx_reactions_episode ON reactions(episode_id);
  CREATE INDEX IF NOT EXISTS idx_payments_created ON payment_references(created_at);
  CREATE INDEX IF NOT EXISTS idx_payments_user_status ON payment_references(user_id, status, created_at);
  CREATE INDEX IF NOT EXISTS idx_payments_status_created ON payment_references(status, created_at);
  CREATE INDEX IF NOT EXISTS idx_content_purchase_requests_created ON content_purchase_requests(created_at);
  CREATE INDEX IF NOT EXISTS idx_content_purchase_requests_user_status ON content_purchase_requests(user_id, status, created_at);
  CREATE INDEX IF NOT EXISTS idx_content_purchase_requests_status_created ON content_purchase_requests(status, created_at);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_content_purchase_requests_pending_target ON content_purchase_requests(user_id, target_type, target_id) WHERE status = 'pending';
  CREATE INDEX IF NOT EXISTS idx_content_entitlements_user_target ON content_entitlements(user_id, target_type, target_id);
  CREATE INDEX IF NOT EXISTS idx_content_entitlements_request ON content_entitlements(source_request_id);
  CREATE INDEX IF NOT EXISTS idx_tokens_user ON refresh_tokens(user_id, expires_at);
  CREATE INDEX IF NOT EXISTS idx_tokens_user_jti ON refresh_tokens(user_id, jti);
  CREATE INDEX IF NOT EXISTS idx_tokens_jti ON refresh_tokens(jti);
  CREATE INDEX IF NOT EXISTS idx_auth_exchange_code ON auth_exchange_codes(code, expires_at);
  CREATE INDEX IF NOT EXISTS idx_admin_audit_created ON admin_audit_logs(created_at);
  CREATE INDEX IF NOT EXISTS idx_admin_audit_admin_created ON admin_audit_logs(admin_user_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_admin_audit_entity_created ON admin_audit_logs(entity_type, created_at);
  CREATE INDEX IF NOT EXISTS idx_admin_audit_action_created ON admin_audit_logs(action, created_at);
  CREATE INDEX IF NOT EXISTS idx_comments_episode ON comments(episode_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_comments_status_created ON comments(status, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_comments_user_created ON comments(user_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, is_read, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_media_assets_created ON media_assets(created_at DESC, id DESC);
  CREATE INDEX IF NOT EXISTS idx_media_assets_created_by ON media_assets(created_by, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_users_discord_id ON users(discord_id);
  CREATE INDEX IF NOT EXISTS idx_productions_slug ON productions(slug);
  CREATE INDEX IF NOT EXISTS idx_promo_codes_code ON promo_codes(code, is_active);
  CREATE INDEX IF NOT EXISTS idx_support_tickets_user ON support_tickets(user_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_ratings_target ON ratings(target_type, target_id);
  CREATE INDEX IF NOT EXISTS idx_ratings_user ON ratings(user_id);
  CREATE INDEX IF NOT EXISTS idx_promotions_active_dates ON promotions(is_active, starts_at, ends_at);
  CREATE INDEX IF NOT EXISTS idx_promotion_usages_user ON promotion_usages(user_id, promotion_id);
  CREATE INDEX IF NOT EXISTS idx_purchase_wishlist_user ON purchase_wishlist(user_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_purchase_wishlist_target ON purchase_wishlist(target_type, target_id);
  CREATE INDEX IF NOT EXISTS idx_gift_codes_code ON gift_codes(code);
  CREATE INDEX IF NOT EXISTS idx_gift_codes_sender ON gift_codes(sender_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_gift_codes_recipient ON gift_codes(recipient_id);
  CREATE INDEX IF NOT EXISTS idx_referral_rewards_referrer ON referral_rewards(referrer_id, applied);
  CREATE INDEX IF NOT EXISTS idx_watch_parties_code ON watch_parties(invite_code);
  CREATE INDEX IF NOT EXISTS idx_watch_parties_host ON watch_parties(host_id, status);
  CREATE INDEX IF NOT EXISTS idx_watch_party_messages_party ON watch_party_messages(party_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_users_referral_code ON users(referral_code);
  `);

db.exec(`
  UPDATE promo_codes
  SET uses_count = (
    SELECT COUNT(*)
    FROM payment_references pr
    WHERE pr.promo_code_id = promo_codes.id
      AND pr.status = 'confirmed'
  )
  `);

const insertSetting = db.prepare('INSERT OR IGNORE INTO site_settings (key, value) VALUES (?, ?)');
const defaultSettings = {
  site_name: 'Платформа',
  site_tagline: 'Стрийминг платформа',
  live_badge_text: 'На живо',
  iban: '',
  payment_info: 'Преведете сумата по посочения IBAN с точно основание.',
  hero_image: '',
  hero_title: 'Гледай най-новите формати',
  hero_subtitle: 'Премиум онлайн платформа за видео съдържание',
  home_hero_accent_label: 'Акцент',
  home_hero_production_ids: '[]',
  landing_badge_text: 'Премиум стрийминг',
  landing_title: 'Платформа',
  landing_subtitle: 'Платформа за сериали, трейлъри и ексклузивно съдържание',
  landing_description: 'Влез с Discord и отключи достъп до пълната библиотека.',
  landing_disclaimer: 'Достъпът до съдържанието зависи от активния план.',
  landing_button_text: 'Вход с Discord',
  landing_feature_1: 'Оригинални формати и ексклузивни продукции',
  landing_feature_2: 'Гъвкави планове и автоматична калкулация на сума',
  landing_feature_3: 'Бърза активация след потвърждение от екипа',
  landing_reason_title: 'Защо тази платформа',
  footer_note: 'Всички права запазени.',
  home_latest_title: 'Най-нови епизоди',
  home_free_title: 'Безплатна секция',
  home_premium_title: 'Премиум секция',
  subscribe_title: 'Абонаменти',
  subscribe_subtitle: 'Изберете план и генерирайте основание за плащане',
  // Navigation
  nav_label_home: 'Начало',
  nav_label_catalog: 'Каталог',
  nav_label_calendar: 'График',
  nav_label_subscribe: 'Абонаменти',
  nav_label_profile: 'Профил',
  nav_label_admin_zone: 'Административна зона',
  // Profile page
  profile_badge_text: 'Публичен профил',
  profile_title: 'Профил',
  profile_description: 'Тук управляваш видимите данни и статуса на достъпа си.',
  profile_active_plan_label: 'Активен план',
  profile_manage_label: 'Управление',
  profile_valid_until_label: 'Валиден до',
  profile_member_since_label: 'Член от',
  profile_status_title: 'Статус',
  profile_status_description: 'Абонаментите се активират ръчно от админ след потвърден превод с основание.',
  profile_upgrade_button: 'Надгради плана си',
  // Catalog page
  catalog_badge_text: 'Каталог',
  catalog_title: 'Каталог продукции',
  catalog_description: 'Разгледай по категории: безплатни, трейлъри и абонаментни формати.',
  catalog_search_placeholder: 'Търси заглавие...',
  catalog_empty_title: 'Няма резултати',
  catalog_empty_watchlist: 'Нямаш любими продукции',
  // Subscribe page extras
  subscribe_badge_text: 'Премиум достъп',
  subscribe_step_plan: 'Избери план',
  subscribe_step_promo: 'Промо код',
  subscribe_step_payment: 'Плащане',
  subscribe_popular_label: 'Популярен',
  subscribe_tier_prefix: 'Ниво',
  subscribe_promo_placeholder: 'напр. NANCY10',
  subscribe_my_requests_title: 'Моите заявки',
  // Access group labels
  access_label_free: 'Безплатно',
  access_label_trailer: 'Трейлър',
  access_label_subscription: 'Абонамент',
  // Homepage extras
  home_continue_watching_title: 'Продължи гледането',
  home_trailer_title: 'Трейлъри',
  home_empty_free: 'Няма безплатно съдържание в момента.',
  // Character name page
  character_name_title: 'Профилно име',
  character_name_subtitle: 'Това име ще се вижда в цялата платформа.',
  // Logo & Favicon
  site_logo: '',
  site_favicon: '',
  // Maintenance mode
  maintenance_mode: 'false',
  maintenance_message: 'Платформата е в режим на поддръжка. Моля, опитайте по-късно.',
  // Announcement banner
  announcement_enabled: 'false',
  announcement_text: '',
  announcement_type: 'info',
  // New Configurable Texts
  login_marquee_text: 'ЕКСКЛУЗИВЕН КАТАЛОГ СЪДЪРЖАНИЕ ПРЕМИУМ ЕПИЗОДИ',
  login_floating_badge: 'Нови епизоди всяка седмица',
  login_bottom_text: 'Кино изживяване на ново ниво',
  home_hero_pill_1: 'НОВО',
  home_hero_pill_2: 'ВСЯКА СЕДМИЦА',
  home_hero_button_1: 'Гледай сега',
  home_hero_button_2: 'Виж плановете',
  home_empty_title: 'Скоро стартираме',
  home_empty_subtitle: 'Все още няма публикувани продукции. Провери отново след малко.',
  home_metric_productions: 'Продукции',
  footer_made_with: 'за общността',
  footer_premium_experience: 'Premium Streaming Experience',
  calendar_title: 'Календар',
  calendar_subtitle: 'Следете графика на предстоящите епизоди и премиери. Никога не пропускайте ново видео от любимите си продукции.',
  calendar_empty: 'Няма информация за графика в момента.',
  faq_title: 'Често задавани въпроси',
  faq_description: 'Имаш въпроси относно плащания, достъп или съдържание? Тук сме събрали най-полезната информация за теб.',
  faq_items: '',
  comments_title: 'Дискусия',
  comments_placeholder: 'Напиши коментар...',
  comments_empty: 'Все още няма коментари. Бъдете първи!',
  notifications_title: 'Известия',
  notifications_mark_read: 'Маркирай всички',
  notifications_empty: 'Няма нови известия',
  notifications_view: 'Виж',
  profile_stat_time: 'Гледано време',
  profile_stat_episodes: 'Започнати епизоди',
  profile_stat_recent: 'Последно гледани',
  // Live Stream Feature
  stream_platform: 'twitch',
  stream_channel: '',
  stream_is_live: 'false',
  stream_offline_message: 'В момента няма активен стрийм. Следете Discord канала за известия.',
};
for (const [key, value] of Object.entries(defaultSettings)) {
  insertSetting.run(key, value);
}

const settingFixes = [
  { key: 'landing_badge_text', fallback: 'Премиум стрийминг' },
  { key: 'landing_subtitle', fallback: 'Платформа за сериали, трейлъри и ексклузивно съдържание' },
  { key: 'landing_description', fallback: 'Влез с Discord и отключи достъп до пълната библиотека.' },
  { key: 'landing_disclaimer', fallback: 'Достъпът до съдържанието зависи от активния план.' },
  {
    key: 'landing_feature_1',
    fallback: 'Оригинални формати и ексклузивни продукции',
    oldValue: 'The Bachelor, Traitors и още оригинални продукции',
  },
  { key: 'landing_feature_2', fallback: 'Гъвкави планове и автоматична калкулация на сума' },
  { key: 'landing_feature_3', fallback: 'Бърза активация след потвърждение от екипа' },
  { key: 'hero_subtitle', fallback: 'Премиум онлайн платформа за видео съдържание' },
  { key: 'login_marquee_text', fallback: 'ЕКСКЛУЗИВЕН КАТАЛОГ СЪДЪРЖАНИЕ ПРЕМИУМ ЕПИЗОДИ' },
  { key: 'login_floating_badge', fallback: 'Нови епизоди всяка седмица' },
  { key: 'login_bottom_text', fallback: 'Кино изживяване на ново ниво' },
  { key: 'home_hero_pill_1', fallback: 'НОВО' },
  { key: 'home_hero_pill_2', fallback: 'ВСЯКА СЕДМИЦА' },
  { key: 'home_hero_button_1', fallback: 'Гледай сега' },
  { key: 'home_hero_button_2', fallback: 'Виж плановете' },
  { key: 'home_empty_title', fallback: 'Скоро стартираме' },
  { key: 'home_empty_subtitle', fallback: 'Все още няма публикувани продукции. Провери отново след малко.' },
  { key: 'home_metric_productions', fallback: 'Продукции' },
  { key: 'footer_made_with', fallback: 'за общността' },
  { key: 'footer_premium_experience', fallback: 'Premium Streaming Experience' },
  { key: 'stream_platform', fallback: 'twitch' },
  { key: 'stream_channel', fallback: '' },
  { key: 'stream_is_live', fallback: 'false' },
  { key: 'stream_offline_message', fallback: 'В момента няма активен стрийм. Следете Discord канала за известия.' },
];
const updateSetting = db.prepare('UPDATE site_settings SET value = ? WHERE key = ?');
const forbiddenMarker = `${String.fromCharCode(82)}${String.fromCharCode(80)} `;
const forbiddenSecondary = `${String.fromCharCode(79)}${String.fromCharCode(79)}${String.fromCharCode(67)} `;
for (const fix of settingFixes) {
  const row = db.prepare('SELECT value FROM site_settings WHERE key = ?').get(fix.key);
  if (!row) continue;
  const current = String(row.value || '');
  const normalized = current.toUpperCase();
  const hasForbiddenWords =
    normalized.includes(forbiddenMarker) || normalized.includes(forbiddenSecondary);
  const isExplicitOldValue = fix.oldValue && current === fix.oldValue;
  if (hasForbiddenWords || isExplicitOldValue) {
    updateSetting.run(fix.fallback, fix.key);
  }
}

export default db;

// ─── Periodic cleanup (every hour) ───
const CLEANUP_INTERVAL = 60 * 60 * 1000;
setInterval(() => {
  try {
    db.prepare(`DELETE FROM refresh_tokens WHERE replace(replace(expires_at, 'T', ' '), 'Z', '') <= datetime('now')`).run();
    db.prepare(`DELETE FROM auth_exchange_codes WHERE replace(replace(expires_at, 'T', ' '), 'Z', '') <= datetime('now') OR used_at IS NOT NULL`).run();
  } catch { /* DB may be closed during shutdown */ }
}, CLEANUP_INTERVAL).unref();
