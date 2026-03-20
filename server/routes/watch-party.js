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
  message: { error: 'Твърде много заявки. Опитайте отново след малко.' },
});

const playbackLimiter = rateLimit({
  windowMs: 60_000,
  max: 180,
  keyGenerator: (req) => `wp-playback-${req.user?.id || 'anon'}`,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Твърде много playback sync заявки. Опитай отново след малко.' },
});

function generateInviteCode() {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

function endParty(partyId) {
  const endedAt = getCurrentSofiaDbTimestamp();
  db.prepare(
    "UPDATE watch_parties SET status = 'ended', ended_at = COALESCE(ended_at, ?) WHERE id = ?"
  ).run(endedAt, partyId);
  db.prepare(
    'UPDATE watch_party_participants SET left_at = COALESCE(left_at, ?) WHERE party_id = ? AND left_at IS NULL'
  ).run(endedAt, partyId);
}

function deleteParty(partyId) {
  db.prepare('DELETE FROM watch_party_messages WHERE party_id = ?').run(partyId);
  db.prepare('DELETE FROM watch_party_participants WHERE party_id = ?').run(partyId);
  db.prepare('DELETE FROM watch_parties WHERE id = ?').run(partyId);
}

function normalizePlaybackState(row) {
  return {
    playback_state: row?.playback_state || 'paused',
    playback_position_seconds: Number(row?.playback_position_seconds || 0),
    playback_updated_at: row?.playback_updated_at || null,
    playback_version: Number(row?.playback_version || 0),
  };
}

function checkPartyEpisodeAccess(episodeId, user) {
  const currentTimestamp = getCurrentSofiaDbTimestamp();
  const episode = db.prepare(`
    SELECT e.id, e.production_id, e.access_group,
           e.published_at, e.available_from, e.available_until,
           p.required_tier, p.access_group as production_access_group,
           p.purchase_mode as production_purchase_mode,
           p.purchase_price as production_purchase_price,
           p.available_from as production_available_from,
           p.available_until as production_available_until,
           e.purchase_enabled, e.purchase_price
    FROM episodes e
    JOIN productions p ON p.id = e.production_id
    WHERE e.id = ? AND e.is_active = 1 AND p.is_active = 1
      AND (e.published_at IS NULL OR e.published_at <= ?)
  `).get(episodeId, currentTimestamp);

  if (!episode) return false;
  const purchaseState = getUserPurchaseState(user.id);
  return evaluateEpisodeAccess(episode, user, purchaseState).hasAccess;
}

function getHostedActiveParty(userId) {
  return db.prepare(`
    SELECT wp.id,
           wp.host_id,
           wp.episode_id,
           wp.invite_code,
           wp.status,
           wp.max_participants,
           wp.playback_state,
           wp.playback_position_seconds,
           wp.playback_updated_at,
           wp.playback_version,
           wp.started_at,
           wp.created_at,
           e.title as episode_title,
           host_participant.left_at as host_left_at,
           COALESCE(active_participants.count, 0) as active_count
    FROM watch_parties wp
    JOIN episodes e ON e.id = wp.episode_id
    LEFT JOIN watch_party_participants host_participant
      ON host_participant.party_id = wp.id AND host_participant.user_id = wp.host_id
    LEFT JOIN (
      SELECT party_id, COUNT(*) as count
      FROM watch_party_participants
      WHERE left_at IS NULL
      GROUP BY party_id
    ) active_participants ON active_participants.party_id = wp.id
    WHERE wp.host_id = ? AND wp.status = 'active'
    ORDER BY wp.created_at DESC
    LIMIT 1
  `).get(userId);
}

function resolveHostedActiveParty(userId) {
  const party = getHostedActiveParty(userId);
  if (!party) return null;

  const hostHasLeft = Boolean(party.host_left_at);
  const hasActiveParticipants = Number(party.active_count || 0) > 0;
  if (hostHasLeft || !hasActiveParticipants) {
    endParty(party.id);
    return null;
  }

  return {
    id: party.id,
    host_id: party.host_id,
    episode_id: party.episode_id,
    invite_code: party.invite_code,
    status: party.status,
    max_participants: party.max_participants,
    started_at: party.started_at,
    created_at: party.created_at,
    episode_title: party.episode_title,
    participant_count: Number(party.active_count || 0),
    is_host: true,
    ...normalizePlaybackState(party),
  };
}

router.get('/mine/active', requireAuth, (req, res) => {
  const party = resolveHostedActiveParty(req.user.id);
  res.json({ success: true, party: party || null });
});

router.post('/create', requireAuth, partyLimiter, (req, res) => {
  const { episode_id, max_participants } = req.body || {};
  const episodeId = Number(episode_id);
  if (!Number.isFinite(episodeId) || episodeId <= 0) {
    return res.status(400).json({ error: 'Невалиден епизод.' });
  }

  const episode = db.prepare(`
    SELECT e.id, e.title, e.production_id, e.access_group,
           e.published_at, e.available_from, e.available_until,
           p.required_tier, p.access_group as production_access_group,
           p.purchase_mode as production_purchase_mode,
           p.purchase_price as production_purchase_price,
           p.available_from as production_available_from,
           p.available_until as production_available_until,
           e.purchase_enabled, e.purchase_price
    FROM episodes e
    JOIN productions p ON p.id = e.production_id
    WHERE e.id = ? AND e.is_active = 1 AND p.is_active = 1
      AND (e.published_at IS NULL OR e.published_at <= ?)
  `).get(episodeId, getCurrentSofiaDbTimestamp());

  if (!episode) {
    return res.status(404).json({ error: 'Епизодът не е намерен.' });
  }

  const purchaseState = getUserPurchaseState(req.user.id);
  const access = evaluateEpisodeAccess(episode, req.user, purchaseState);
  if (!access.hasAccess) {
    return res.status(403).json({ error: 'Нямате достъп до този епизод.' });
  }

  const existingParty = resolveHostedActiveParty(req.user.id);
  if (existingParty) {
    return res.status(400).json({
      error: 'Вече имате активен watch party.',
      party_id: existingParty.id,
      invite_code: existingParty.invite_code,
    });
  }

  const inviteCode = generateInviteCode();
  const maxPart = Math.min(Math.max(2, Number(max_participants) || 10), 20);
  const createdAt = getCurrentSofiaDbTimestamp();

  const result = db.prepare(`
    INSERT INTO watch_parties (
      host_id,
      episode_id,
      invite_code,
      max_participants,
      playback_state,
      playback_position_seconds,
      playback_updated_at,
      playback_version
    )
    VALUES (?, ?, ?, ?, 'paused', 0, ?, 0)
  `).run(req.user.id, episodeId, inviteCode, maxPart, createdAt);

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
    return res.status(404).json({ error: 'Watch party не е намерен.' });
  }

  const hasAccess = checkPartyEpisodeAccess(party.episode_id, req.user);

  const participants = db.prepare(`
    SELECT wpp.user_id, wpp.joined_at,
           u.character_name as display_name,
           u.character_name as username,
           u.character_name,
           u.discord_avatar,
           u.discord_avatar as avatar_url
    FROM watch_party_participants wpp
    JOIN users u ON u.id = wpp.user_id
    WHERE wpp.party_id = ? AND wpp.left_at IS NULL
  `).all(party.id);

  const messages = db.prepare(`
    SELECT wpm.id,
           wpm.party_id,
           wpm.user_id,
           wpm.message as content,
           wpm.message,
           wpm.created_at,
           u.character_name as display_name,
           u.character_name as username,
           u.character_name,
           u.discord_avatar,
           u.discord_avatar as avatar_url
    FROM watch_party_messages wpm
    JOIN users u ON u.id = wpm.user_id
    WHERE wpm.party_id = ?
    ORDER BY wpm.created_at DESC
    LIMIT 100
  `).all(party.id);

  const response = {
    ...party,
    is_host: party.host_id === req.user.id,
    participants,
    messages: messages.reverse(),
    ...normalizePlaybackState(party),
  };

  if (!hasAccess) {
    delete response.youtube_video_id;
    delete response.video_source;
    delete response.local_video_url;
    response.has_access = false;
  }

  res.json(response);
});

