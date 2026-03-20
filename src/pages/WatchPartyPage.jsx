import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from '@/lib/motion';
import { Check, Copy, LogOut, MessageCircle, Send, Trash2, Tv, Users } from 'lucide-react';
import { api } from '../utils/api.js';
import { useToastContext } from '../context/ToastContext';
import PageBackground from '../components/PageBackground';
import ScrollReveal from '../components/ScrollReveal';
import VideoPlayer from '../components/VideoPlayer';
import useWatchPartySocket from '../hooks/useWatchPartySocket';

const FALLBACK_POLL_INTERVAL_MS = 5000;
const HOST_SYNC_HEARTBEAT_MS = 3000;

function CopyCodeButton({ code }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore clipboard failures
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--bg-tertiary)] px-3 py-1.5 font-mono text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-tertiary)]/80 cursor-pointer"
      title="Копирай кода"
    >
      {code}
      {copied ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
    </button>
  );
}

function ParticipantList({ participants }) {
  if (!participants?.length) return null;

  return (
    <div className="flex flex-wrap gap-3">
      {participants.map((participant) => {
        const name = participant.display_name || participant.username || '?';
        return (
          <div key={participant.id || participant.user_id || name} className="flex items-center gap-2">
            {participant.avatar_url ? (
              <img
                src={participant.avatar_url}
                alt={name}
                className="h-8 w-8 rounded-full border border-[var(--border)] object-cover"
              />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--accent-gold)]/20 text-xs font-bold text-[var(--accent-gold)]">
                {name.charAt(0).toUpperCase()}
              </div>
            )}
            <span className="text-sm text-[var(--text-primary)]">{name}</span>
          </div>
        );
      })}
    </div>
  );
}

function ChatMessage({ message }) {
  return (
    <div className="flex gap-2 py-1.5">
      <span className="whitespace-nowrap text-xs font-semibold text-[var(--accent-gold)]">
        {(message.display_name || message.username || 'Участник')}:
      </span>
      <span className="break-words text-sm text-[var(--text-primary)]">{message.content}</span>
    </div>
  );
}

