import { useEffect, useRef, useState } from 'react';
import { motion } from '@/lib/motion';
import { Tv, Users, Send, LogOut, Copy, Check, MessageCircle } from 'lucide-react';
import { api } from '../utils/api.js';
import { useToastContext } from '../context/ToastContext';
import PageBackground from '../components/PageBackground';
import ScrollReveal from '../components/ScrollReveal';

const POLL_INTERVAL_MS = 5000;

function CopyCodeButton({ code }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--bg-tertiary)] hover:bg-[var(--bg-tertiary)]/80 text-sm font-mono text-[var(--text-secondary)] transition-colors cursor-pointer"
      title="Копирай кода"
    >
      {code}
      {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
    </button>
  );
}

function ParticipantList({ participants }) {
  if (!participants || participants.length === 0) return null;

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
                className="w-8 h-8 rounded-full object-cover border border-[var(--border)]"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-[var(--accent-gold)]/20 flex items-center justify-center text-xs font-bold text-[var(--accent-gold)]">
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
      <span className="text-xs font-semibold text-[var(--accent-gold)] whitespace-nowrap">
        {(message.display_name || message.username || 'Потребител')}:
      </span>
      <span className="text-sm text-[var(--text-primary)] break-words">
        {message.content}
      </span>
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
  const [messageText, setMessageText] = useState('');
  const [sending, setSending] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [ending, setEnding] = useState(false);

  const chatEndRef = useRef(null);

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [party?.messages]);

  useEffect(() => {
    if (!partyCode) return undefined;

    let cancelled = false;

    const clearPartyState = () => {
      setPartyCode(null);
      setParty(null);
      setInviteCode(null);
      setMessageText('');
    };

    const fetchParty = () => {
      api.get(`/watch-party/${partyCode}`)
        .then((data) => {
          if (cancelled) return;
          if (data.status && data.status !== 'active') {
            showToast('Watch party приключи.', 'success');
            clearPartyState();
            return;
          }
          setParty(data);
        })
        .catch((err) => {
          console.error('Failed to fetch party:', err);
          if (cancelled) return;
          if (err.status === 404) {
            showToast('Watch party не беше намерен.', 'error');
          } else {
            showToast(err?.data?.error || err?.message || 'Неуспешно зареждане на watch party.', 'error');
          }
          clearPartyState();
        });
    };

    fetchParty();
    const intervalId = setInterval(fetchParty, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [partyCode, showToast]);

  const handleCreate = async (event) => {
    event.preventDefault();
    const id = episodeId.trim();
    if (!id) return;

    setCreating(true);
    setFormError(null);
    try {
      const data = await api.post('/watch-party/create', { episode_id: id });
      const code = data.invite_code || data.code;
      showToast('Watch party беше създаден успешно!', 'success');
      setInviteCode(code);
      setPartyCode(code);
    } catch (err) {
      const message = err?.data?.error || err?.message || 'Неуспешно създаване на watch party.';
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
      showToast('Успешно се присъедини към watch party!', 'success');
      setPartyCode(code);
    } catch (err) {
      const message = err?.data?.error || err?.message || 'Неуспешно присъединяване.';
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
      const data = await api.get(`/watch-party/${partyCode}`);
      setParty(data);
    } catch (err) {
      const message = err?.data?.error || err?.message || 'Неуспешно изпращане на съобщение.';
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
      setPartyCode(null);
      setParty(null);
      setInviteCode(null);
      setMessageText('');
    } catch (err) {
      const message = err?.data?.error || err?.message || 'Неуспешно напускане.';
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
      setPartyCode(null);
      setParty(null);
      setInviteCode(null);
      setMessageText('');
    } catch (err) {
      const message = err?.data?.error || err?.message || 'Неуспешно приключване на watch party.';
      showToast(message, 'error');
    } finally {
      setEnding(false);
    }
  };

  const inParty = Boolean(partyCode && party);
  const isHost = party?.is_host || false;
  const messages = party?.messages || [];
  const participants = party?.participants || [];

  return (
    <div className="relative max-w-4xl mx-auto px-4 py-8 overflow-hidden min-h-screen flex flex-col gap-6">
      <PageBackground />

      <ScrollReveal variant="fadeUp" className="mb-2">
        <div className="flex items-center gap-3">
          <Tv className="w-8 h-8 text-[var(--accent-gold)]" />
          <h1 className="text-3xl font-bold">Watch Party</h1>
        </div>
        <p className="text-[var(--text-secondary)] mt-1 ml-11">
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
                    onClick={() => { setMode(tab.key); setFormError(null); }}
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer ${
                      isActive
                        ? 'bg-[var(--accent-gold)]/15 text-[var(--accent-gold)] border border-[var(--accent-gold)]/30'
                        : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] border border-[var(--border)] hover:text-[var(--text-primary)]'
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
                  <h2 className="text-lg font-semibold mb-4">Създай нов watch party</h2>
                  <form onSubmit={handleCreate} className="flex flex-col sm:flex-row gap-3">
                    <input
                      type="text"
                      value={episodeId}
                      onChange={(event) => setEpisodeId(event.target.value)}
                      placeholder="ID на епизод"
                      className="flex-1 px-4 py-2.5 rounded-xl bg-[var(--bg-tertiary)] border border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]/50 focus:outline-none focus:ring-2 focus:ring-[var(--accent-cyan)]/40 transition-all text-sm"
                      disabled={creating}
                    />
                    <button
                      type="submit"
                      disabled={creating || !episodeId.trim()}
                      className="px-6 py-2.5 rounded-xl bg-[var(--accent-gold)] text-black font-semibold text-sm hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
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
                      className="mt-4 p-4 rounded-xl bg-green-500/10 border border-green-500/20"
                    >
                      <p className="text-sm text-green-400 mb-2">
                        Watch party беше създаден. Сподели този код с приятелите си:
                      </p>
                      <CopyCodeButton code={inviteCode} />
                    </motion.div>
                  )}
                </>
              ) : (
                <>
                  <h2 className="text-lg font-semibold mb-4">Присъедини се към watch party</h2>
                  <form onSubmit={handleJoin} className="flex flex-col sm:flex-row gap-3">
                    <input
                      type="text"
                      value={joinCode}
                      onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
                      placeholder="Въведи кода за party"
                      className="flex-1 px-4 py-2.5 rounded-xl bg-[var(--bg-tertiary)] border border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]/50 focus:outline-none focus:ring-2 focus:ring-[var(--accent-cyan)]/40 transition-all font-mono text-sm"
                      disabled={joining}
                    />
                    <button
                      type="submit"
                      disabled={joining || !joinCode.trim()}
                      className="px-6 py-2.5 rounded-xl bg-[var(--accent-gold)] text-black font-semibold text-sm hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
                    >
                      {joining ? 'Присъединяване...' : 'Влез'}
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
              className="glass-card p-6 space-y-4"
            >
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="space-y-1">
                  {party.episode_title && (
                    <h2 className="text-lg font-semibold text-[var(--text-primary)]">
                      {party.episode_title}
                    </h2>
                  )}
                  <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-[var(--text-secondary)]">
                    {party.host_name && (
                      <span>Домакин: <span className="text-[var(--accent-gold)]">{party.host_name}</span></span>
                    )}
                    <span>Статус: <span className="text-[var(--text-primary)]">{party.status === 'active' ? 'Активен' : 'Приключен'}</span></span>
                    <span>Участници: <span className="text-[var(--text-primary)]">{participants.length}</span></span>
                  </div>
                </div>
                <CopyCodeButton code={partyCode} />
              </div>

              <div>
                <h3 className="text-sm font-medium text-[var(--text-secondary)] mb-2 flex items-center gap-1.5">
                  <Users className="w-4 h-4" />
                  Участници
                </h3>
                <ParticipantList participants={participants} />
              </div>
            </motion.div>
          </ScrollReveal>

          <ScrollReveal variant="fadeUp" delay={0.15}>
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="glass-card p-6 flex flex-col"
            >
              <h3 className="text-sm font-medium text-[var(--text-secondary)] mb-3 flex items-center gap-1.5">
                <MessageCircle className="w-4 h-4" />
                Чат
              </h3>

              <div
                className="h-72 overflow-y-auto rounded-xl bg-[var(--bg-tertiary)] border border-[var(--border)] p-4 mb-3 flex flex-col gap-1"
              >
                {messages.length === 0 ? (
                  <p className="text-sm text-[var(--text-secondary)] text-center my-auto">
                    Все още няма съобщения. Започни разговора!
                  </p>
                ) : (
                  messages.map((msg, index) => (
                    <ChatMessage key={msg.id || index} message={msg} />
                  ))
                )}
                <div ref={chatEndRef} />
              </div>

              <form onSubmit={handleSendMessage} className="flex gap-2">
                <input
                  type="text"
                  value={messageText}
                  onChange={(event) => setMessageText(event.target.value)}
                  placeholder="Напиши съобщение..."
                  className="flex-1 px-4 py-2.5 rounded-xl bg-[var(--bg-tertiary)] border border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]/50 focus:outline-none focus:ring-2 focus:ring-[var(--accent-cyan)]/40 transition-all text-sm"
                  disabled={sending}
                />
                <button
                  type="submit"
                  disabled={sending || !messageText.trim()}
                  className="px-4 py-2.5 rounded-xl bg-[var(--accent-gold)] text-black font-semibold text-sm hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  title="Изпрати"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </motion.div>
          </ScrollReveal>

          <ScrollReveal variant="fadeUp" delay={0.2}>
            <div className="flex gap-3">
              <button
                onClick={handleLeave}
                disabled={leaving}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-zinc-700 text-[var(--text-primary)] text-sm font-medium hover:bg-zinc-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                {leaving ? 'Излизане...' : 'Напусни'}
              </button>

              {isHost && (
                <button
                  onClick={handleEnd}
                  disabled={ending}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-red-600/80 text-white text-sm font-medium hover:bg-red-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  {ending ? 'Приключване...' : 'Приключи'}
                </button>
              )}
            </div>
          </ScrollReveal>
        </>
      )}
    </div>
  );
}