router.post('/:code/join', requireAuth, partyLimiter, (req, res) => {
  const party = db.prepare(
    "SELECT * FROM watch_parties WHERE invite_code = ? AND status = 'active'"
  ).get(req.params.code);

  if (!party) {
    return res.status(404).json({ error: 'Watch party не е активен или не съществува.' });
  }

  if (!checkPartyEpisodeAccess(party.episode_id, req.user)) {
    return res.status(403).json({ error: 'Нямате достъп до този епизод.' });
  }

  const currentCount = db.prepare(
    'SELECT COUNT(*) as count FROM watch_party_participants WHERE party_id = ? AND left_at IS NULL'
  ).get(party.id)?.count || 0;

  if (currentCount >= party.max_participants) {
    return res.status(400).json({ error: 'Watch party-то е пълно.' });
  }

  try {
    db.prepare(`
      INSERT INTO watch_party_participants (party_id, user_id)
      VALUES (?, ?)
    `).run(party.id, req.user.id);
  } catch (err) {
    if (err.message?.includes('UNIQUE constraint')) {
      db.prepare(
        'UPDATE watch_party_participants SET left_at = NULL, joined_at = ? WHERE party_id = ? AND user_id = ?'
      ).run(getCurrentSofiaDbTimestamp(), party.id, req.user.id);
    } else {
      throw err;
    }
  }

  res.json({ success: true, party_id: party.id });
});

