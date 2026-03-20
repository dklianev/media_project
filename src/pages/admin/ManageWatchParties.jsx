import { useEffect, useRef, useState } from 'react';
import { MessageSquare, MonitorPlay, RefreshCw, Search, Trash2, Users } from 'lucide-react';
import { api } from '../../utils/api';
import { useToastContext } from '../../context/ToastContext';
import ConfirmActionModal from '../../components/ConfirmActionModal';
import { formatDateTime } from '../../utils/formatters';

const STATUS_STYLES = {
  active: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  ended: 'border-zinc-500/30 bg-zinc-500/10 text-zinc-300',
};

export default function ManageWatchParties() {
  const { showToast } = useToastContext();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const requestSeq = useRef(0);

  const fetchParties = async ({ silent = false } = {}) => {
    const seq = ++requestSeq.current;
    if (silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const params = new URLSearchParams();
      if (status !== 'all') params.set('status', status);
      if (search.trim()) params.set('search', search.trim());
      const data = await api.get(`/watch-party/admin/list?${params.toString()}`);
      if (seq !== requestSeq.current) return;
      setItems(Array.isArray(data?.items) ? data.items : []);
    } catch (err) {
      if (seq !== requestSeq.current) return;
      showToast(err.message || 'Не успяхме да заредим watch parties.', 'error');
    } finally {
      if (seq !== requestSeq.current) return;
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      fetchParties({ silent: false });
    }, 180);
    return () => window.clearTimeout(timer);
  }, [search, status]);

  const handleDelete = async () => {
    if (!deleteTarget?.invite_code) return;

    setDeleting(true);
    try {
      await api.delete(`/watch-party/${deleteTarget.invite_code}`);
      showToast('Watch party беше изтрито.', 'success');
      setDeleteTarget(null);
      fetchParties({ silent: true });
    } catch (err) {
      showToast(err.message || 'Не успяхме да изтрием watch party.', 'error');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Watch Parties</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Преглеждай всички активни и приключени стаи и изтривай проблемни сесии като администратор.
          </p>
        </div>

        <button
          type="button"
          onClick={() => fetchParties({ silent: true })}
          className="btn-outline inline-flex items-center gap-2 px-3 py-2 text-sm"
          disabled={refreshing}
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          {refreshing ? 'Опресняване...' : 'Опресни'}
        </button>
      </div>

      <div className="glass-card flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Търси по код, епизод или домакин..."
            className="input-dark w-full pl-9"
          />
        </div>

        <div className="flex w-full overflow-x-auto rounded-lg bg-[var(--bg-tertiary)] p-1 sm:w-auto">
          {[
            { value: 'all', label: 'Всички' },
            { value: 'active', label: 'Активни' },
            { value: 'ended', label: 'Приключени' },
          ].map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setStatus(option.value)}
              className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                status === option.value
                  ? 'bg-[var(--accent-gold)] text-black'
                  : 'text-[var(--text-secondary)] hover:text-white'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="glass-card flex items-center justify-center p-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--accent-gold)] border-t-transparent" />
        </div>
      ) : items.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <MonitorPlay className="mx-auto mb-4 h-12 w-12 text-[var(--text-muted)] opacity-50" />
          <h3 className="text-lg font-medium">Няма намерени watch parties</h3>
          <p className="mt-1 text-[var(--text-muted)]">Промени филтъра или потърси с друг код/заглавие.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((party) => (
            <div key={party.id} className="glass-card p-5">
              <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-semibold text-[var(--text-primary)]">{party.episode_title}</h3>
                    <span className={`rounded-md border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider ${STATUS_STYLES[party.status] || STATUS_STYLES.ended}`}>
                      {party.status === 'active' ? 'Активно' : 'Приключено'}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-[var(--text-secondary)]">
                    <span>Код: <span className="font-mono text-[var(--text-primary)]">{party.invite_code}</span></span>
                    <span>Домакин: <span className="text-[var(--text-primary)]">{party.host_name || party.host_discord_username || '-'}</span></span>
                    <span>Епизод ID: <span className="text-[var(--text-primary)]">{party.episode_id}</span></span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setDeleteTarget(party)}
                  className="inline-flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-300 transition-colors hover:bg-red-500/15"
                >
                  <Trash2 className="h-4 w-4" />
                  Изтрий
                </button>
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-tertiary)]/60 p-3">
                  <div className="mb-1 flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-[var(--text-muted)]">
                    <Users className="h-3.5 w-3.5" />
                    Участници
                  </div>
                  <div className="text-xl font-semibold text-[var(--text-primary)]">{party.participant_count}</div>
                </div>

                <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-tertiary)]/60 p-3">
                  <div className="mb-1 flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-[var(--text-muted)]">
                    <MessageSquare className="h-3.5 w-3.5" />
                    Съобщения
                  </div>
                  <div className="text-xl font-semibold text-[var(--text-primary)]">{party.message_count}</div>
                </div>

                <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-tertiary)]/60 p-3">
                  <div className="mb-1 text-xs uppercase tracking-[0.14em] text-[var(--text-muted)]">Създадено</div>
                  <div className="text-sm font-medium text-[var(--text-primary)]">
                    {party.created_at ? formatDateTime(party.created_at) : '-'}
                  </div>
                </div>

                <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-tertiary)]/60 p-3">
                  <div className="mb-1 text-xs uppercase tracking-[0.14em] text-[var(--text-muted)]">Playback</div>
                  <div className="text-sm font-medium capitalize text-[var(--text-primary)]">
                    {party.playback_state || 'paused'}
                  </div>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--text-muted)]">
                <span>Старт: {party.started_at ? formatDateTime(party.started_at) : '-'}</span>
                <span>Край: {party.ended_at ? formatDateTime(party.ended_at) : '-'}</span>
                <span>Версия sync: {party.playback_version ?? 0}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmActionModal
        open={Boolean(deleteTarget)}
        title="Изтриване на watch party"
        message={deleteTarget
          ? `Сигурен ли си, че искаш да изтриеш стаята за "${deleteTarget.episode_title}" (${deleteTarget.invite_code})? Това ще премахне участниците и чата.`
          : ''}
        confirmLabel="Изтрий"
        cancelLabel="Отказ"
        tone="danger"
        loading={deleting}
        onClose={() => !deleting && setDeleteTarget(null)}
        onConfirm={handleDelete}
      />
    </div>
  );
}
