import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Calendar, Shield, Sparkles, UserRound, ListVideo, Clock, PlayCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import SubscriptionBadge from '../components/SubscriptionBadge';
import ScrollReveal from '../components/ScrollReveal';
import { StaggerContainer, StaggerItem } from '../components/StaggerContainer';
import { formatDate } from '../utils/formatters';
import { getPublicSettings } from '../utils/settings';
import { api } from '../utils/api';
import PageBackground from '../components/PageBackground';
import ProductionCard from '../components/ProductionCard';
import { useToastContext } from '../context/ToastContext';

function ProfileStatSkeleton() {
  return (
    <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className="glass-card p-5 flex items-center gap-4 min-h-[92px]">
          <div className="w-12 h-12 rounded-2xl bg-[var(--bg-tertiary)] animate-pulse shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-24 rounded-full bg-[var(--bg-tertiary)] animate-pulse" />
            <div className="h-6 w-16 rounded-full bg-[var(--bg-tertiary)] animate-pulse" />
          </div>
        </div>
      ))}
    </section>
  );
}

function RecentlyWatchedSkeleton() {
  return (
    <>
      <div className="flex items-center justify-between mb-4 px-1">
        <div className="h-6 w-44 rounded-full bg-[var(--bg-tertiary)] animate-pulse" />
        <div className="h-4 w-20 rounded-full bg-[var(--bg-tertiary)] animate-pulse" />
      </div>
      <div className="flex gap-4 overflow-x-auto pb-4 custom-scrollbar">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="shrink-0 w-[240px] rounded-2xl bg-[var(--bg-secondary)] border border-[var(--border)] overflow-hidden shadow-lg"
          >
            <div className="aspect-video bg-[var(--bg-tertiary)] animate-pulse" />
            <div className="p-3 pt-3 space-y-2">
              <div className="h-4 w-4/5 rounded-full bg-[var(--bg-tertiary)] animate-pulse" />
              <div className="h-3 w-3/5 rounded-full bg-[var(--bg-tertiary)] animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

export default function ProfilePage() {
  const location = useLocation();
  const { user } = useAuth();
  const { showToast } = useToastContext();
  const [s, setS] = useState({});
  const [watchlist, setWatchlist] = useState([]);
  const [watchlistIds, setWatchlistIds] = useState(new Set());
  const [recentlyWatched, setRecentlyWatched] = useState([]);
  const [loadingWatchlist, setLoadingWatchlist] = useState(true);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    getPublicSettings().then((data) => setS(data || {})).catch(() => { });

    api.get('/watchlist/items')
      .then((items) => {
        const normalizedItems = Array.isArray(items) ? items : [];
        setWatchlistIds(new Set(normalizedItems.map((item) => item.id)));
        setWatchlist(normalizedItems);
      })
      .catch(console.error)
      .finally(() => setLoadingWatchlist(false));

    api.get('/users/me/stats')
      .then((data) => {
        setStats(data);
        setRecentlyWatched(Array.isArray(data?.recently_watched) ? data.recently_watched : []);
      })
      .catch(console.error)
      .finally(() => setLoadingSummary(false));
  }, []);

  useEffect(() => {
    if (!location.hash || loadingSummary || loadingWatchlist) return;

    const targetId = location.hash.replace('#', '');
    const scrollToTarget = () => {
      const target = document.getElementById(targetId);
      if (!target) return;
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    const timeoutId = window.setTimeout(scrollToTarget, 80);
    return () => window.clearTimeout(timeoutId);
  }, [location.hash, loadingSummary, loadingWatchlist]);

  const toggleWatchlist = async (productionId) => {
    const isIn = watchlistIds.has(productionId);
    const previousWatchlistIds = new Set(watchlistIds);
    const previousWatchlist = watchlist;

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
      setWatchlistIds(previousWatchlistIds);
      setWatchlist(previousWatchlist);
      showToast('Възникна грешка при запазване в любими.', 'error');
    }
  };

  return (
    <div className="relative max-w-6xl mx-auto px-4 py-8 overflow-hidden min-h-screen flex flex-col gap-6">
      <PageBackground />

      {/* Page Title */}
      <ScrollReveal variant="fadeUp" className="mb-2">
        <div className="flex items-center gap-3">
          <UserRound className="w-8 h-8 text-[var(--accent-gold)]" />
          <h1 className="text-3xl font-bold">{s.profile_title || 'Твоят Профил'}</h1>
        </div>
        <p className="text-[var(--text-secondary)] mt-1 ml-11">
          {s.profile_description || 'Управлявай данните, абонаментите и историята си тук.'}
        </p>
      </ScrollReveal>

      {/* --- 1. HERO BANNER --- */}
      <ScrollReveal variant="fadeUp" delay={0.1}>
        <section className="relative glass-card overflow-hidden group">
          {/* Decorative backdrop glow */}
          <div className="aurora-bg opacity-40 group-hover:opacity-60 transition-opacity duration-1000" />
          <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-[var(--accent-cyan)] opacity-10 blur-[120px] rounded-full pointer-events-none translate-x-1/2 -translate-y-1/2" />
          <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-[var(--accent-gold)] opacity-10 blur-[100px] rounded-full pointer-events-none -translate-x-1/2 translate-y-1/2" />

          <div className="relative z-10 p-6 sm:p-8 flex flex-col md:flex-row items-center gap-8">
            {/* Avatar Section */}
            <div className="shrink-0 relative">
              {user?.discord_avatar ? (
                <motion.div
                  className="relative"
                  whileHover={{ scale: 1.05 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                >
                  <div className="absolute -inset-[6px] rounded-[40px] bg-[conic-gradient(from_0deg,var(--accent-gold),var(--accent-cyan),var(--accent-gold))] opacity-90" />
                  <div className="absolute -inset-[3px] rounded-[36px] bg-[var(--accent-gold)] blur-md opacity-30 mix-blend-screen animate-[glow-pulse_3s_ease-in-out_infinite]" />
                  <img
                    src={user.discord_avatar}
                    alt={user?.character_name ? `Аватар на ${user.character_name}` : 'Аватар'}
                    className="relative w-32 h-32 md:w-40 md:h-40 rounded-3xl border-4 border-[var(--bg-secondary)] object-cover shadow-2xl z-10"
                  />
                </motion.div>
              ) : (
                <div className="w-32 h-32 md:w-40 md:h-40 rounded-3xl bg-[var(--bg-tertiary)] border-2 border-[var(--border)] flex items-center justify-center shadow-xl">
                  <UserRound className="w-16 h-16 text-[var(--text-muted)]" />
                </div>
              )}

              {/* Status Badge Over Avatar */}
              <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 flex items-center justify-center gap-1.5 px-3 py-1 rounded-full bg-[var(--bg-card)] border border-[var(--border)] shadow-lg shadow-black/50 whitespace-nowrap z-20">
                <Shield className="w-3 h-3 text-[var(--accent-gold)]" />
                <span className="text-[10px] uppercase tracking-wider font-bold text-[var(--text-primary)] drop-shadow-md">
                  {user?.role === 'superadmin' ? 'Администратор' :
                    user?.role === 'admin' ? 'Модератор' :
                      user?.role === 'vip' ? 'VIP Потребител' : 'Потребител'}
                </span>
              </div>
            </div>

            {/* Info Section */}
            <div className="flex-1 flex flex-col md:flex-row gap-6 md:gap-10 items-center md:items-stretch justify-between w-full text-center md:text-left">
              <div className="flex flex-col justify-center">
                <div className="pill-chip mb-3 w-fit mx-auto md:mx-0">
                  <Sparkles className="w-3.5 h-3.5" />
                  {s.profile_badge_text || 'Публичен профил'}
                </div>
                <h2 className="text-3xl md:text-4xl font-bold mt-1 text-[var(--text-primary)]">
                  {user?.character_name || 'Без публично име'}
                </h2>
                <div className="flex items-center gap-2 mt-2 justify-center md:justify-start text-sm text-[var(--text-secondary)]">
                  <span className="bg-[#5865F2]/20 text-[#5865F2] px-2 py-0.5 rounded text-xs font-semibold uppercase tracking-wider">Discord</span>
                  <span>{user?.discord_username || 'Несвързан'}</span>
                </div>
              </div>

              <div className="h-px md:h-auto md:w-px w-full bg-gradient-to-b from-transparent via-[var(--border)] to-transparent" />

              {/* Plan Section */}
              <div className="flex flex-col justify-center min-w-[200px] space-y-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.16em] text-[var(--text-muted)] mb-2 block">{s.profile_active_plan_label || 'Твоят План'}</p>
                  <div className="flex items-center justify-center md:justify-start">
                    <SubscriptionBadge planName={user?.plan_name} tierLevel={user?.tier_level} />
                  </div>
                </div>

                {user?.subscription_expires_at && (
                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-[var(--text-muted)] mb-1 block">Валиден до</p>
                    <p className="text-sm font-semibold">{formatDate(user.subscription_expires_at)}</p>
                  </div>
                )}

                <Link to="/subscribe" className="btn-outline no-underline text-xs flex justify-center w-full">
                  {s.profile_upgrade_button || 'Управление на плана'}
                </Link>
              </div>
            </div>
          </div>
        </section>
      </ScrollReveal>

      {/* --- 2. DASHBOARD STATS ROW --- */}
      <div className="min-h-[124px]">
        <ScrollReveal variant="fadeUp" delay={0.2}>
          {loadingSummary ? (
            <ProfileStatSkeleton />
          ) : (
            <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <motion.div
                whileHover={{ y: -5, scale: 1.02 }}
                className="glass-card p-5 flex items-center gap-4 hover:border-[var(--accent-gold)]/40 hover:shadow-[0_8px_30px_rgba(212,175,55,0.15)] transition-all cursor-default"
              >
                <div className="w-12 h-12 rounded-2xl bg-[var(--accent-gold)]/10 flex items-center justify-center shrink-0">
                  <Clock className="w-6 h-6 text-[var(--accent-gold)]" />
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.1em] text-[var(--text-muted)] mb-0.5 font-bold">{s.profile_stat_time || 'Гледано време'}</p>
                  <div className="text-xl font-bold tracking-tight text-[var(--text-primary)] drop-shadow-sm">
                    <span className="font-sans text-[var(--accent-gold)]">{Math.floor((stats?.total_watch_seconds || 0) / 3600)}</span><span className="text-sm text-[var(--text-secondary)] ml-0.5 lowercase font-normal">ч</span>{' '}
                    <span className="font-sans text-[var(--accent-gold)] ml-1">{Math.floor(((stats?.total_watch_seconds || 0) % 3600) / 60)}</span><span className="text-sm text-[var(--text-secondary)] ml-0.5 lowercase font-normal">м</span>
                  </div>
                </div>
              </motion.div>

              <motion.div
                whileHover={{ y: -5, scale: 1.02 }}
                className="glass-card p-5 flex items-center gap-4 hover:border-[var(--accent-cyan)]/40 hover:shadow-[0_8px_30px_rgba(75,197,255,0.15)] transition-all cursor-default"
              >
                <div className="w-12 h-12 rounded-2xl bg-[var(--accent-cyan)]/10 flex items-center justify-center shrink-0">
                  <PlayCircle className="w-6 h-6 text-[var(--accent-cyan)]" />
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.1em] text-[var(--text-muted)] mb-0.5 font-bold">{s.profile_stat_episodes || 'Започнати епизоди'}</p>
                  <h3 className="text-xl font-bold font-sans tracking-tight text-[var(--accent-cyan)] drop-shadow-sm">{stats?.episodes_started || 0}</h3>
                </div>
              </motion.div>

              <motion.div
                whileHover={{ y: -5, scale: 1.02 }}
                className="glass-card p-5 flex items-center gap-4 hover:border-[var(--success)]/40 hover:shadow-[0_8px_30px_rgba(34,197,94,0.15)] transition-all cursor-default"
              >
                <div className="w-12 h-12 rounded-2xl bg-[var(--success)]/10 flex items-center justify-center shrink-0">
                  <Calendar className="w-6 h-6 text-[var(--success)]" />
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.1em] text-[var(--text-muted)] mb-0.5 font-bold">{s.profile_member_since_label || 'Член от'}</p>
                  <h3 className="text-lg font-bold tracking-tight text-[var(--text-primary)] drop-shadow-sm">{formatDate(user?.created_at)}</h3>
                </div>
              </motion.div>
            </section>
          )}
        </ScrollReveal>
      </div>

      {/* --- 3. RECENTLY WATCHED HORIZONTAL ROW --- */}
      <div
        id="recently-watched"
        style={{ scrollMarginTop: 'calc(var(--app-chrome-offset, 0px) + 24px)' }}
      >
        {(loadingSummary || recentlyWatched.length > 0) && (
          <ScrollReveal variant="fadeUp" delay={0.25} className="mt-2">
            {loadingSummary ? (
              <RecentlyWatchedSkeleton />
            ) : (
              <>
                <div className="flex items-center justify-between mb-4 px-1">
                  <h2 className="text-xl font-semibold flex items-center gap-2 text-[var(--text-primary)]">
                    <PlayCircle className="w-5 h-5 text-[var(--accent-cyan)]" />
                    {s.profile_stat_recent || 'Последно гледани'}
                  </h2>
                  <Link to="/productions" className="text-sm font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
                    Виж всички &rarr;
                  </Link>
                </div>

                <div className="flex gap-4 overflow-x-auto pb-4 custom-scrollbar snap-x snap-mandatory">
                  {recentlyWatched.map(item => (
                    <Link
                      key={item.episode_id}
                      to={`/episodes/${item.episode_id}`}
                      className="snap-start shrink-0 w-[240px] flex flex-col gap-3 rounded-2xl bg-[var(--bg-secondary)] border border-[var(--border)] overflow-hidden hover:border-[var(--accent-cyan)] transition-colors no-underline group shadow-lg"
                    >
                      <div className="w-full aspect-video bg-[var(--bg-tertiary)] relative">
                        {item.thumbnail_url ? (
                          <img src={item.thumbnail_url} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-[10px] text-[var(--text-muted)]">Няма Изглед</div>
                        )}
                        {/* Fine Progress Bar */}
                        <div className="absolute inset-x-0 bottom-0 h-1 bg-black/60 backdrop-blur-sm z-10 transition-all">
                          <div
                            className="h-full bg-[var(--accent-cyan)] shadow-[0_0_10px_var(--accent-cyan)] transition-all duration-300"
                            style={{ width: `${Math.max(0.5, Math.min(100, (item.progress_seconds / Math.max(1, item.duration_seconds || 1)) * 100))}%` }}
                          />
                        </div>
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none z-20">
                          <PlayCircle className="w-10 h-10 text-white fill-[var(--accent-cyan)]/80 drop-shadow-lg" />
                        </div>
                      </div>

                      <div className="p-3 pt-1 min-w-0">
                        <p className="text-[13px] font-semibold text-[var(--text-primary)] truncate group-hover:text-[var(--accent-cyan)] transition-colors">
                          {item.production_title}
                        </p>
                        <p className="text-[11px] text-[var(--text-secondary)] truncate mt-0.5">
                          {item.episode_title}
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>
              </>
            )}
          </ScrollReveal>
        )}
      </div>

      {/* --- 4. FULL WIDTH WATCHLIST --- */}
      <ScrollReveal variant="fadeUp" delay={0.3} className="mt-2 flex-1">
        <section className="glass-card p-6 min-h-[350px]">
          <div className="flex items-center justify-between mb-8 border-b border-[var(--border)]/50 pb-4">
            <div className="flex items-center gap-3">
              <ListVideo className="w-6 h-6 text-[var(--accent-gold)]" />
              <h2 className="text-2xl font-semibold text-[var(--text-primary)]">Моят Списък за гледане</h2>
            </div>
            <div className="px-3 py-1 rounded-full bg-[var(--bg-secondary)] border border-[var(--border)] text-xs font-semibold text-[var(--text-secondary)]">
              {watchlist.length} {watchlist.length === 1 ? 'Заглавие' : 'Заглавия'}
            </div>
          </div>

          {loadingWatchlist ? (
            <div className="text-center py-20">
              <div className="w-10 h-10 rounded-full border-2 border-[var(--accent-gold)] border-t-transparent animate-spin mx-auto opacity-70 mb-4" />
              <p className="text-[var(--text-secondary)] font-medium">Зареждане на списъка...</p>
            </div>
          ) : watchlist.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
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
            <StaggerContainer className="flex flex-col items-center justify-center text-center py-20 px-4 bg-[var(--bg-secondary)]/30 rounded-2xl border border-[var(--border)]/50 border-dashed relative overflow-hidden group">
              {/* Ambient Glow for Empty State */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-[var(--accent-gold)] opacity-5 blur-[80px] rounded-full group-hover:opacity-10 transition-opacity duration-700 pointer-events-none" />

              <StaggerItem>
                <div className="relative w-20 h-20 rounded-full bg-[var(--bg-tertiary)] flex items-center justify-center mb-6 shadow-xl border border-[var(--border)] group-hover:border-[var(--accent-gold)]/30 transition-colors">
                  <ListVideo className="w-10 h-10 text-[var(--accent-gold)] opacity-70 drop-shadow-[0_0_15px_rgba(212,175,55,0.4)] animate-[float-slow_4s_ease-in-out_infinite]" />
                </div>
              </StaggerItem>

              <StaggerItem>
                <h3 className="text-xl font-bold text-[var(--text-primary)] mb-2 tracking-tight">Списъкът ти е празен</h3>
              </StaggerItem>

              <StaggerItem>
                <p className="text-[var(--text-secondary)] mb-8 max-w-sm text-sm">
                  Разгледай нашия огромен каталог и добави любимите си сериали и филми тук за бърз достъп по всяко време.
                </p>
              </StaggerItem>

              <StaggerItem>
                <div className="mt-8">
                  <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                    <Link to="/productions" className="btn-gold inline-flex items-center justify-center gap-2 shadow-[0_10px_30px_rgba(212,175,55,0.25)] px-6 py-3 rounded-xl text-sm uppercase tracking-widest cursor-pointer">
                      <Sparkles className="w-4 h-4" /> Към каталога
                    </Link>
                  </motion.div>
                </div>
              </StaggerItem>
            </StaggerContainer>
          )}
        </section>
      </ScrollReveal>
    </div>
  );
}
