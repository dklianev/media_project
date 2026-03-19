import { Router } from 'express';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import db from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { getCurrentSofiaDbTimestamp } from '../utils/sofiaTime.js';
import { evaluateEpisodeAccess, getUserPurchaseState } from '../utils/contentPurchases.js';

const router = Router();

const partyLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  keyGenerator: (req) => `wp-${req.user?.id || 'anon'}`,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Твърде много заявки. Опитай отново след малко.' },
});

function generateInviteCode() {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

// Create a watch party
router.post('/create', requireAuth, partyLimiter, (req, res) => {
  const { episode_id, max_participants } = req.body || {};
  const episodeId = Number(episode_id);
  if (!Number.isFinite(episodeId) || episodeId <= 0) {
    return res.status(400).json({ error: 'Невалиден епизод.' });
  }

  // Verify episode exists and user has access
  const episode = db.prepare(`
    SELECT e.id, e.title, e.production_id, e.access_group,
           p.required_tier, p.access_group as production_access_group,
           p.purchase_mode as production_purchase_mode,
           p.purchase_price as production_purchase_price,
           e.purchase_enabled, e.purchase_price
    FROM episodes e
    JOIN productions p ON p.id = e.production_id
    WHERE e.id = ? AND e.is_active = 1 AND p.is_active = 1
  `).get(episodeId);

  if (!episode) {
    return res.status(404).json({ error: 'Епизодът не е намерен.' });
  }

  const purchaseState = getUserPurchaseState(req.user.id);
  const access = evaluateEpisodeAccess(episode, req.user, purchaseState);
  if (!access.hasAccess) {
    return res.status(403).json({ error: 'Нямаш достъп до този епизод.' });
  }

  // Check no active party by this host
  const existingParty = db.prepare(
    "SELECT id FROM watch_parties WHERE host_id = ? AND status = 'active'"
  ).get(req.user.id);
  if (existingParty) {
    return res.status(400).json({ error: 'Вече имаш активна watch party.', party_id: existingParty.id });
  }

  const inviteCode = generateInviteCode();
  const maxPart = Math.min(Math.max(2, Number(max_participants) || 10), 20);

  const result = db.prepare(`
    INSERT INTO watch_parties (host_id, episode_id, invite_code, max_participants)
    VALUES (?, ?, ?, ?)
  `).run(req.user.id, episodeId, inviteCode, maxPart);

  // Add host as participant
  db.prepare(`
    INSERT INTO watch_party_participants (party_id, user_id)
    VALUES (?, ?)
  `).run(result.lastInsertRowid, req.user.id);

  res.status(201).json({
    success: true,
    party_id: result.lastInsertRowid,
    invite_code: inviteCode,
    episode_title: episode.title,
  });
});

// Get party info by invite code
router.get('/:code', requireAuth, (req, res) => {
  const party = db.prepare(`
    SELECT wp.*,
           e.title as episode_title, e.youtube_video_id, e.video_source, e.local_video_url,
           u.character_name as host_name, u.discord_avatar as host_avatar
    FROM watch_parties wp
    JOIN episodes e ON e.id = wp.episode_id
    JOIN users u ON u.id = wp.host_id
    WHERE wp.invite_code = ?
  `).get(req.params.code);

  if (!party) {
    return res.status(404).json({ error: 'Watch party не е намерена.' });
  }

  const participants = db.prepare(`
    SELECT wpp.user_id, wpp.joined_at, u.character_name, u.discord_avatar
    FROM watch_party_participants wpp
    JOIN users u ON u.id = wpp.user_id
    WHERE wpp.party_id = ? AND wpp.left_at IS NULL
  `).all(party.id);

  const messages = db.prepare(`
    SELECT wpm.*, u.character_name, u.discord_avatar
    FROM watch_party_messages wpm
    JOIN users u ON u.id = wpm.user_id
    WHERE wpm.party_id = ?
    ORDER BY wpm.created_at DESC
    LIMIT 100
  `).all(party.id);

  res.json({ ...party, participants, messages: messages.reverse() });
});

// Join a watch party
router.post('/:code/join', requireAuth, partyLimiter, (req, res) => {
  const party = db.prepare(
    "SELECT * FROM watch_parties WHERE invite_code = ? AND status = 'active'"
  ).get(req.params.code);

  if (!party) {
    return res.status(404).json({ error: 'Watch party не е намерена или е приключила.' });
  }

  // Check participant count
  const currentCount = db.prepare(
    'SELECT COUNT(*) as count FROM watch_party_participants WHERE party_id = ? AND left_at IS NULL'
  ).get(party.id)?.count || 0;

  if (currentCount >= party.max_participants) {
    return res.status(400).json({ error: 'Watch party е пълна.' });
  }

  try {
    db.prepare(`
      INSERT INTO watch_party_participants (party_id, user_id)
      VALUES (?, ?)
    `).run(party.id, req.user.id);
  } catch (err) {
    if (err.message?.includes('UNIQUE constraint')) {
      // Already joined, update left_at to null
      db.prepare(
        'UPDATE watch_party_participants SET left_at = NULL, joined_at = ? WHERE party_id = ? AND user_id = ?'
      ).run(getCurrentSofiaDbTimestamp(), party.id, req.user.id);
    } else {
      throw err;
    }
  }

  res.json({ success: true, party_id: party.id });
});

// Leave a watch party
router.post('/:code/leave', requireAuth, (req, res) => {
  const party = db.prepare('SELECT id FROM watch_parties WHERE invite_code = ?').get(req.params.code);
  if (!party) return res.status(404).json({ error: 'Watch party не е намерена.' });

  db.prepare(
    'UPDATE watch_party_participants SET left_at = ? WHERE party_id = ? AND user_id = ? AND left_at IS NULL'
  ).run(getCurrentSofiaDbTimestamp(), party.id, req.user.id);

  res.json({ success: true });
});

// Send chat message
router.post('/:code/message', requireAuth, partyLimiter, (req, res) => {
  const party = db.prepare(
    "SELECT id FROM watch_parties WHERE invite_code = ? AND status = 'active'"
  ).get(req.params.code);
  if (!party) return res.status(404).json({ error: 'Watch party не е намерена.' });

  const message = String(req.body?.message || '').trim().slice(0, 500);
  if (!message) return res.status(400).json({ error: 'Съобщението е празно.' });

  // Must be a participant
  const isParticipant = db.prepare(
    'SELECT 1 FROM watch_party_participants WHERE party_id = ? AND user_id = ? AND left_at IS NULL'
  ).get(party.id, req.user.id);
  if (!isParticipant) return res.status(403).json({ error: 'Не си участник в тази watch party.' });

  const result = db.prepare(`
    INSERT INTO watch_party_messages (party_id, user_id, message)
    VALUES (?, ?, ?)
  `).run(party.id, req.user.id, message);

  res.status(201).json({
    success: true,
    message_id: result.lastInsertRowid,
    character_name: req.user.character_name,
    message,
  });
});

// End a watch party (host only)
router.put('/:code/end', requireAuth, (req, res) => {
  const party = db.prepare(
    "SELECT * FROM watch_parties WHERE invite_code = ? AND status = 'active'"
  ).get(req.params.code);
  if (!party) return res.status(404).json({ error: 'Watch party не е намерена.' });
  if (party.host_id !== req.user.id) return res.status(403).json({ error: 'Само домакинът може да приключи watch party.' });

  db.prepare(
    "UPDATE watch_parties SET status = 'ended', ended_at = ? WHERE id = ?"
  ).run(getCurrentSofiaDbTimestamp(), party.id);

  res.json({ success: true });
});

export default router;
