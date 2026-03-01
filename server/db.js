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
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS promo_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    discount_percent INTEGER NOT NULL,
    is_active INTEGER DEFAULT 1,
    uses_count INTEGER DEFAULT 0,
    max_uses INTEGER,
    expires_at TEXT,
    created_at TEXT DEFAULT (datetime('now'))
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

  CREATE TABLE IF NOT EXISTS refresh_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token TEXT UNIQUE NOT NULL,
    expires_at TEXT NOT NULL,
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
`);

function hasColumn(table, column) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some((item) => item.name === column);
}

if (!hasColumn('productions', 'access_group')) {
  db.exec(`ALTER TABLE productions ADD COLUMN access_group TEXT DEFAULT 'subscription'`);
}
if (!hasColumn('episodes', 'access_group')) {
  db.exec(`ALTER TABLE episodes ADD COLUMN access_group TEXT DEFAULT 'inherit'`);
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

if (!hasColumn('subscription_plans', 'duration_days')) {
  db.exec(`ALTER TABLE subscription_plans ADD COLUMN duration_days INTEGER DEFAULT 30`);
}

if (!hasColumn('subscription_plans', 'is_popular')) {
  db.exec(`ALTER TABLE subscription_plans ADD COLUMN is_popular INTEGER DEFAULT 0`);
}

if (!hasColumn('productions', 'genres')) {
  db.exec(`ALTER TABLE productions ADD COLUMN genres TEXT DEFAULT '[]'`);
}

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
  CREATE INDEX IF NOT EXISTS idx_tokens_user ON refresh_tokens(user_id, expires_at);
  CREATE INDEX IF NOT EXISTS idx_auth_exchange_code ON auth_exchange_codes(code, expires_at);
  CREATE INDEX IF NOT EXISTS idx_admin_audit_created ON admin_audit_logs(created_at);
  CREATE INDEX IF NOT EXISTS idx_admin_audit_admin_created ON admin_audit_logs(admin_user_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_admin_audit_entity_created ON admin_audit_logs(entity_type, created_at);
  CREATE INDEX IF NOT EXISTS idx_admin_audit_action_created ON admin_audit_logs(action, created_at);
  CREATE INDEX IF NOT EXISTS idx_comments_episode ON comments(episode_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_comments_status_created ON comments(status, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_comments_user_created ON comments(user_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, is_read, created_at DESC);
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
