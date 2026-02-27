import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Calendar, Shield, Sparkles, UserRound, ListVideo } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import SubscriptionBadge from '../components/SubscriptionBadge';
import ScrollReveal from '../components/ScrollReveal';
import { StaggerContainer, StaggerItem } from '../components/StaggerContainer';
import { formatDate } from '../utils/formatters';
import { getPublicSettings } from '../utils/settings';
import { api } from '../utils/api';
import PageBackground from '../components/PageBackground';
import ProductionCard from '../components/ProductionCard';

export default function ProfilePage() {
  const { user } = useAuth();
  const [s, setS] = useState({});
  const [watchlist, setWatchlist] = useState([]);
  const [watchlistIds, setWatchlistIds] = useState(new Set());
  const [loadingWatchlist, setLoadingWatchlist] = useState(true);

  useEffect(() => {
    getPublicSettings().then((data) => setS(data || {})).catch(() => { });

    Promise.all([
      api.get('/productions'),
      api.get('/watchlist')
    ]).then(([prods, wlIds]) => {
      if (Array.isArray(prods) && Array.isArray(wlIds)) {
        setWatchlistIds(new Set(wlIds));
        const filtered = prods.filter(p => wlIds.includes(p.id));
        setWatchlist(filtered);
      }
    }).catch(console.error).finally(() => setLoadingWatchlist(false));
  }, []);

  const toggleWatchlist = async (productionId) => {
    const isIn = watchlistIds.has(productionId);
    setWatchlistIds(prev => {
      const next = new Set(prev);
      if (isIn) next.delete(productionId); else next.add(productionId);
      return next;
    });
    setWatchlist(prev => {
      if (isIn) return prev.filter(p => p.id !== productionId);
      return prev;
    });

    try {
      if (isIn) await api.delete(`/watchlist/${productionId}`);
      else await api.post(`/watchlist/${productionId}`);
    } catch {
      // ignoring optimistic revert for brevity inside profile
    }
  };

  return (
    <div className="relative max-w-5xl mx-auto px-4 py-8 overflow-hidden">
      <PageBackground />

      {/* Header */}
      <ScrollReveal variant="fadeUp" className="mb-6">
        <section className="relative premium-panel p-5 sm:p-6">
          <div className="pill-chip mb-3 w-fit">
            <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
            {s.profile_badge_text || 'Публичен профил'}
          </div>
          <h1 className="text-3xl font-bold mb-2">{s.profile_title || 'Профил'}</h1>
          <p className="text-[var(--text-secondary)]">
            {s.profile_description || 'Тук управляваш видимите данни и статуса на достъпа си.'}
          </p>
        </section>
      </ScrollReveal>

      <div className="relative grid grid-cols-1 lg:grid-cols-[1.2fr_0.8fr] gap-5">
        {/* Left Column Container */}
        <div className="space-y-5">
          {/* Main profile card */}
          <ScrollReveal variant="fadeLeft" delay={0.1}>
            <section className="glass-card p-6">
              <div className="flex items-center gap-4 mb-6">
                {/* Animated avatar ring */}
                <div className="relative shrink-0">
                  {user?.discord_avatar ? (
                    <motion.div
                      className="relative"
                      whileHover={{ scale: 1.05 }}
                      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                    >
                      <div className="absolute -inset-[3px] rounded-2xl bg-[conic-gradient(from_0deg,var(--accent-gold),var(--accent-cyan),var(--accent-gold))] opacity-70" style={{ animation: 'spin-slow 4s linear infinite' }} />
                      <img
                        src={user.discord_avatar}
                        alt={user?.character_name ? `Аватар на ${user.character_name}` : 'Потребителски аватар'}
                        className="relative w-20 h-20 rounded-2xl border-2 border-[var(--bg-primary)] object-cover"
                      />
                    </motion.div>
                  ) : (
                    <div className="w-20 h-20 rounded-2xl bg-[var(--bg-tertiary)] border border-[var(--border)] flex items-center justify-center">
                      <UserRound className="w-10 h-10 text-[var(--text-muted)]" aria-hidden="true" />
                    </div>
                  )}
                </div>
                <div>
                  <h2 className="text-2xl font-semibold">{user?.character_name || 'Без публично име'}</h2>
                  <p className="text-[var(--text-secondary)] text-sm mt-1">Публично име в платформата</p>
                </div>
              </div>

              <StaggerContainer className="space-y-3">
                <StaggerItem>
                  <motion.article
                    className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4 flex items-center justify-between gap-3"
                    whileHover={{ y: -3, borderColor: 'rgba(212,175,55,0.3)', boxShadow: '0 6px 20px rgba(212,175,55,0.08)' }}
                    transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                  >
                    <div>
                      <p className="text-xs uppercase tracking-[0.16em] text-[var(--text-muted)] mb-1">{s.profile_active_plan_label || 'Активен план'}</p>
                      <SubscriptionBadge planName={user?.plan_name} tierLevel={user?.tier_level} />
                    </div>
                    <Link to="/subscribe" className="btn-outline no-underline text-sm">
                      {s.profile_manage_label || 'Управление'}
                    </Link>
                  </motion.article>
                </StaggerItem>

                {user?.subscription_expires_at && (
                  <StaggerItem>
                    <motion.article
                      className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4 flex items-center gap-3"
                      whileHover={{ y: -3, borderColor: 'rgba(212,175,55,0.3)', boxShadow: '0 6px 20px rgba(212,175,55,0.08)' }}
                      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                    >
                      <div className="w-10 h-10 rounded-lg bg-[var(--accent-gold)]/10 flex items-center justify-center shrink-0">
                        <Calendar className="w-5 h-5 text-[var(--accent-gold-light)]" aria-hidden="true" />
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-[0.16em] text-[var(--text-muted)] mb-1">{s.profile_valid_until_label || 'Валиден до'}</p>
                        <p className="font-semibold">{formatDate(user.subscription_expires_at)}</p>
                      </div>
                    </motion.article>
                  </StaggerItem>
                )}

                <StaggerItem>
                  <motion.article
                    className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4 flex items-center gap-3"
                    whileHover={{ y: -3, borderColor: 'rgba(75,197,255,0.3)', boxShadow: '0 6px 20px rgba(75,197,255,0.08)' }}
                    transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                  >
                    <div className="w-10 h-10 rounded-lg bg-[var(--accent-cyan)]/10 flex items-center justify-center shrink-0">
                      <Calendar className="w-5 h-5 text-[var(--accent-cyan)]" aria-hidden="true" />
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.16em] text-[var(--text-muted)] mb-1">{s.profile_member_since_label || 'Член от'}</p>
                      <p className="font-semibold">{formatDate(user?.created_at)}</p>
                    </div>
                  </motion.article>
                </StaggerItem>
              </StaggerContainer>
            </section>
          </ScrollReveal>

          {/* Watchlist Section */}
          <ScrollReveal variant="fadeUp" delay={0.2}>
            <section className="glass-card p-6 min-h-[300px]">
              <div className="flex items-center gap-3 mb-6">
                <ListVideo className="w-5 h-5 text-[var(--accent-gold)]" />
                <h2 className="text-xl font-semibold">Списък за гледане</h2>
              </div>

              {loadingWatchlist ? (
                <div className="text-center py-12">
                  <div className="w-8 h-8 rounded-full border-2 border-[var(--accent-gold)] border-t-transparent animate-spin mx-auto opacity-50 mb-3" />
                  <p className="text-[var(--text-muted)] text-sm">Зареждане...</p>
                </div>
              ) : watchlist.length > 0 ? (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {watchlist.map(p => (
                    <ProductionCard
                      key={p.id}
                      production={p}
                      isInWatchlist={watchlistIds.has(p.id)}
                      onToggleWatchlist={toggleWatchlist}
                    />
                  ))}
                </div>
              ) : (
                <div className="text-center py-10 bg-[var(--bg-secondary)]/50 rounded-xl border border-[var(--border)]">
                  <p className="text-[var(--text-muted)] mb-3">Още нямате добавени продукции.</p>
                  <Link to="/productions" className="text-[var(--accent-gold-light)] hover:text-[var(--accent-gold)] text-sm font-medium transition-colors">
                    Към каталога &rarr;
                  </Link>
                </div>
              )}
            </section>
          </ScrollReveal>
        </div>

        {/* Sidebar */}
        <ScrollReveal variant="fadeRight" delay={0.2}>
          <aside className="glass-card p-6 h-fit space-y-4 shadow-premium-md">
            <div className="flex items-center gap-2 mb-1">
              <Shield className="w-5 h-5 text-[var(--accent-gold-light)]" aria-hidden="true" />
              <h3 className="text-lg font-semibold">{s.profile_status_title || 'Статус'}</h3>
            </div>
            <p className="text-sm text-[var(--text-secondary)]">
              {s.profile_status_description || 'Абонаментите се активират ръчно от админ след потвърден превод с основание.'}
            </p>

            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4 space-y-2">
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-[var(--text-muted)] mb-0.5">Discord акаунт</p>
                <p className="font-semibold text-sm">{user?.discord_username || 'Неизвестен'}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-[var(--text-muted)] mb-0.5">Роля</p>
                <p className="font-semibold text-sm capitalize">{user?.role || 'Потребител'}</p>
              </div>
            </div>

            <motion.div whileHover={{ scale: 1.02, y: -1 }} whileTap={{ scale: 0.98 }}>
              <Link
                to="/subscribe"
                className="btn-outline no-underline text-sm w-full inline-flex items-center justify-center gap-2"
              >
                <Sparkles className="w-4 h-4" aria-hidden="true" />
                {s.profile_upgrade_button || 'Надгради плана си'}
              </Link>
            </motion.div>
          </aside>
        </ScrollReveal>
      </div>
    </div>
  );
}
