import db from '../db.js';

/**
 * Create a single notification for a user.
 * @param {number} userId
 * @param {{ type?: string, title: string, message?: string, link?: string, metadata?: object }} options
 */
export function createNotification(userId, { type, title, message, link, metadata }) {
  if (!userId || !title) return;
  db.prepare(`
    INSERT INTO notifications (user_id, type, title, message, link, metadata)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(userId, type || null, title, message || null, link || null, metadata ? JSON.stringify(metadata) : null);
}

/**
 * Create notifications for multiple users at once (e.g., new episode for watchlist users).
 * @param {number[]} userIds
 * @param {{ type?: string, title: string, message?: string, link?: string, metadata?: object }} options
 */
export function createBulkNotifications(userIds, { type, title, message, link, metadata }) {
  if (!userIds?.length || !title) return;
  const insert = db.prepare(`
    INSERT INTO notifications (user_id, type, title, message, link, metadata)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const metadataJson = metadata ? JSON.stringify(metadata) : null;
  const insertMany = db.transaction((ids) => {
    for (const userId of ids) {
      insert.run(userId, type || null, title, message || null, link || null, metadataJson);
    }
  });
  insertMany(userIds);
}

/**
 * Check if a notification of the given type was already sent to this user recently.
 * Prevents duplicate notifications (e.g., subscription expiring reminder).
 * @param {number} userId
 * @param {string} type
 * @param {number} withinHours - how many hours to look back
 * @returns {boolean}
 */
export function hasRecentNotification(userId, type, withinHours = 24) {
  const row = db.prepare(`
    SELECT 1
    FROM notifications
    WHERE user_id = ?
      AND type = ?
      AND created_at >= datetime('now', '-' || ? || ' hours')
    LIMIT 1
  `).get(userId, type, withinHours);
  return Boolean(row);
}
