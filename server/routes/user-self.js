import { Router } from 'express';
import db from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.get('/me/stats', requireAuth, (req, res) => {
  try {
    const stats = db.prepare(`
      SELECT
        SUM(progress_seconds) as total_watch_seconds,
        COUNT(DISTINCT episode_id) as episodes_started
      FROM watch_history
      WHERE user_id = ?
    `).get(req.user.id);

    const recentlyWatched = db.prepare(`
      SELECT
        e.id as episode_id,
        e.title as episode_title,
        e.thumbnail_url,
        e.duration_seconds,
        p.slug as production_slug,
        p.title as production_title,
        wh.progress_seconds,
        wh.last_watched_at
      FROM watch_history wh
      JOIN episodes e ON wh.episode_id = e.id
      JOIN productions p ON e.production_id = p.id
      WHERE wh.user_id = ?
      ORDER BY wh.last_watched_at DESC
      LIMIT 5
    `).all(req.user.id);

    const topProductions = db.prepare(`
      SELECT p.id, p.title, p.slug, p.thumbnail_url, COUNT(e.id) as eps_watched
      FROM watch_history wh
      JOIN episodes e ON wh.episode_id = e.id
      JOIN productions p ON e.production_id = p.id
      WHERE wh.user_id = ? AND wh.progress_seconds > 60
      GROUP BY p.id
      ORDER BY eps_watched DESC
      LIMIT 3
    `).all(req.user.id);

    res.json({
      total_watch_seconds: stats?.total_watch_seconds || 0,
      episodes_started: stats?.episodes_started || 0,
      recently_watched: recentlyWatched || [],
      top_productions: topProductions || [],
    });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ error: 'Грешка при зареждане на статистиката' });
  }
});

export default router;
