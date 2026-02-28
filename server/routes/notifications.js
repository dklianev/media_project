import { Router } from 'express';
import db from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// Get current user's notifications
router.get('/', requireAuth, (req, res) => {
    const notifications = db.prepare(`
    SELECT * FROM notifications 
    WHERE user_id = ? 
    ORDER BY created_at DESC 
    LIMIT 50
  `).all(req.user.id);
    res.json(notifications);
});

// Mark a notification as read
router.put('/:id/read', requireAuth, (req, res) => {
    db.prepare(`
    UPDATE notifications 
    SET is_read = 1 
    WHERE id = ? AND user_id = ?
  `).run(req.params.id, req.user.id);
    res.json({ success: true });
});

// Mark all notifications as read
router.put('/read-all', requireAuth, (req, res) => {
    db.prepare(`
    UPDATE notifications 
    SET is_read = 1 
    WHERE user_id = ?
  `).run(req.user.id);
    res.json({ success: true });
});

export default router;
