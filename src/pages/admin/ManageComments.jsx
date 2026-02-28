import { useEffect, useRef, useState } from 'react';
import { EyeOff, MessageSquare, RotateCcw, Search, Trash2 } from 'lucide-react';
import { api } from '../../utils/api';
import AdminPagination from '../../components/AdminPagination';
import { useToastContext } from '../../context/ToastContext';
import { formatDate } from '../../utils/formatters';

const STATUS_OPTIONS = [
  { value: 'all', label: 'Всички статуси' },
  { value: 'published', label: 'Публикувани' },
  { value: 'hidden', label: 'Скрити' },
  { value: 'deleted', label: 'Изтрити' },
];

function statusBadge(status) {
  if (status === 'hidden') {
    return 'bg-[var(--warning)]/10 text-[var(--warning)] border border-[var(--warning)]/30';
  }
  if (status === 'deleted') {
    return 'bg-[var(--danger)]/10 text-[var(--danger)] border border-[var(--danger)]/30';
  }
  return 'badge-free';
}

function statusLabel(status) {
  if (status === 'hidden') return 'Скрит';
  if (status === 'deleted') return 'Изтрит';
  return 'Публикуван';
}

export default function ManageComments() {
  const { showToast } = useToastContext();
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const fetchSeq = useRef(0);

  const fetchComments = () => {
    const seq = ++fetchSeq.current;
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('page_size', String(pageSize));
    if (search.trim()) params.set('q', search.trim());
    if (statusFilter !== 'all') params.set('status', statusFilter);

    setLoading(true);
    api.get(`/comments/admin?${params.toString()}`)
      .then((data) => {
        if (seq !== fetchSeq.current) return;
        setComments(data.items || []);
        setTotal(data.total || 0);
        setTotalPages(data.total_pages || 1);
      })
      .catch((err) => {
        if (seq !== fetchSeq.current) return;
        showToast(err.message || 'Неуспешно зареждане на коментарите', 'error');
      })
      .finally(() => {
        if (seq === fetchSeq.current) setLoading(false);
      });
  };

  useEffect(() => {
    const timer = window.setTimeout(fetchComments, 250);
    return () => window.clearTimeout(timer);
  }, [page, pageSize, search, statusFilter]);

  const updateStatus = async (commentId, status) => {
    setWorkingId(commentId);
    try {
      await api.put(`/comments/admin/${commentId}/status`, { status });
      showToast('Статусът на коментара е обновен');
      fetchComments();
    } catch (err) {
      showToast(err.message || 'Неуспешна промяна на статуса', 'error');
    } finally {
      setWorkingId(null);
    }
  };

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <MessageSquare className="w-6 h-6 text-[var(--accent-gold-light)]" />
        <h1 className="text-2xl font-bold">Коментари</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_auto] gap-2 mb-4">
        <div className="relative min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
          <input
            value={search}
            onChange={(e) => {
              setPage(1);
              setSearch(e.target.value);
            }}
            placeholder="Търси по текст, епизод или потребител..."
            className="input-dark pl-11"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => {
            setPage(1);
            setStatusFilter(e.target.value);
          }}
          className="input-dark py-1.5 px-3 text-sm w-auto"
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="space-y-3">{[...Array(5)].map((_, i) => <div key={i} className="skeleton h-28 rounded-lg" />)}</div>
      ) : comments.length === 0 ? (
        <p className="text-[var(--text-muted)] text-center py-10">Няма коментари за този филтър</p>
      ) : (
        <div className="space-y-3">
          {comments.map((comment) => (
            <div key={comment.id} className="glass-card p-4 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold truncate">{comment.character_name || comment.discord_username || 'Неизвестен'}</p>
                    <span className={`badge text-[10px] ${statusBadge(comment.status)}`}>{statusLabel(comment.status)}</span>
                  </div>
                  <p className="text-xs text-[var(--text-muted)] mt-1">
                    {comment.production_title} / {comment.episode_title}
                  </p>
                  <p className="text-xs text-[var(--text-muted)] mt-1">
                    {formatDate(comment.created_at)}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {comment.status !== 'published' && (
                    <button
                      onClick={() => updateStatus(comment.id, 'published')}
                      disabled={workingId === comment.id}
                      className="btn-outline text-xs inline-flex items-center gap-1.5"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Публикувай
                    </button>
                  )}
                  {comment.status === 'published' && (
                    <button
                      onClick={() => updateStatus(comment.id, 'hidden')}
                      disabled={workingId === comment.id}
                      className="btn-outline text-xs inline-flex items-center gap-1.5"
                    >
                      <EyeOff className="w-3.5 h-3.5" />
                      Скрий
                    </button>
                  )}
                  {comment.status !== 'deleted' && (
                    <button
                      onClick={() => updateStatus(comment.id, 'deleted')}
                      disabled={workingId === comment.id}
                      className="btn-outline text-xs inline-flex items-center gap-1.5 text-[var(--danger)]"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Изтрий
                    </button>
                  )}
                </div>
              </div>

              <p className="text-sm text-[var(--text-secondary)] whitespace-pre-wrap break-words">
                {comment.content}
              </p>

              {comment.moderation_reason && (
                <p className="text-xs text-[var(--text-muted)]">
                  Причина: {comment.moderation_reason}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      <AdminPagination
        page={page}
        totalPages={totalPages}
        total={total}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(nextSize) => {
          setPage(1);
          setPageSize(nextSize);
        }}
      />
    </div>
  );
}
