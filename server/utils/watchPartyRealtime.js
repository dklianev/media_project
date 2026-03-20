import WebSocket, { WebSocketServer } from 'ws';
import db from '../db.js';
import { resolveAuthenticatedUser } from '../middleware/auth.js';
import { getCurrentSofiaDbTimestamp } from './sofiaTime.js';
import { evaluateEpisodeAccess, getUserPurchaseState } from './contentPurchases.js';

let realtimeHub = null;

function safeSend(ws, payload) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify(payload));
}

function getPartyBase(inviteCode) {
  return db.prepare(`
    SELECT wp.*,
           e.title as episode_title,
           u.character_name as host_name,
           u.discord_avatar as host_avatar
    FROM watch_parties wp
    JOIN episodes e ON e.id = wp.episode_id
    JOIN users u ON u.id = wp.host_id
    WHERE wp.invite_code = ?
  `).get(inviteCode);
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

function buildPartySnapshot(inviteCode, user) {
  const party = getPartyBase(inviteCode);
  if (!party) return { ok: false, status: 'missing' };

  const isParticipant = db.prepare(`
    SELECT 1
    FROM watch_party_participants
    WHERE party_id = ? AND user_id = ? AND left_at IS NULL
  `).get(party.id, user.id);

  if (!isParticipant) {
    return { ok: false, status: 'forbidden' };
  }

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
  `).all(party.id).reverse();

  return {
    ok: true,
    snapshot: {
      ...party,
      is_host: party.host_id === user.id,
      has_access: checkPartyEpisodeAccess(party.episode_id, user),
      playback_state: party.playback_state || 'paused',
      playback_position_seconds: Number(party.playback_position_seconds || 0),
      playback_updated_at: party.playback_updated_at || null,
      playback_version: Number(party.playback_version || 0),
      participants,
      messages,
    },
  };
}

function heartbeat() {
  this.isAlive = true;
}

function removeSocketFromRoom(hub, ws) {
  const roomId = ws.partyId;
  if (!roomId) return;
  const room = hub.rooms.get(roomId);
  if (room) {
    room.delete(ws);
    if (room.size === 0) {
      hub.rooms.delete(roomId);
    }
  }
  ws.partyId = null;
  ws.inviteCode = null;
}

function addSocketToRoom(hub, ws, roomId) {
  removeSocketFromRoom(hub, ws);
  let room = hub.rooms.get(roomId);
  if (!room) {
    room = new Set();
    hub.rooms.set(roomId, room);
  }
  room.add(ws);
  ws.partyId = roomId;
}

function createHub(server) {
  const wss = new WebSocketServer({ noServer: true, clientTracking: true });
  const hub = {
    wss,
    rooms: new Map(),
    broadcastSnapshotByInviteCode(inviteCode) {
      const party = getPartyBase(inviteCode);
      if (!party) return;
      this.broadcastSnapshotByPartyId(party.id, inviteCode);
    },
    broadcastSnapshotByPartyId(partyId, inviteCode = null) {
      const room = this.rooms.get(partyId);
      if (!room || room.size === 0) return;
      const resolvedInviteCode = inviteCode || Array.from(room)[0]?.inviteCode;
      if (!resolvedInviteCode) return;

      for (const ws of Array.from(room)) {
        if (!ws.user) {
          removeSocketFromRoom(this, ws);
          continue;
        }
        const result = buildPartySnapshot(resolvedInviteCode, ws.user);
        if (!result.ok) {
          safeSend(ws, { type: 'watch_party:unsubscribed', reason: result.status });
          removeSocketFromRoom(this, ws);
          continue;
        }
        safeSend(ws, { type: 'watch_party:snapshot', party: result.snapshot });
      }
    },
    emitPartyEnded(inviteCode) {
      const party = getPartyBase(inviteCode);
      if (!party) return;
      const room = this.rooms.get(party.id);
      if (!room) return;
      for (const ws of Array.from(room)) {
        safeSend(ws, { type: 'watch_party:ended', invite_code: inviteCode, party_id: party.id });
        removeSocketFromRoom(this, ws);
      }
    },
    emitPartyDeleted(inviteCode, partyId = null) {
      const resolvedPartyId = partyId || getPartyBase(inviteCode)?.id;
      if (!resolvedPartyId) return;
      const room = this.rooms.get(resolvedPartyId);
      if (!room) return;
      for (const ws of Array.from(room)) {
        safeSend(ws, { type: 'watch_party:deleted', invite_code: inviteCode, party_id: resolvedPartyId });
        removeSocketFromRoom(this, ws);
      }
    },
    close() {
      clearInterval(this.heartbeatInterval);
      for (const client of this.wss.clients) {
        client.terminate();
      }
      this.wss.close();
    },
  };

  wss.on('connection', (ws) => {
    ws.isAlive = true;
    ws.partyId = null;
    ws.inviteCode = null;
    ws.on('pong', heartbeat);
    ws.on('error', console.error);

    ws.on('message', (raw) => {
      let payload = null;
      try {
        payload = JSON.parse(raw.toString());
      } catch {
        safeSend(ws, { type: 'watch_party:error', error: 'Invalid websocket payload.' });
        return;
      }

      if (payload?.type === 'watch_party:subscribe') {
        const inviteCode = String(payload.invite_code || '').trim().toUpperCase();
        if (!inviteCode) {
          safeSend(ws, { type: 'watch_party:error', error: 'Missing invite code.' });
          return;
        }

        const result = buildPartySnapshot(inviteCode, ws.user);
        if (!result.ok) {
          safeSend(ws, { type: 'watch_party:error', error: result.status === 'missing' ? 'Party not found.' : 'Access denied.' });
          return;
        }

        addSocketToRoom(hub, ws, result.snapshot.id);
        ws.inviteCode = inviteCode;
        safeSend(ws, { type: 'watch_party:snapshot', party: result.snapshot });
        return;
      }

      if (payload?.type === 'watch_party:unsubscribe') {
        removeSocketFromRoom(hub, ws);
      }
    });

    ws.on('close', () => {
      removeSocketFromRoom(hub, ws);
    });
  });

  hub.heartbeatInterval = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (ws.isAlive === false) {
        removeSocketFromRoom(hub, ws);
        ws.terminate();
        return;
      }
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  server.on('upgrade', (request, socket, head) => {
    try {
      const { pathname, searchParams } = new URL(request.url, 'http://localhost');
      if (pathname !== '/api/watch-party/ws') {
        return;
      }

      const token = searchParams.get('token');
      const resolved = token ? resolveAuthenticatedUser(token) : { ok: false };
      if (!resolved.ok) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      wss.handleUpgrade(request, socket, head, (ws) => {
        ws.user = resolved.user;
        wss.emit('connection', ws, request);
      });
    } catch {
      socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
      socket.destroy();
    }
  });

  return hub;
}

export function attachWatchPartyRealtime(server) {
  if (realtimeHub) return realtimeHub;
  realtimeHub = createHub(server);
  return realtimeHub;
}

export function getWatchPartyRealtimeHub() {
  return realtimeHub;
}

export function broadcastWatchPartySnapshotByInviteCode(inviteCode) {
  realtimeHub?.broadcastSnapshotByInviteCode(inviteCode);
}

export function emitWatchPartyEnded(inviteCode) {
  realtimeHub?.emitPartyEnded(inviteCode);
}

export function emitWatchPartyDeleted(inviteCode, partyId = null) {
  realtimeHub?.emitPartyDeleted(inviteCode, partyId);
}