router.post('/:code/leave', requireAuth, (req, res) => {
  const party = db.prepare('SELECT id, host_id, status FROM watch_parties WHERE invite_code = ?').get(req.params.code);
  if (!party) return res.status(404).json({ error: 'Watch party не е намерен.' });

  const leftAt = getCurrentSofiaDbTimestamp();
  db.prepare(
    'UPDATE watch_party_participants SET left_at = ? WHERE party_id = ? AND user_id = ? AND left_at IS NULL'
  ).run(leftAt, party.id, req.user.id);

  if (party.status === 'active' && party.host_id === req.user.id) {
    endParty(party.id);
    return res.json({ success: true, ended: true });
  }

  res.json({ success: true });
});

router.delete('/:code', requireAuth, (req, res) => {
  const party = db.prepare('SELECT * FROM watch_parties WHERE invite_code = ?').get(req.params.code);
  if (!party) return res.status(404).json({ error: 'Watch party не е намерен.' });
  if (party.host_id !== req.user.id) {
    return res.status(403).json({ error: 'Само домакинът може да изтрие watch party.' });
  }

  deleteParty(party.id);
  res.json({ success: true });
});

router.post('/:code/message', requireAuth, partyLimiter, (req, res) => {
  const party = db.prepare(
    "SELECT id FROM watch_parties WHERE invite_code = ? AND status = 'active'"
  ).get(req.params.code);
  if (!party) return res.status(404).json({ error: 'Watch party не е намерен.' });

  const message = String(req.body?.message || req.body?.content || '').trim().slice(0, 500);
  if (!message) return res.status(400).json({ error: 'Съобщението е празно.' });

  const isParticipant = db.prepare(
    'SELECT 1 FROM watch_party_participants WHERE party_id = ? AND user_id = ? AND left_at IS NULL'
  ).get(party.id, req.user.id);
  if (!isParticipant) return res.status(403).json({ error: 'Не сте участник в този watch party.' });

  const result = db.prepare(`
    INSERT INTO watch_party_messages (party_id, user_id, message)
    VALUES (?, ?, ?)
  `).run(party.id, req.user.id, message);

  res.status(201).json({
    success: true,
    message_id: result.lastInsertRowid,
    display_name: req.user.character_name,
    username: req.user.character_name,
    character_name: req.user.character_name,
    message,
    content: message,
  });
});

router.put('/:code/playback', requireAuth, playbackLimiter, (req, res) => {
  const party = db.prepare(
    "SELECT id, host_id, status FROM watch_parties WHERE invite_code = ? AND status = 'active'"
  ).get(req.params.code);

  if (!party) {
    return res.status(404).json({ error: 'Watch party не е намерен.' });
  }

  if (party.host_id !== req.user.id) {
    return res.status(403).json({ error: 'Само домакинът може да управлява възпроизвеждането.' });
  }

  const requestedState = String(req.body?.playback_state || '').trim().toLowerCase();
  const playbackState = ['playing', 'paused', 'ended'].includes(requestedState)
    ? requestedState
    : null;
  if (!playbackState) {
    return res.status(400).json({ error: 'Невалидно playback състояние.' });
  }

  const rawPosition = Number(req.body?.playback_position_seconds);
  const playbackPositionSeconds = Number.isFinite(rawPosition)
    ? Math.max(0, rawPosition)
    : 0;
  const updatedAt = getCurrentSofiaDbTimestamp();

  db.prepare(`
    UPDATE watch_parties
    SET playback_state = ?,
        playback_position_seconds = ?,
        playback_updated_at = ?,
        playback_version = COALESCE(playback_version, 0) + 1
    WHERE id = ? AND status = 'active'
  `).run(playbackState, playbackPositionSeconds, updatedAt, party.id);

  const updatedParty = db.prepare(`
    SELECT playback_state, playback_position_seconds, playback_updated_at, playback_version
    FROM watch_parties
    WHERE id = ?
  `).get(party.id);

  res.json({
    success: true,
    ...normalizePlaybackState(updatedParty),
  });
});

router.put('/:code/end', requireAuth, (req, res) => {
  const party = db.prepare(
    "SELECT * FROM watch_parties WHERE invite_code = ? AND status = 'active'"
  ).get(req.params.code);
  if (!party) return res.status(404).json({ error: 'Watch party не е намерен.' });
  if (party.host_id !== req.user.id) {
    return res.status(403).json({ error: 'Само домакинът може да приключи watch party.' });
  }

  endParty(party.id);
  res.json({ success: true });
});

export default router;
