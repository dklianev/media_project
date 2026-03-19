import db from '../db.js';
import { createNotification, hasRecentNotification } from './notifications.js';
import { getCurrentSofiaDbTimestamp, getShiftedSofiaDbTimestamp } from './sofiaTime.js';

const ONE_HOUR = 60 * 60 * 1000;
const SIX_HOURS = 6 * ONE_HOUR;

/**
 * Check for users whose subscription expires within 3 days and notify them.
 */
function checkSubscriptionExpiring() {
  console.log('[notificationCron] Checking for expiring subscriptions...');

  const now = getCurrentSofiaDbTimestamp();
  const threeDaysLater = getShiftedSofiaDbTimestamp(3);

  const users = db.prepare(`
    SELECT id, subscription_expires_at
    FROM users
    WHERE subscription_expires_at IS NOT NULL
      AND subscription_expires_at > ?
      AND subscription_expires_at <= ?
  `).all(now, threeDaysLater);

  let sent = 0;
  for (const user of users) {
    if (hasRecentNotification(user.id, 'subscription_expiring', 24)) continue;

    const expiresAt = new Date(user.subscription_expires_at.replace(' ', 'T') + 'Z');
    const nowDate = new Date();
    const diffMs = expiresAt.getTime() - nowDate.getTime();
    const daysRemaining = Math.max(1, Math.ceil(diffMs / (24 * 60 * 60 * 1000)));

    createNotification(user.id, {
      type: 'subscription_expiring',
      title: 'Абонаментът ти изтича скоро',
      message: `Остават ти ${daysRemaining} ${daysRemaining === 1 ? 'ден' : 'дни'} до края на абонамента.`,
      link: '/subscribe',
    });
    sent++;
  }

  console.log(`[notificationCron] Subscription expiring: notified ${sent} user(s).`);
}

/**
 * Check for users who started watching an episode but haven't returned in 2-7 days.
 */
function checkContinueWatching() {
  console.log('[notificationCron] Checking for continue-watching reminders...');

  const twoDaysAgo = getShiftedSofiaDbTimestamp(-2);
  const sevenDaysAgo = getShiftedSofiaDbTimestamp(-7);

  const rows = db.prepare(`
    SELECT wh.user_id, wh.episode_id, e.title AS episode_title,
           e.episode_number, p.slug AS production_slug
    FROM watch_history wh
    JOIN episodes e ON e.id = wh.episode_id
    JOIN productions p ON p.id = e.production_id
    WHERE wh.progress_seconds > 0
      AND wh.last_watched_at <= ?
      AND wh.last_watched_at >= ?
  `).all(twoDaysAgo, sevenDaysAgo);

  let sent = 0;
  for (const row of rows) {
    if (hasRecentNotification(row.user_id, 'continue_watching', 48)) continue;

    const episodeLink = `/productions/${row.production_slug}/episodes/${row.episode_number}`;

    createNotification(row.user_id, {
      type: 'continue_watching',
      title: 'Продължи да гледаш',
      message: `Не си довършил "${row.episode_title}". Продължи от там, където спря!`,
      link: episodeLink,
    });
    sent++;
  }

  console.log(`[notificationCron] Continue watching: notified ${sent} user(s).`);
}

/**
 * Start all notification cron jobs.
 * @returns {() => void} cleanup function that clears all intervals
 */
export function startNotificationCron() {
  console.log('[notificationCron] Starting notification cron jobs...');

  // Run immediately on startup, then on interval
  checkSubscriptionExpiring();
  checkContinueWatching();

  const subscriptionInterval = setInterval(checkSubscriptionExpiring, ONE_HOUR);
  const continueWatchingInterval = setInterval(checkContinueWatching, SIX_HOURS);

  return function cleanup() {
    console.log('[notificationCron] Stopping notification cron jobs.');
    clearInterval(subscriptionInterval);
    clearInterval(continueWatchingInterval);
  };
}
