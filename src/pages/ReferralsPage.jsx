import { useEffect, useState } from 'react';
import { motion } from '@/lib/motion';
import { Copy, Gift, Users, CalendarCheck, Clock } from 'lucide-react';
import { api } from '../utils/api';
import { useToastContext } from '../context/ToastContext';
import PageBackground from '../components/PageBackground';
import ScrollReveal from '../components/ScrollReveal';

const STATS_CARDS = [
  { key: 'total_referred', label: 'Общо поканени', icon: Users, color: 'var(--accent, #6366f1)' },
  { key: 'total_bonus_days', label: 'Спечелени дни', icon: CalendarCheck, color: 'var(--success, #22c55e)' },
  { key: 'pending_rewards', label: 'Чакащи награди', icon: Clock, color: 'var(--warning, #f59e0b)' },
];

function StatCardSkeleton() {
  return (
    <div className="glass-card p-5 flex items-center gap-4 min-h-[92px]">
      <div className="w-12 h-12 rounded-2xl bg-[var(--bg-tertiary)] animate-pulse shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-3 w-24 rounded-full bg-[var(--bg-tertiary)] animate-pulse" />
        <div className="h-6 w-16 rounded-full bg-[var(--bg-tertiary)] animate-pulse" />
      </div>
    </div>
  );
}

export default function ReferralsPage() {
  const { showToast } = useToastContext();
  const [referralCode, setReferralCode] = useState('');
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      try {
        const [codeRes, statsRes] = await Promise.all([
          api.get('/referrals/my-code'),
          api.get('/referrals/stats'),
        ]);
        if (!cancelled) {
          setReferralCode(codeRes.code || '');
          setStats(statsRes);
        }
      } catch (err) {
        console.error('Referrals load error:', err);
        if (!cancelled) {
          showToast('Грешка при зареждане на реферална информация.', 'error');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchData();
    return () => { cancelled = true; };
  }, [showToast]);

  const copyCode = async () => {
    if (!referralCode) return;
    try {
      await navigator.clipboard.writeText(referralCode);
      showToast('Кодът е копиран в клипборда.');
    } catch {
      showToast('Неуспешно копиране.', 'error');
    }
  };

  const applyRewards = async () => {
    setApplying(true);
    try {
      await api.post('/referrals/apply-rewards');
      const updated = await api.get('/referrals/stats');
      setStats(updated);
      showToast('Бонус дните са активирани успешно!', 'success');
    } catch (err) {
      console.error('Apply rewards error:', err);
      showToast('Грешка при активиране на бонус дни.', 'error');
    } finally {
      setApplying(false);
    }
  };

  return (
    <>
      <PageBackground />

      <motion.div
        className="max-w-3xl mx-auto px-4 py-12 space-y-10"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        {/* Title */}
        <ScrollReveal>
          <div className="text-center space-y-2">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[var(--accent,#6366f1)]/15 mb-2">
              <Gift className="w-7 h-7 text-[var(--accent,#6366f1)]" />
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold text-[var(--text-primary)]">
              Препоръчай приятел
            </h1>
            <p className="text-[var(--text-secondary)] text-sm sm:text-base max-w-md mx-auto">
              Сподели своя реферален код и печели бонус дни за всеки нов потребител.
            </p>
          </div>
        </ScrollReveal>

        {/* Referral code */}
        <ScrollReveal>
          <div className="glass-card p-6 flex flex-col sm:flex-row items-center gap-4">
            <div className="flex-1 text-center sm:text-left">
              <p className="text-sm text-[var(--text-secondary)] mb-1">Твоят код:</p>
              {loading ? (
                <div className="h-8 w-48 rounded-full bg-[var(--bg-tertiary)] animate-pulse" />
              ) : (
                <span className="text-2xl font-mono font-bold tracking-wider text-[var(--text-primary)]">
                  {referralCode}
                </span>
              )}
            </div>
            <button
              onClick={copyCode}
              disabled={loading || !referralCode}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--accent,#6366f1)] text-white font-medium text-sm transition-all hover:brightness-110 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Copy className="w-4 h-4" />
              Копирай
            </button>
          </div>
        </ScrollReveal>

        {/* Stats */}
        <ScrollReveal>
          {loading ? (
            <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <StatCardSkeleton key={i} />
              ))}
            </section>
          ) : (
            <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {STATS_CARDS.map((card) => {
                const Icon = card.icon;
                return (
                  <motion.div
                    key={card.key}
                    className="glass-card p-5 flex items-center gap-4"
                    whileHover={{ scale: 1.02 }}
                    transition={{ type: 'spring', stiffness: 300 }}
                  >
                    <div
                      className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
                      style={{ backgroundColor: `color-mix(in srgb, ${card.color} 15%, transparent)` }}
                    >
                      <Icon className="w-6 h-6" style={{ color: card.color }} />
                    </div>
                    <div>
                      <p className="text-xs text-[var(--text-secondary)]">{card.label}</p>
                      <p className="text-2xl font-bold text-[var(--text-primary)]">
                        {stats?.[card.key] ?? 0}
                      </p>
                    </div>
                  </motion.div>
                );
              })}
            </section>
          )}
        </ScrollReveal>

        {/* Apply rewards button */}
        {stats?.pending_rewards > 0 && (
          <ScrollReveal>
            <div className="text-center">
              <motion.button
                onClick={applyRewards}
                disabled={applying}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[var(--success,#22c55e)] text-white font-semibold text-sm transition-all hover:brightness-110 active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
              >
                <Gift className="w-5 h-5" />
                {applying ? 'Активиране...' : `Активирай ${stats.pending_rewards} бонус награди`}
              </motion.button>
            </div>
          </ScrollReveal>
        )}

        {/* How it works */}
        <ScrollReveal>
          <div className="glass-card p-6 space-y-4">
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">
              Как работи?
            </h2>
            <ol className="list-decimal list-inside space-y-2 text-sm text-[var(--text-secondary)] leading-relaxed">
              <li>Копирай своя реферален код и го сподели с приятел.</li>
              <li>Когато приятелят ти се регистрира и въведе кода, и двамата получавате бонус дни.</li>
              <li>Бонус дните се натрупват в секцията „Чакащи дни" и можеш да ги активираш по всяко време.</li>
              <li>Няма ограничение за броя покани — колкото повече приятели поканиш, толкова повече печелиш.</li>
            </ol>
          </div>
        </ScrollReveal>
      </motion.div>
    </>
  );
}
