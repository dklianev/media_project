import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { CreditCard, Crown, Download, Eye, Film, Loader2, Tv, TrendingUp, Users } from 'lucide-react';
import { api, getTokens } from '../../utils/api';
import { getSofiaDateKey } from '../../utils/formatters';

const containerV = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06, delayChildren: 0.08 } },
};
const cardV = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] } },
};

async function downloadCsv(endpoint, filename) {
  const tokens = getTokens();
  const res = await fetch(`/api/admin/export/${endpoint}`, {
    headers: { Authorization: `Bearer ${tokens?.access_token}` },
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Грешка при изтегляне');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(null);

  useEffect(() => {
    api.get('/admin/dashboard')
      .then((data) => {
        setStats({
          totalUsers: Number(data.total_users || 0),
          subscribedUsers: Number(data.subscribed_users || 0),
          totalProductions: Number(data.total_productions || 0),
          totalEpisodes: Number(data.total_episodes || 0),
          totalViews: Number(data.total_views || 0),
          pendingPayments: Number(data.pending_payments || 0),
          confirmedPayments: Number(data.confirmed_payments || 0),
          rejectedPayments: Number(data.rejected_payments || 0),
          cancelledPayments: Number(data.cancelled_payments || 0),
          totalPayments: Number(data.total_payments || 0),
        });
      })
      .catch(() => {
        setStats(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const cards = stats
    ? [
      {
        label: 'Потребители',
        value: stats.totalUsers,
        sub: `${stats.subscribedUsers} с активен план`,
        icon: Users,
        color: '#5865F2',
        accent: 'from-[#5865F2]/20 to-[#5865F2]/5',
      },
      {
        label: 'Продукции',
        value: stats.totalProductions,
        icon: Film,
        color: 'var(--accent-gold)',
        accent: 'from-[#d4af37]/20 to-[#d4af37]/5',
      },
      {
        label: 'Епизоди',
        value: stats.totalEpisodes,
        icon: Tv,
        color: '#22c55e',
        accent: 'from-[#22c55e]/20 to-[#22c55e]/5',
      },
      {
        label: 'Гледания',
        value: stats.totalViews.toLocaleString('bg-BG'),
        icon: Eye,
        color: '#4bc5ff',
        accent: 'from-[#4bc5ff]/20 to-[#4bc5ff]/5',
      },
      {
        label: 'Чакащи плащания',
        value: stats.pendingPayments,
        sub: `от ${stats.totalPayments} общо`,
        icon: CreditCard,
        color: '#f59e0b',
        accent: 'from-[#f59e0b]/20 to-[#f59e0b]/5',
        highlight: stats.pendingPayments > 0,
      },
      {
        label: 'Обработени плащания',
        value: stats.confirmedPayments,
        sub: `${stats.rejectedPayments} отказани, ${stats.cancelledPayments} анулирани`,
        icon: TrendingUp,
        color: '#22c55e',
        accent: 'from-[#22c55e]/20 to-[#22c55e]/5',
      },
    ]
    : [];

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Crown className="w-6 h-6 text-[var(--accent-gold-light)]" />
        <h1 className="text-2xl font-bold">Табло</h1>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="skeleton h-28 rounded-xl" />
          ))}
        </div>
      ) : (
        <motion.div
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
          variants={containerV}
          initial="hidden"
          animate="visible"
        >
          {cards.map((card) => {
            const Icon = card.icon;
            return (
              <motion.div
                key={card.label}
                variants={cardV}
                whileHover={{ y: -4, boxShadow: '0 8px 24px rgba(0,0,0,0.15)' }}
                whileTap={{ scale: 0.98 }}
                transition={{ type: 'spring', stiffness: 260, damping: 20 }}
                className={`glass-card p-5 relative overflow-hidden group ${card.highlight ? 'border-[var(--warning)]/40' : ''}`}
              >
                {/* Subtle gradient background */}
                <div className={`absolute inset-0 bg-gradient-to-br ${card.accent} opacity-0 group-hover:opacity-100 transition-opacity duration-300`} />

                <div className="relative flex items-start justify-between">
                  <div>
                    <p className="text-sm text-[var(--text-muted)] mb-1">{card.label}</p>
                    <p className="text-3xl font-bold">{card.value}</p>
                    {card.sub && <p className="text-xs text-[var(--text-muted)] mt-1">{card.sub}</p>}
                  </div>
                  <div
                    className="p-2.5 rounded-lg transition-transform group-hover:scale-110"
                    style={{ background: `${card.color}15` }}
                  >
                    <Icon className="w-5 h-5" style={{ color: card.color }} />
                  </div>
                </div>

                {/* Highlight pulse for pending payments */}
                {card.highlight && (
                  <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-[var(--warning)] glow-pulse" />
                )}
              </motion.div>
            );
          })}
        </motion.div>
      )}

      {/* Quick stats summary */}
      {stats && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.4 }}
          className="mt-6 glass-card p-4"
        >
          <h3 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-[0.12em] mb-3">Обобщение</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-[var(--text-muted)]">Процент абонирани</p>
              <p className="text-lg font-bold text-[var(--accent-gold-light)]">
                {stats.totalUsers > 0 ? `${Math.round((stats.subscribedUsers / stats.totalUsers) * 100)}%` : '0%'}
              </p>
            </div>
            <div>
              <p className="text-xs text-[var(--text-muted)]">Ср. гледания / епизод</p>
              <p className="text-lg font-bold text-[#4bc5ff]">
                {stats.totalEpisodes > 0 ? Math.round(stats.totalViews / stats.totalEpisodes).toLocaleString('bg-BG') : '0'}
              </p>
            </div>
            <div>
              <p className="text-xs text-[var(--text-muted)]">Потвърдени плащания</p>
              <p className="text-lg font-bold text-[var(--success)]">
                {stats.totalPayments > 0 ? `${Math.round((stats.confirmedPayments / stats.totalPayments) * 100)}%` : '0%'}
              </p>
            </div>
            <div>
              <p className="text-xs text-[var(--text-muted)]">Еп. / Продукция</p>
              <p className="text-lg font-bold">
                {stats.totalProductions > 0 ? (stats.totalEpisodes / stats.totalProductions).toFixed(1) : '0'}
              </p>
            </div>
          </div>
        </motion.div>
      )}

      {/* CSV Export */}
      {stats && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 0.4 }}
          className="mt-6"
        >
          <div className="glass-card p-5 sm:p-6 flex flex-col md:flex-row md:items-center justify-between gap-5 border-l-4 border-l-[var(--accent-cyan)]">
            <div>
              <h3 className="text-lg font-bold text-[var(--text-primary)] mb-1 flex items-center gap-2">
                <Download className="w-5 h-5 text-[var(--accent-cyan)]" />
                Експорт на данни
              </h3>
              <p className="text-sm text-[var(--text-secondary)]">Изтеглете таблични (CSV) файлове със списък на всички потребители или плащания.</p>
            </div>
            <div className="flex flex-wrap items-center gap-3 shrink-0">
              <button
                disabled={exporting === 'users'}
                onClick={async () => {
                  setExporting('users');
                  try {
                    await downloadCsv('users', `users-${getSofiaDateKey(new Date())}.csv`);
                  } catch { /* ignore */ }
                  setExporting(null);
                }}
                className="btn-outline inline-flex items-center gap-2 text-sm disabled:opacity-50 hover:scale-[1.02] active:scale-[0.97]"
              >
                {exporting === 'users' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                Потребители (CSV)
              </button>
              <button
                disabled={exporting === 'payments'}
                onClick={async () => {
                  setExporting('payments');
                  try {
                    await downloadCsv('payments', `payments-${getSofiaDateKey(new Date())}.csv`);
                  } catch { /* ignore */ }
                  setExporting(null);
                }}
                className="btn-outline inline-flex items-center gap-2 text-sm disabled:opacity-50 hover:scale-[1.02] active:scale-[0.97]"
              >
                {exporting === 'payments' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                Плащания (CSV)
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}