function HostedPartyCard({ party, opening, deleting, onOpen, onDelete }) {
  if (!party) return null;

  return (
    <div className="mb-4 rounded-2xl border border-[var(--accent-gold)]/25 bg-[var(--accent-gold)]/8 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-[0.16em] text-[var(--accent-gold-light)]">
            Твоето watch party
          </p>
          <h3 className="text-lg font-semibold text-[var(--text-primary)]">{party.episode_title}</h3>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--text-secondary)]">
            <span>
              Код: <span className="font-mono text-[var(--text-primary)]">{party.invite_code}</span>
            </span>
            <span>
              Участници: <span className="text-[var(--text-primary)]">{party.participant_count}</span>
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onOpen}
            disabled={opening || deleting}
            className="btn-outline px-4 py-2 text-sm disabled:opacity-50"
          >
            {opening ? 'Отваряне...' : 'Отвори'}
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={opening || deleting}
            className="inline-flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-300 transition-colors hover:bg-red-500/15 disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" />
            {deleting ? 'Изтриване...' : 'Изтрий'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function WatchPartyPage() {
  const { showToast } = useToastContext();

  const [mode, setMode] = useState('create');
  const [episodeId, setEpisodeId] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [inviteCode, setInviteCode] = useState(null);
  const [formError, setFormError] = useState(null);

  const [partyCode, setPartyCode] = useState(null);
  const [party, setParty] = useState(null);
  const [partyEpisode, setPartyEpisode] = useState(null);
  const [loadingPartyEpisode, setLoadingPartyEpisode] = useState(false);
  const [partyVideoError, setPartyVideoError] = useState(null);
  const [hostedParty, setHostedParty] = useState(null);
  const [loadingHostedParty, setLoadingHostedParty] = useState(false);
  const [deletingParty, setDeletingParty] = useState(false);
  const [socketError, setSocketError] = useState(null);
  const [messageText, setMessageText] = useState('');
  const [sending, setSending] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [ending, setEnding] = useState(false);
  const [playerSyncState, setPlayerSyncState] = useState('paused');

  const chatViewportRef = useRef(null);
  const lastMessageCountRef = useRef(0);
  const lastHostSyncRef = useRef({ state: null, position: null, sentAt: 0 });

  const clearPartyState = useCallback(() => {
    setPartyCode(null);
    setParty(null);
    setPartyEpisode(null);
    setPartyVideoError(null);
    setInviteCode(null);
    setMessageText('');
    setSocketError(null);
    setPlayerSyncState('paused');
    lastMessageCountRef.current = 0;
    lastHostSyncRef.current = { state: null, position: null, sentAt: 0 };
  }, []);

  const fetchHostedParty = useCallback(async () => {
    setLoadingHostedParty(true);
    try {
      const data = await api.get('/watch-party/mine/active');
      setHostedParty(data.party || null);
      return data.party || null;
    } catch (err) {
      if (err?.status !== 404) {
        console.error('Failed to fetch hosted watch party:', err);
      }
      setHostedParty(null);
      return null;
    } finally {
      setLoadingHostedParty(false);
    }
  }, []);

  useEffect(() => {
    fetchHostedParty();
  }, [fetchHostedParty]);

  const refreshParty = useCallback(() => {
    if (!partyCode) return Promise.resolve();

    return api.get(`/watch-party/${partyCode}`)
      .then((data) => {
        if (data.status && data.status !== 'active') {
          showToast('Watch party приключи.', 'success');
          clearPartyState();
          fetchHostedParty();
          return;
        }
        setParty(data);
      })
      .catch((err) => {
        console.error('Failed to fetch party:', err);
        if (err.status === 404) {
          showToast('Watch party вече не е наличен.', 'error');
        } else {
          showToast(err?.data?.error || err?.message || 'Не успяхме да заредим watch party.', 'error');
        }
        clearPartyState();
        fetchHostedParty();
      });
  }, [clearPartyState, fetchHostedParty, partyCode, showToast]);

  const { isConnected: isSocketConnected } = useWatchPartySocket({
    inviteCode: partyCode,
    enabled: Boolean(partyCode),
    onSnapshot: useCallback((nextParty) => {
      setSocketError(null);
      setParty(nextParty);
    }, []),
    onEnded: useCallback(() => {
      showToast('Watch party приключи.', 'success');
      clearPartyState();
      fetchHostedParty();
    }, [clearPartyState, fetchHostedParty, showToast]),
    onDeleted: useCallback(() => {
      showToast('Watch party беше изтрит.', 'success');
      clearPartyState();
      fetchHostedParty();
    }, [clearPartyState, fetchHostedParty, showToast]),
    onError: useCallback((payload) => {
      const message = payload?.error || 'Realtime връзката за watch party прекъсна.';
      setSocketError(message);
    }, []),
  });

  const publishPlaybackUpdate = useCallback(async (payload, options = {}) => {
    if (!partyCode || !party?.is_host) return;

    const playbackState = String(payload?.playbackState || payload?.playback_state || '').trim().toLowerCase();
    if (!['playing', 'paused', 'ended'].includes(playbackState)) return;

    const playbackPositionSeconds = Math.max(
      0,
      Number(payload?.playbackPositionSeconds ?? payload?.playback_position_seconds ?? 0) || 0
    );
    const force = Boolean(options.force);
    const now = Date.now();
    const lastSync = lastHostSyncRef.current;
    const positionDelta = Math.abs((lastSync.position ?? playbackPositionSeconds) - playbackPositionSeconds);

    if (!force) {
      const sameState = lastSync.state === playbackState;
      const sentRecently = now - (lastSync.sentAt || 0) < HOST_SYNC_HEARTBEAT_MS;

      if (sameState && playbackState === 'playing' && sentRecently && positionDelta < 0.9) {
        return;
      }

      if (sameState && playbackState !== 'playing' && positionDelta < 0.2) {
        return;
      }
    }

    lastHostSyncRef.current = {
      state: playbackState,
      position: playbackPositionSeconds,
      sentAt: now,
    };

    setPlayerSyncState(playbackState);

    try {
      await api.put(`/watch-party/${partyCode}/playback`, {
        playback_state: playbackState,
        playback_position_seconds: playbackPositionSeconds,
      });
    } catch (err) {
      console.error('Failed to sync watch party playback:', err);
    }
  }, [party?.is_host, partyCode]);

  useEffect(() => {
    const nextCount = party?.messages?.length ?? 0;
    const previousCount = lastMessageCountRef.current;

    if (chatViewportRef.current && nextCount > previousCount) {
      chatViewportRef.current.scrollTop = chatViewportRef.current.scrollHeight;
    }

    lastMessageCountRef.current = nextCount;
  }, [party?.messages?.length]);

  useEffect(() => {
    if (!party) return;
    const nextState = party.playback_state || 'paused';
    setPlayerSyncState(nextState);
  }, [party]);

  useEffect(() => {
    if (!party?.episode_id || party?.has_access === false) {
      setPartyEpisode(null);
      setLoadingPartyEpisode(false);
      setPartyVideoError(null);
      return undefined;
    }

    let cancelled = false;
    setLoadingPartyEpisode(true);
    setPartyVideoError(null);

    api.get(`/episodes/${party.episode_id}`)
      .then((data) => {
        if (cancelled) return;
        setPartyEpisode(data);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('Failed to fetch watch party episode playback data:', err);
        setPartyEpisode(null);
        setPartyVideoError(err?.data?.error || err?.message || 'Не успяхме да заредим видеото.');
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingPartyEpisode(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [party?.episode_id, party?.has_access]);

  useEffect(() => {
    if (!partyCode) return undefined;

    let cancelled = false;

    const fetchParty = () => {
      api.get(`/watch-party/${partyCode}`)
        .then((data) => {
          if (cancelled) return;
          if (data.status && data.status !== 'active') {
            showToast('Watch party приключи.', 'success');
            clearPartyState();
            fetchHostedParty();
            return;
          }
          setParty(data);
        })
        .catch((err) => {
          console.error('Failed to fetch party:', err);
          if (cancelled) return;
          if (err.status === 404) {
            showToast('Watch party вече не съществува.', 'error');
          } else {
            showToast(err?.data?.error || err?.message || 'Не успяхме да заредим watch party.', 'error');
          }
          clearPartyState();
          fetchHostedParty();
        });
    };

    fetchParty();
    if (isSocketConnected) {
      return () => {
        cancelled = true;
      };
    }
    const intervalId = setInterval(fetchParty, FALLBACK_POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [isSocketConnected, partyCode, showToast, clearPartyState, fetchHostedParty]);

  const handlePlayerSyncEvent = useCallback((payload) => {
    setPlayerSyncState(payload.playbackState || 'paused');
    publishPlaybackUpdate(payload, { force: payload.playbackState !== 'playing' });
  }, [publishPlaybackUpdate]);

  const handlePlayerProgress = useCallback((currentTime) => {
    if (!party?.is_host || playerSyncState !== 'playing') return;
    publishPlaybackUpdate({
      playbackState: 'playing',
      playbackPositionSeconds: currentTime,
    });
  }, [party?.is_host, playerSyncState, publishPlaybackUpdate]);

  const handleCreate = async (event) => {
    event.preventDefault();
    const id = episodeId.trim();
    if (!id) return;

    setCreating(true);
    setFormError(null);
    try {
      const data = await api.post('/watch-party/create', { episode_id: id });
      const code = data.invite_code || data.code;
      showToast('Watch party беше създаден успешно.', 'success');
      setInviteCode(code);
      setPartyCode(code);
      await fetchHostedParty();
    } catch (err) {
      if (err?.status === 400) {
        await fetchHostedParty();
      }
      const message = err?.data?.error || err?.message || 'Не успяхме да създадем watch party.';
      setFormError(message);
      showToast(message, 'error');
    } finally {
      setCreating(false);
    }
  };

  const handleJoin = async (event) => {
    event.preventDefault();
    const code = joinCode.trim().toUpperCase();
    if (!code) return;

    setJoining(true);
    setFormError(null);
    try {
      await api.post(`/watch-party/${code}/join`);
      showToast('Успешно се присъедини към watch party.', 'success');
      setPartyCode(code);
    } catch (err) {
      const message = err?.data?.error || err?.message || 'Не успяхме да се присъединим.';
      setFormError(message);
      showToast(message, 'error');
    } finally {
      setJoining(false);
    }
  };

  const handleSendMessage = async (event) => {
    event.preventDefault();
    const content = messageText.trim();
    if (!content || !partyCode) return;

    setSending(true);
    try {
      await api.post(`/watch-party/${partyCode}/message`, { message: content });
      setMessageText('');
      if (!isSocketConnected) {
        await refreshParty();
      }
    } catch (err) {
      const message = err?.data?.error || err?.message || 'Не успяхме да изпратим съобщението.';
      showToast(message, 'error');
    } finally {
      setSending(false);
    }
  };

  const handleLeave = async () => {
    if (!partyCode) return;
    setLeaving(true);
    try {
      const result = await api.post(`/watch-party/${partyCode}/leave`);
      showToast(result?.ended ? 'Watch party приключи.' : 'Напусна watch party.', 'success');
      clearPartyState();
      await fetchHostedParty();
    } catch (err) {
      const message = err?.data?.error || err?.message || 'Не успяхме да напуснем.';
      showToast(message, 'error');
    } finally {
      setLeaving(false);
    }
  };

  const handleEnd = async () => {
    if (!partyCode) return;
    setEnding(true);
    try {
      await api.put(`/watch-party/${partyCode}/end`);
      showToast('Watch party беше приключен.', 'success');
      clearPartyState();
      await fetchHostedParty();
    } catch (err) {
      const message = err?.data?.error || err?.message || 'Не успяхме да приключим watch party.';
      showToast(message, 'error');
    } finally {
      setEnding(false);
    }
  };

  const handleDelete = async (code = hostedParty?.invite_code) => {
    if (!code) return;
    setDeletingParty(true);
    try {
      await api.delete(`/watch-party/${code}`);
      showToast('Watch party беше изтрит.', 'success');
      if (partyCode === code) {
        clearPartyState();
      }
      await fetchHostedParty();
      setFormError(null);
    } catch (err) {
      const message = err?.data?.error || err?.message || 'Не успяхме да изтрием watch party.';
      showToast(message, 'error');
    } finally {
      setDeletingParty(false);
    }
  };

  const openHostedParty = () => {
    if (!hostedParty?.invite_code) return;
    setInviteCode(hostedParty.invite_code);
    setPartyCode(hostedParty.invite_code);
    setFormError(null);
  };

  const inParty = Boolean(partyCode && party);
  const isHost = Boolean(party?.is_host);
  const messages = party?.messages || [];
  const participants = party?.participants || [];
  const hasPartyAccess = party?.has_access !== false;
  const isLocalPlaybackReady =
    partyEpisode?.video_source === 'local'
    && (
      partyEpisode?.local_video_url
      || partyEpisode?.transcoding_status === 'pending'
      || partyEpisode?.transcoding_status === 'processing'
    );
  const hasPartyVideo = Boolean(
    hasPartyAccess
    && partyEpisode
    && (
      partyEpisode.video_embed_url
      || partyEpisode.youtube_video_id
      || isLocalPlaybackReady
    )
  );

  return (
    <div className="relative mx-auto flex min-h-screen max-w-5xl flex-col gap-6 overflow-hidden px-4 py-8">
      <PageBackground />

      <ScrollReveal variant="fadeUp" className="mb-2">
        <div className="flex items-center gap-3">
          <Tv className="h-8 w-8 text-[var(--accent-gold)]" />
          <h1 className="text-3xl font-bold">Watch Party</h1>
        </div>
        <p className="ml-11 mt-1 text-[var(--text-secondary)]">
          Гледайте заедно с приятели и чатете в реално време.
        </p>
      </ScrollReveal>

      {!inParty ? (
        <>
          <ScrollReveal variant="fadeUp" delay={0.1}>
            <div className="flex gap-2">
              {[
                { key: 'create', label: 'Създай' },
                { key: 'join', label: 'Присъедини се' },
              ].map((tab) => {
                const isActive = mode === tab.key;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => {
                      setMode(tab.key);
                      setFormError(null);
                    }}
                    className={`cursor-pointer rounded-xl border px-5 py-2.5 text-sm font-medium transition-all ${
                      isActive
                        ? 'border-[var(--accent-gold)]/30 bg-[var(--accent-gold)]/15 text-[var(--accent-gold)]'
                        : 'border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </ScrollReveal>

          <ScrollReveal variant="fadeUp" delay={0.15}>
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="glass-card p-6"
            >
              {mode === 'create' ? (
                <>
                  <h2 className="mb-4 text-lg font-semibold">Създай нов watch party</h2>

                  {!loadingHostedParty && (
                    <HostedPartyCard
                      party={hostedParty}
                      opening={Boolean(hostedParty?.invite_code && partyCode === hostedParty.invite_code)}
                      deleting={deletingParty}
                      onOpen={openHostedParty}
                      onDelete={() => handleDelete(hostedParty?.invite_code)}
                    />
                  )}

                  <form onSubmit={handleCreate} className="flex flex-col gap-3 sm:flex-row">
                    <input
                      type="text"
                      value={episodeId}
                      onChange={(event) => setEpisodeId(event.target.value)}
                      placeholder="ID на епизод"
                      className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--bg-tertiary)] px-4 py-2.5 text-sm text-[var(--text-primary)] transition-all placeholder:text-[var(--text-secondary)]/50 focus:outline-none focus:ring-2 focus:ring-[var(--accent-cyan)]/40"
                      disabled={creating}
                    />
                    <button
                      type="submit"
                      disabled={creating || !episodeId.trim()}
                      className="cursor-pointer whitespace-nowrap rounded-xl bg-[var(--accent-gold)] px-6 py-2.5 text-sm font-semibold text-black transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {creating ? 'Създаване...' : 'Създай party'}
                    </button>
                  </form>

                  {formError && mode === 'create' && (
                    <p className="mt-3 text-sm text-[var(--danger)]">{formError}</p>
                  )}

                  {inviteCode && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="mt-4 rounded-xl border border-green-500/20 bg-green-500/10 p-4"
                    >
                      <p className="mb-2 text-sm text-green-400">
                        Watch party беше създаден. Изпрати този код на приятелите си:
                      </p>
                      <CopyCodeButton code={inviteCode} />
                    </motion.div>
                  )}
                </>
              ) : (
                <>
                  <h2 className="mb-4 text-lg font-semibold">Присъедини се към watch party</h2>
                  <form onSubmit={handleJoin} className="flex flex-col gap-3 sm:flex-row">
                    <input
                      type="text"
                      value={joinCode}
                      onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
                      placeholder="Код на party"
                      className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--bg-tertiary)] px-4 py-2.5 font-mono text-sm text-[var(--text-primary)] transition-all placeholder:text-[var(--text-secondary)]/50 focus:outline-none focus:ring-2 focus:ring-[var(--accent-cyan)]/40"
                      disabled={joining}
                    />
                    <button
                      type="submit"
                      disabled={joining || !joinCode.trim()}
                      className="cursor-pointer whitespace-nowrap rounded-xl bg-[var(--accent-gold)] px-6 py-2.5 text-sm font-semibold text-black transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {joining ? 'Свързване...' : 'Влез'}
                    </button>
                  </form>
                  {formError && mode === 'join' && (
                    <p className="mt-3 text-sm text-[var(--danger)]">{formError}</p>
                  )}
                </>
              )}
            </motion.div>
          </ScrollReveal>
        </>
      ) : (
        <>
          <ScrollReveal variant="fadeUp" delay={0.1}>
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="glass-card space-y-4 p-6"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-1">
                  {party.episode_title && (
                    <h2 className="text-lg font-semibold text-[var(--text-primary)]">{party.episode_title}</h2>
                  )}
                  <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-[var(--text-secondary)]">
                    {party.host_name && (
                      <span>
                        Домакин: <span className="text-[var(--accent-gold)]">{party.host_name}</span>
                      </span>
                    )}
                    <span>
                      Статус:{' '}
                      <span className="text-[var(--text-primary)]">
                        {party.status === 'active' ? 'Активен' : 'Приключен'}
                      </span>
                    </span>
                    <span>
                      Участници: <span className="text-[var(--text-primary)]">{participants.length}</span>
                    </span>
                  </div>
                </div>
                <CopyCodeButton code={partyCode} />
              </div>

              <div>
                <h3 className="mb-2 flex items-center gap-1.5 text-sm font-medium text-[var(--text-secondary)]">
                  <Users className="h-4 w-4" />
                  Участници
                </h3>
                <ParticipantList participants={participants} />
                {socketError && (
                  <p className="mt-3 text-xs text-[var(--text-secondary)]">
                    {socketError}
                  </p>
                )}
              </div>
            </motion.div>
          </ScrollReveal>

          <ScrollReveal variant="fadeUp" delay={0.15}>
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="glass-card p-4 sm:p-5"
            >
              <div className="film-frame relative">
                <div className="film-grain rounded-2xl" />
                {loadingPartyEpisode ? (
                  <div
                    className="relative w-full overflow-hidden rounded-2xl border border-[var(--border)] bg-[linear-gradient(160deg,#0a0d17,#111626)] shadow-premium-md"
                    style={{ paddingBottom: '56.25%' }}
                  >
                    <div className="absolute inset-0 flex items-center justify-center px-6 text-center">
                      <p className="text-sm text-[var(--text-secondary)]">Зареждаме видеото...</p>
                    </div>
                  </div>
                ) : hasPartyVideo ? (
                  <div className="space-y-3">
                    <VideoPlayer
                      embedUrl={partyEpisode.video_embed_url}
                      youtubeVideoId={partyEpisode.youtube_video_id}
                      title={partyEpisode.title || party.episode_title}
                      siteName="Watch Party"
                      videoSource={partyEpisode.video_source || 'youtube'}
                      localVideoUrl={partyEpisode.local_video_url}
                      transcodingStatus={partyEpisode.transcoding_status}
                      playbackMode={isHost ? 'controller' : 'follower'}
                      syncState={isHost ? null : {
                        playbackState: party?.playback_state || 'paused',
                        playbackPositionSeconds: party?.playback_position_seconds || 0,
                        playbackUpdatedAt: party?.playback_updated_at || null,
                        playbackVersion: party?.playback_version || 0,
                      }}
                      onSyncEvent={isHost ? handlePlayerSyncEvent : null}
                      onProgressSample={handlePlayerProgress}
                    />
                    <p className="px-1 text-xs text-[var(--text-secondary)]">
                      {isHost
                        ? 'Ти управляваш възпроизвеждането за всички в party-то.'
                        : 'Домакинът управлява видеото. Твоят плеър се синхронизира автоматично.'}
                    </p>
                  </div>
                ) : (
                  <div
                    className="relative w-full overflow-hidden rounded-2xl border border-[var(--border)] bg-[linear-gradient(160deg,#0a0d17,#111626)] shadow-premium-md"
                    style={{ paddingBottom: '56.25%' }}
                  >
                    <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
                      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-[var(--accent-gold)]/40 bg-[var(--accent-gold)]/10">
                        <Tv className="h-7 w-7 text-[var(--accent-gold-light)]" />
                      </div>
                      <h3 className="text-lg font-semibold text-[var(--text-primary)]">Видеото не е налично</h3>
                      <p className="mt-2 max-w-xl text-sm text-[var(--text-secondary)]">
                        {partyVideoError || (hasPartyAccess
                          ? 'Сесията е активна, но видеото още не успя да се зареди.'
                          : 'Вече нямаш достъп до този епизод, затова плеърът е скрит.')}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </ScrollReveal>

          <ScrollReveal variant="fadeUp" delay={0.18}>
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="glass-card flex flex-col p-6"
            >
              <h3 className="mb-3 flex items-center gap-1.5 text-sm font-medium text-[var(--text-secondary)]">
                <MessageCircle className="h-4 w-4" />
                Чат
              </h3>

              <div
                ref={chatViewportRef}
                className="mb-3 flex h-72 flex-col gap-1 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--bg-tertiary)] p-4"
              >
                {messages.length === 0 ? (
                  <p className="my-auto text-center text-sm text-[var(--text-secondary)]">
                    Все още няма съобщения. Започни разговора.
                  </p>
                ) : (
                  messages.map((msg, index) => <ChatMessage key={msg.id || index} message={msg} />)
                )}
              </div>

              <form onSubmit={handleSendMessage} className="flex gap-2">
                <input
                  type="text"
                  value={messageText}
                  onChange={(event) => setMessageText(event.target.value)}
                  placeholder="Напиши съобщение..."
                  className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--bg-tertiary)] px-4 py-2.5 text-sm text-[var(--text-primary)] transition-all placeholder:text-[var(--text-secondary)]/50 focus:outline-none focus:ring-2 focus:ring-[var(--accent-cyan)]/40"
                  disabled={sending}
                />
                <button
                  type="submit"
                  disabled={sending || !messageText.trim()}
                  className="cursor-pointer rounded-xl bg-[var(--accent-gold)] px-4 py-2.5 text-sm font-semibold text-black transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                  title="Изпрати"
                >
                  <Send className="h-4 w-4" />
                </button>
              </form>
            </motion.div>
          </ScrollReveal>

          <ScrollReveal variant="fadeUp" delay={0.2}>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleLeave}
                disabled={leaving || deletingParty}
                className="flex cursor-pointer items-center gap-2 rounded-xl bg-zinc-700 px-5 py-2.5 text-sm font-medium text-[var(--text-primary)] transition-colors hover:bg-zinc-600 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <LogOut className="h-4 w-4" />
                {leaving ? 'Напускане...' : 'Напусни'}
              </button>

              {isHost && (
                <>
                  <button
                    type="button"
                    onClick={handleEnd}
                    disabled={ending || deletingParty}
                    className="flex cursor-pointer items-center gap-2 rounded-xl bg-red-600/80 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {ending ? 'Приключване...' : 'Приключи'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(partyCode)}
                    disabled={deletingParty || ending || leaving}
                    className="flex cursor-pointer items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-5 py-2.5 text-sm font-medium text-red-300 transition-colors hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Trash2 className="h-4 w-4" />
                    {deletingParty ? 'Изтриване...' : 'Изтрий'}
                  </button>
                </>
              )}
            </div>
          </ScrollReveal>
        </>
      )}
    </div>
  );
}
