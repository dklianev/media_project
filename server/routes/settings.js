import { Router } from 'express';
import db from '../db.js';
import { requireAdmin } from '../middleware/auth.js';
import { optimizeUploadedImages, upload } from '../middleware/upload.js';
import { logAdminAction } from '../utils/audit.js';

const router = Router();
const PUBLIC_KEYS = [
  'site_name',
  'site_tagline',
  'live_badge_text',
  'hero_image',
  'hero_title',
  'hero_subtitle',
  'landing_badge_text',
  'landing_title',
  'landing_subtitle',
  'landing_description',
  'landing_disclaimer',
  'landing_button_text',
  'landing_feature_1',
  'landing_feature_2',
  'landing_feature_3',
  'landing_reason_title',
  'footer_note',
  'home_latest_title',
  'home_free_title',
  'home_premium_title',
  'subscribe_title',
  'subscribe_subtitle',
  // Navigation
  'nav_label_home',
  'nav_label_catalog',
  'nav_label_calendar',
  'nav_label_subscribe',
  'nav_label_profile',
  'nav_label_admin_zone',
  // Profile page
  'profile_badge_text',
  'profile_title',
  'profile_description',
  'profile_active_plan_label',
  'profile_manage_label',
  'profile_valid_until_label',
  'profile_member_since_label',
  'profile_status_title',
  'profile_status_description',
  'profile_upgrade_button',
  // Catalog page
  'catalog_badge_text',
  'catalog_title',
  'catalog_description',
  'catalog_search_placeholder',
  'catalog_empty_title',
  'catalog_empty_watchlist',
  // Subscribe page extras
  'subscribe_badge_text',
  'subscribe_step_plan',
  'subscribe_step_promo',
  'subscribe_step_payment',
  'subscribe_popular_label',
  'subscribe_tier_prefix',
  'subscribe_promo_placeholder',
  'subscribe_my_requests_title',
  // Access group labels
  'access_label_free',
  'access_label_trailer',
  'access_label_subscription',
  // Homepage extras
  'home_continue_watching_title',
  'home_trailer_title',
  'home_empty_free',
  // Character name page
  'character_name_title',
  'character_name_subtitle',
  // Logo & Favicon
  'site_logo',
  'site_favicon',
  // Maintenance mode
  'maintenance_mode',
  'maintenance_message',
  // Announcement banner
  'announcement_enabled',
  'announcement_text',
  'announcement_type',
  // Admin-Configurable Features
  'login_marquee_text',
  'login_floating_badge',
  'login_bottom_text',
  'home_hero_pill_1',
  'home_hero_pill_2',
  'home_hero_button_1',
  'home_hero_button_2',
  'home_empty_title',
  'home_empty_subtitle',
  'home_metric_productions',
  'footer_made_with',
  'footer_premium_experience',
  'calendar_title',
  'calendar_subtitle',
  'calendar_empty',
  'faq_title',
  'faq_description',
  'faq_items',
  'comments_title',
  'comments_placeholder',
  'comments_empty',
  'notifications_title',
  'notifications_mark_read',
  'notifications_empty',
  'notifications_view',
  'profile_stat_time',
  'profile_stat_episodes',
  'profile_stat_recent',
  // Stream Feature
  'stream_platform',
  'stream_channel',
  'stream_is_live',
  'stream_offline_message',
];
const ADMIN_EDITABLE_KEYS = new Set([...PUBLIC_KEYS, 'iban', 'payment_info']);

router.get('/', requireAdmin, (req, res) => {
  const settings = db.prepare('SELECT * FROM site_settings').all();
  const result = {};
  for (const item of settings) result[item.key] = item.value;
  res.json(result);
});

router.get('/public', (req, res) => {
  const placeholders = PUBLIC_KEYS.map(() => '?').join(',');
  const rows = db.prepare(
    `SELECT * FROM site_settings WHERE key IN (${placeholders})`
  ).all(...PUBLIC_KEYS);

  const result = {};
  for (const item of rows) result[item.key] = item.value;
  res.set('Cache-Control', 'public, max-age=60');
  res.json(result);
});

router.put('/', requireAdmin, (req, res) => {
  const updates = req.body || {};
  const upsert = db.prepare(
    'INSERT INTO site_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?'
  );
  const rejected = [];
  const changed = [];

  const updateMany = db.transaction((entries) => {
    for (const [key, value] of entries) {
      if (!key || typeof key !== 'string') continue;
      if (!ADMIN_EDITABLE_KEYS.has(key)) {
        rejected.push(key);
        continue;
      }

      const limit = key === 'payment_info'
        ? 2000
        : key === 'faq_items'
          ? 20000
          : 500;
      const normalizedValue = String(value ?? '').slice(0, limit);
      const current = db.prepare('SELECT value FROM site_settings WHERE key = ?').get(key)?.value ?? '';
      if (String(current) !== normalizedValue) {
        changed.push(key);
      }
      upsert.run(key, normalizedValue, normalizedValue);
    }
  });

  updateMany(Object.entries(updates));
  if (changed.length > 0 || rejected.length > 0) {
    logAdminAction(req, {
      action: 'settings.update',
      entity_type: 'site_settings',
      entity_id: 'bulk',
      metadata: {
        changed_keys: changed,
        rejected_keys: rejected,
      },
    });
  }
  res.json({ success: true, rejected_keys: rejected });
});

router.post('/hero-image', requireAdmin, upload.single('image'), optimizeUploadedImages, (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Не е качено изображение' });
  }

  const url = `/uploads/${req.file.filename}`;
  db.prepare(`
    INSERT INTO site_settings (key, value)
    VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = ?
  `).run('hero_image', url, url);

  logAdminAction(req, {
    action: 'settings.hero_image.update',
    entity_type: 'site_settings',
    entity_id: 'hero_image',
    metadata: {
      url,
    },
  });
  res.json({ url });
});

router.post('/site-logo', requireAdmin, upload.single('image'), optimizeUploadedImages, (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Не е качено изображение' });
  }
  const url = `/uploads/${req.file.filename}`;
  db.prepare(
    'INSERT INTO site_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?'
  ).run('site_logo', url, url);
  logAdminAction(req, {
    action: 'settings.site_logo.update',
    entity_type: 'site_settings',
    entity_id: 'site_logo',
    metadata: { url },
  });
  res.json({ url });
});

router.post('/site-favicon', requireAdmin, upload.single('image'), optimizeUploadedImages, (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Не е качено изображение' });
  }
  const url = `/uploads/${req.file.filename}`;
  db.prepare(
    'INSERT INTO site_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?'
  ).run('site_favicon', url, url);
  logAdminAction(req, {
    action: 'settings.site_favicon.update',
    entity_type: 'site_settings',
    entity_id: 'site_favicon',
    metadata: { url },
  });
  res.json({ url });
});

export default router;
