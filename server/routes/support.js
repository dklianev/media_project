import express from 'express';
import db from '../db.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { logAdminAction } from '../utils/audit.js';

const router = express.Router();

// User: Create a new support ticket
router.post('/', requireAuth, (req, res) => {
    const { subject, message } = req.body;

    if (!subject || !message) {
        return res.status(400).json({ error: 'Темата и съобщението са задължителни' });
    }

    try {
        const stmt = db.prepare(`
      INSERT INTO support_tickets (user_id, subject, message, status)
      VALUES (?, ?, ?, 'open')
    `);
        const info = stmt.run(req.user.id, subject, message);

        // Also log this in notifications or just DB is fine, we'll keep it simple
        res.status(201).json({ success: true, ticketId: info.lastInsertRowid });
    } catch (err) {
        console.error('Error creating support ticket:', err);
        res.status(500).json({ error: 'Възникна грешка при изпращането' });
    }
});

// Admin: Get all tickets
router.get('/admin', requireAdmin, (req, res) => {
    try {
        const filterStatus = req.query.status;
        let query = `
      SELECT t.*, u.character_name as username, u.discord_username 
      FROM support_tickets t
      JOIN users u ON t.user_id = u.id
    `;
        let params = [];

        if (filterStatus && filterStatus !== 'all') {
            query += ` WHERE t.status = ?`;
            params.push(filterStatus);
        }

        query += ` ORDER BY t.created_at DESC`;

        const tickets = db.prepare(query).all(...params);
        res.json(tickets);
    } catch (err) {
        console.error('Error fetching support tickets:', err);
        res.status(500).json({ error: 'Възникна грешка при зареждане на запитванията' });
    }
});

// User & Admin: Get single ticket with thread
router.get('/:id', requireAuth, (req, res) => {
    try {
        const ticketId = req.params.id;
        // Get ticket info
        const ticket = db.prepare(`
      SELECT t.*, u.character_name as username, u.discord_username 
      FROM support_tickets t
      JOIN users u ON t.user_id = u.id
      WHERE t.id = ?
    `).get(ticketId);

        if (!ticket) {
            return res.status(404).json({ error: 'Запитването не е намерено' });
        }

        // Check if user is admin or the owner of the ticket
        if (req.user.role !== 'admin' && req.user.role !== 'superadmin' && ticket.user_id !== req.user.id) {
            return res.status(403).json({ error: 'Нямате достъп до това запитване' });
        }

        // Get thread messages
        const messages = db.prepare(`
      SELECT m.*, u.character_name as username, u.role
      FROM support_ticket_messages m
      JOIN users u ON m.user_id = u.id
      WHERE m.ticket_id = ?
      ORDER BY m.created_at ASC
    `).all(ticketId);

        res.json({ ticket, messages });
    } catch (err) {
        console.error('Error fetching ticket thread:', err);
        res.status(500).json({ error: 'Възникна грешка при зареждане на разговора' });
    }
});

// Admin: Update Status
router.put('/admin/:id/status', requireAdmin, (req, res) => {
    const { status } = req.body;
    if (!['open', 'closed'].includes(status)) {
        return res.status(400).json({ error: 'Невалиден статус' });
    }

    try {
        const ticket = db.prepare('SELECT id, status FROM support_tickets WHERE id = ?').get(req.params.id);
        if (!ticket) {
            return res.status(404).json({ error: 'Запитването не е намерено' });
        }

        const stmt = db.prepare('UPDATE support_tickets SET status = ? WHERE id = ?');
        stmt.run(status, req.params.id);

        logAdminAction(req, {
            action: 'support_ticket.update',
            entity_type: 'support_ticket',
            entity_id: req.params.id,
            metadata: {
                previous_status: ticket.status,
                new_status: status,
            }
        });

        res.json({ success: true });
    } catch (err) {
        console.error('Error updating ticket status:', err);
        res.status(500).json({ error: 'Възникна грешка при обновяване' });
    }
});

// User/Admin: Reply to ticket
router.post('/:id/reply', requireAuth, (req, res) => {
    const { replyText } = req.body;
    if (!replyText) {
        return res.status(400).json({ error: 'Отговорът не може да е празен' });
    }

    try {
        const ticketId = req.params.id;
        const ticket = db.prepare('SELECT * FROM support_tickets WHERE id = ?').get(ticketId);
        if (!ticket) return res.status(404).json({ error: 'Запитването не е намерено' });

        const isAdmin = req.user.role === 'admin' || req.user.role === 'superadmin';

        // Check ownership if not admin
        if (!isAdmin && ticket.user_id !== req.user.id) {
            return res.status(403).json({ error: 'Нямате достъп до това запитване' });
        }

        // Insert message
        db.prepare(`
            INSERT INTO support_ticket_messages (ticket_id, user_id, message)
            VALUES (?, ?, ?)
        `).run(ticketId, req.user.id, replyText);

        if (isAdmin) {
            // Admin replying - can close ticket or just leave open, here we'll assume marked as "answered" or closed
            db.prepare('UPDATE support_tickets SET status = ? WHERE id = ?').run('closed', ticketId);

            // Create a notification for the user
            const title = `Отговор на Вашето запитване: ${ticket.subject}`;
            db.prepare(`
                 INSERT INTO notifications (user_id, title, message, link)
                 VALUES (?, ?, ?, ?)
             `).run(ticket.user_id, title, replyText, `/support/${ticketId}`);

            logAdminAction(req, {
                action: 'support_ticket.reply',
                entity_type: 'support_ticket',
                entity_id: ticketId,
                metadata: { reply: replyText }
            });
        } else {
            // User replying - reopen ticket for admins to see
            db.prepare('UPDATE support_tickets SET status = ? WHERE id = ?').run('open', ticketId);
        }

        res.json({ success: true });
    } catch (err) {
        console.error('Error replying to ticket:', err);
        res.status(500).json({ error: 'Възникна грешка при изпращането на отговора' });
    }
});

export default router;
