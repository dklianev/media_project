import { useEffect, useState } from 'react';
import { Link } from '@/components/AppLink';
import { motion, AnimatePresence } from '@/lib/motion';
import { ShoppingBag, X, PackageOpen } from 'lucide-react';
import { api } from '../utils/api';
import { useToastContext } from '../context/ToastContext';
import PageBackground from '../components/PageBackground';

const TABS = [
  { key: 'all', label: 'Всички' },
  { key: 'confirmed', label: 'Потвърдени' },
  { key: 'pending', label: 'Чакащи' },
  { key: 'rejected', label: 'Отказани' },
];

function statusLabel(status) {
  switch (status) {
    case 'confirmed': return 'Потвърдена';
    case 'pending': return 'Чакаща';
    case 'rejected': return 'Отказана';
    case 'cancelled': return 'Отменена';
    default: return status;
  }
}

function statusClasses(status) {
  switch (status) {
    case 'confirmed':
      return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25';
    case 'pending':
      return 'bg-amber-500/15 text-amber-400 border-amber-500/25';
    case 'rejected':
    case 'cancelled':
      return 'bg-red-500/15 text-red-400 border-red-500/25';
    default:
      return 'bg-zinc-500/15 text-zinc-400 border-zinc-500/25';
  }
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('bg-BG', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function MyPurchasesPage() {
  const { showToast } = useToastContext();

  const [purchases, setPurchases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [cancellingId, setCancellingId] = useState(null);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const data = await api.get('/content-purchases/my');
        if (!active) return;
        setPurchases(Array.isArray(data) ? data : []);
        setError('');
      } catch (err) {
        if (!active) return;
        setError(err.message || 'Неуспешно зареждане на покупките.');
      } finally {
        if (active) setLoading(false);
      }
    }

    load();
    return () => { active = false; };
  }, []);

  async function handleCancel(id) {
    if (cancellingId) return;
    setCancellingId(id);
    try {
      await api.put(`/content-purchases/my/${id}/cancel`);
      setPurchases((prev) =>
        prev.map((p) => (p.id === id ? { ...p, status: 'cancelled' } : p))
      );
      showToast('Покупката беше отменена.', 'success');
    } catch (err) {
      showToast(err.message || 'Неуспешно отменяне на покупката.', 'error');
    } finally {
      setCancellingId(null);
    }
  }

  const filtered = purchases.filter((p) => {
    if (activeTab === 'all') return true;
    if (activeTab === 'confirmed') return p.status === 'confirmed';
    if (activeTab === 'pending') return p.status === 'pending';
    if (activeTab === 'rejected') return p.status === 'rejected' || p.status === 'cancelled';
    return true;
  });

  return (
    <div className="relative min-h-screen pb-12">
      <PageBackground />

      <div className="relative max-w-5xl mx-auto px-4 py-8 sm:py-10">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
        >
          {/* Header */}
          <div className="flex items-center gap-3 mb-8">
            <ShoppingBag className="w-7 h-7 text-[var(--accent-gold)]" />
            <h1 className="font-display text-3xl sm:text-4xl font-bold">Моите покупки</h1>
          </div>

          {/* Tabs */}
          <div className="flex flex-wrap gap-2 mb-8">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 border ${
                  activeTab === tab.key
                    ? 'bg-[var(--accent-gold)]/15 text-[var(--accent-gold)] border-[var(--accent-gold)]/30'
                    : 'bg-zinc-900/50 text-[var(--text-secondary)] border-zinc-700/40 hover:bg-zinc-800/60 hover:text-[var(--text-primary)]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Error */}
          {error && (
            <div className="glass-card p-6 mb-6 border border-[var(--danger)]/35">
              <p className="text-sm text-[var(--danger)]">{error}</p>
            </div>
          )}

          {/* Loading skeleton */}
          {loading && (
            <div className="space-y-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="rounded-xl overflow-hidden bg-zinc-900/50 border border-zinc-800/50 p-5">
                  <div className="skeleton h-5 w-1/3 mb-3" />
                  <div className="skeleton h-4 w-1/2 mb-2" />
                  <div className="skeleton h-4 w-1/4" />
                </div>
              ))}
            </div>
          )}

          {/* Empty state */}
          {!loading && !error && filtered.length === 0 && (
            <div className="glass-card p-10 text-center">
              <PackageOpen className="w-12 h-12 text-[var(--text-muted)] mx-auto mb-4" />
              <h2 className="text-xl font-semibold mb-2">
                {activeTab === 'all'
                  ? 'Нямате покупки'
                  : `Няма ${TABS.find((t) => t.key === activeTab)?.label.toLowerCase()} покупки`}
              </h2>
              <p className="text-[var(--text-secondary)]">
                Когато закупите съдържание, то ще се появи тук.
              </p>
            </div>
          )}

          {/* Purchase cards */}
          {!loading && filtered.length > 0 && (
            <AnimatePresence mode="popLayout">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.3 }}
                className="space-y-4"
              >
                {filtered.map((purchase) => (
                  <motion.div
                    key={purchase.id}
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.97 }}
                    transition={{ duration: 0.25 }}
                    className="rounded-xl bg-zinc-900/60 border border-zinc-800/50 p-5 hover:border-zinc-700/60 transition-colors"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start gap-4 justify-between">
                      <div className="flex-1 min-w-0">
                        {/* Target title */}
                        <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-1 truncate">
                          {purchase.target_title || `${purchase.target_type} #${purchase.target_id}`}
                        </h3>

                        {/* Production link */}
                        {purchase.production_title && (
                          <Link
                            to={`/productions/${purchase.production_slug}`}
                            className="text-sm text-[var(--accent-gold-light)] hover:text-[var(--accent-gold)] transition-colors no-underline"
                          >
                            {purchase.production_title}
                          </Link>
                        )}

                        {/* Details row */}
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-sm text-[var(--text-secondary)]">
                          {purchase.amount != null && (
                            <span className="font-medium text-[var(--text-primary)]">
                              {Number(purchase.amount).toFixed(2)} лв.
                            </span>
                          )}

                          {purchase.reference_code && (
                            <span className="font-mono text-xs bg-zinc-800/70 px-2 py-0.5 rounded">
                              {purchase.reference_code}
                            </span>
                          )}

                          <span>{formatDate(purchase.confirmed_at || purchase.created_at)}</span>
                        </div>

                        {/* Reject reason */}
                        {purchase.status === 'rejected' && purchase.reject_reason && (
                          <p className="mt-2 text-sm text-red-400/80">
                            Причина: {purchase.reject_reason}
                          </p>
                        )}
                      </div>

                      {/* Right side: badge + actions */}
                      <div className="flex flex-row sm:flex-col items-center sm:items-end gap-3">
                        <span
                          className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border ${statusClasses(purchase.status)}`}
                        >
                          {statusLabel(purchase.status)}
                        </span>

                        {purchase.status === 'pending' && (
                          <button
                            onClick={() => handleCancel(purchase.id)}
                            disabled={cancellingId === purchase.id}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <X className="w-3.5 h-3.5" />
                            {cancellingId === purchase.id ? 'Отменяне...' : 'Откажи'}
                          </button>
                        )}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </motion.div>
            </AnimatePresence>
          )}
        </motion.div>
      </div>
    </div>
  );
}
