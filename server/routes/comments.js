import { Router } from 'express';
import db from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// Get comments for an episode
router.get('/episode/:episodeId', (req, res) => {
    const { episodeId } = req.params;
    const comments = db.prepare(`
    SELECT c.id, c.content, c.created_at, c.user_id,
           u.discord_username, u.discord_avatar, u.character_name, u.role
    FROM comments c
    JOIN users u ON c.user_id = u.id
    WHERE c.episode_id = ?
    ORDER BY c.created_at DESC
  `).all(episodeId);

    res.json(comments);
});

// Create a new comment
router.post('/', requireAuth, (req, res) => {
    const { episode_id, content } = req.body;
    if (!episode_id || !content || content.trim().length === 0) {
        return res.status(400).json({ error: 'Епизодът и съдържанието са задължителни' });
    }

    const result = db.prepare(`
    INSERT INTO comments (episode_id, user_id, content)
    VALUES (?, ?, ?)
  `).run(episode_id, req.user.id, content.trim());

    const newComment = db.prepare(`
    SELECT c.id, c.content, c.created_at, c.user_id,
           u.discord_username, u.discord_avatar, u.character_name, u.role
    FROM comments c
    JOIN users u ON c.user_id = u.id
    WHERE c.id = ?
  `).get(result.lastInsertRowid);

    res.status(201).json(newComment);
});

// Delete a comment
router.delete('/:id', requireAuth, (req, res) => {
    const commentId = req.params.id;
    const comment = db.prepare('SELECT user_id FROM comments WHERE id = ?').get(commentId);

    if (!comment) {
        return res.status(404).json({ error: 'Коментарът не е намерен' });
    }

    const isAdmin = req.user.role === 'admin' || req.user.role === 'superadmin';
    if (comment.user_id !== req.user.id && !isAdmin) {
        return res.status(403).json({ error: 'Нямате права да изтриете този коментар' });
    }

    db.prepare('DELETE FROM comments WHERE id = ?').run(commentId);
    res.json({ success: true });
});

export default router;
