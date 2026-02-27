import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowRight,
  Clapperboard,
  Clock,
  Crown,
  Heart,
  Play,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import { api } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { useToastContext } from '../context/ToastContext';
import ProductionCard from '../components/ProductionCard';
import EpisodeCard from '../components/EpisodeCard';
import SubscriptionBadge from '../components/SubscriptionBadge';
import HorizontalScroller from '../components/HorizontalScroller';
import ScrollReveal from '../components/ScrollReveal';
import { StaggerContainer, StaggerItem } from '../components/StaggerContainer';
import PageBackground from '../components/PageBackground';
import { getPublicSettings } from '../utils/settings';

export default function HomePage() {
  const { user } = useAuth();
  const { showToast } = useToastContext();
  const [productions, setProductions] = useState([]);
  const [latestEpisodes, setLatestEpisodes] = useState([]);
  const [watchHistory, setWatchHistory] = useState([]);
  const [watchlistIds, setWatchlistIds] = useState(new Set());
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const [prods, latest, history, wlIds, publicSettings] = await Promise.all([
          api.get('/productions'),
          api.get('/episodes/latest?limit=12'),
          api.get('/watch-history?limit=8').catch(() => []),
          api.get('/watchlist').catch(() => []),
          getPublicSettings(),
        ]);
        if (!active) return;

        setProductions(prods);
        setLatestEpisodes(Array.isArray(latest) ? latest : []);
        setWatchHistory(Array.isArray(history) ? history : []);
        setWatchlistIds(new Set(Array.isArray(wlIds) ? wlIds : []));
        setSettings(publicSettings || {});
        setError('');
      } catch (error) {
        setError(error.message || 'Неуспешно зареждане на началната страница.');
      } finally {
        if (active) setLoading(false);
      }
    }

    load();
    return () => { active = false; };
  }, []);

  const toggleWatchlist = useCallback(async (productionId) => {
    const isIn = watchlistIds.has(productionId);
    // Optimistic update
    setWatchlistIds((prev) => {
      const next = new Set(prev);
      if (isIn) next.delete(productionId);
      else next.add(productionId);
      return next;
    });
    try {
      if (isIn) {
        await api.delete(`/watchlist/${productionId}`);
      } else {
        await api.post(`/watchlist/${productionId}`);
      }
    } catch {
      // Revert on error
      setWatchlistIds((prev) => {
        const next = new Set(prev);
        if (isIn) next.add(productionId);
        else next.delete(productionId);
        return next;
      });
      showToast('Неуспешна промяна в любими.', 'error');
    }
  }, [watchlistIds, showToast]);

  const carouselItems = useMemo(() => {
    let items = productions.filter((item) => item.has_access);
    if (items.length === 0) items = productions;
    return items.slice(0, 5);
  }, [productions]);

  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);

  useEffect(() => {
    if (carouselItems.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentSlideIndex((prev) => (prev + 1) % carouselItems.length);
    }, 7000); // Rotate every 7 seconds
    return () => clearInterval(interval);
  }, [carouselItems]);

  const featured = carouselItems[currentSlideIndex] || null;

  const freeProductions = productions.filter((item) => item.access_group === 'free');
  const trailerProductions = productions.filter((item) => item.access_group === 'trailer');
  const subscriptionProductions = productions.filter((item) => item.access_group === 'subscription');

  return (
    <div className="relative min-h-screen pb-12">
      <PageBackground />

      <div className="relative max-w-7xl mx-auto px-4 py-8 sm:py-10">
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          className="premium-panel p-6 sm:p-8 mb-10 overflow-hidden"
        >
          <div className="absolute -right-20 -top-20 h-56 w-56 rounded-full bg-[var(--accent-gold)]/15 blur-3xl pointer-events-none" />
          <div className="absolute -left-20 bottom-0 h-60 w-60 rounded-full bg-[var(--accent-cyan)]/14 blur-3xl pointer-events-none" />

          <div className="relative grid grid-cols-1 lg:grid-cols-[1.2fr_0.9fr] gap-7 items-center">
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-4">
                <span className="pill-chip">
                  <Sparkles className="w-3.5 h-3.5" />
                  {settings.home_hero_pill_1 || 'Ново'}
                </span>
                <span className="pill-chip">
                  <TrendingUp className="w-3.5 h-3.5" />
                  {settings.home_hero_pill_2 || 'Всяка седмица'}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-3 mb-4">
                {user?.discord_avatar && (
                  <img
                    src={user.discord_avatar}
                    alt={user?.character_name ? `Аватар на ${user.character_name}` : 'Потребителски аватар'}
                    className="w-11 h-11 rounded-full border border-[var(--accent-gold)]/45"
                  />
                )}
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-muted)]">Активен профил</p>
                  <p className="font-semibold">{user?.character_name}</p>
                </div>
                <SubscriptionBadge planName={user?.plan_name} tierLevel={user?.tier_level} />
              </div>

              <AnimatePresence mode="popLayout">
                <motion.div
                  key={featured?.id || 'empty-hero'}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -15 }}
                  transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                >
                  <h1 className="font-display text-5xl sm:text-6xl text-gradient-premium leading-tight">
                    {settings.hero_title || featured?.title || `Добре дошли в ${settings.site_name || 'Elite Media'}`}
                  </h1>
                  <p className="mt-4 max-w-2xl text-[var(--text-secondary)] text-base sm:text-lg font-sans tracking-normal leading-relaxed">
                    {settings.hero_subtitle || featured?.description || 'Ново съдържание всяка седмица.'}
                  </p>
                </motion.div>
              </AnimatePresence>

              <div className="mt-7 flex flex-wrap gap-3">
                <Link to="/productions" className="btn-gold no-underline inline-flex items-center gap-2">
                  <Play className="w-4 h-4" />
                  {settings.home_hero_button_1 || 'Гледай сега'}
                </Link>
                <Link to="/subscribe" className="btn-outline no-underline inline-flex items-center gap-2">
                  <Crown className="w-4 h-4" />
                  {settings.home_hero_button_2 || 'Виж плановете'}
                </Link>
              </div>
            </div>

            <div className="film-frame">
              <div className="relative rounded-xl overflow-hidden border border-[var(--border)] group">
                <AnimatePresence mode="popLayout">
                  <motion.div
                    key={featured?.id || 'empty-cover'}
                    initial={{ opacity: 0, filter: 'blur(10px)', scale: 1.05 }}
                    animate={{ opacity: 1, filter: 'blur(0px)', scale: 1 }}
                    exit={{ opacity: 0, filter: 'blur(4px)', scale: 0.98 }}
                    transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                    className="w-full aspect-[4/3] bg-[var(--bg-tertiary)]"
                  >
                    {featured?.cover_image_url || settings.hero_image ? (
                      <img
                        src={featured?.cover_image_url || settings.hero_image}
                        alt={featured?.title || 'Акцентно съдържание'}
                        decoding="async"
                        fetchPriority="high"
                        className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-105"
                      />
                    ) : (
                      <div className="w-full h-full" style={{ background: 'var(--gradient-hero)' }} />
                    )}
                  </motion.div>
                </AnimatePresence>

                <div className="absolute inset-0 bg-gradient-to-t from-[#04060f] via-[#04060f]/35 to-transparent pointer-events-none" />
                <div className="absolute inset-x-0 bottom-0 p-4 pointer-events-none">
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={featured?.id || 'empty-badge'}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.4, delay: 0.2 }}
                    >
                      <p className="text-xs text-[var(--text-muted)] uppercase tracking-[0.18em] mb-1">Акцент</p>
                      <p className="text-xl font-semibold">{featured?.title || 'Предстоящо заглавие'}</p>
                    </motion.div>
                  </AnimatePresence>
                </div>

                {/* Carousel Indicators */}
                {carouselItems.length > 1 && (
                  <div className="absolute top-4 right-4 flex gap-1.5 z-10">
                    {carouselItems.map((_, idx) => (
                      <div
                        key={idx}
                        className={`h-1 rounded-full transition-all duration-300 ${idx === currentSlideIndex ? 'w-5 bg-[var(--accent-gold)]' : 'w-2 bg-white/20'
                          }`}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="relative mt-6 grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: settings.home_metric_productions || 'Продукции', value: productions.length },
              { label: settings.home_latest_title || 'Най-нови епизоди', value: latestEpisodes.length },
              { label: settings.home_free_title || 'Безплатна секция', value: freeProductions.length + trailerProductions.length },
              { label: settings.home_premium_title || 'Премиум секция', value: subscriptionProductions.length },
            ].filter(m => m.value > 0).map((m, i) => (
              <div key={i} className="metric-card">
                <p className="text-xs text-[var(--text-muted)] uppercase tracking-[0.15em]">{m.label}</p>
                <p className="text-2xl font-bold">{m.value}</p>
              </div>
            ))}
          </div>
        </motion.section>

        {/* Continue Watching */}
        {watchHistory.length > 0 && (
          <ScrollReveal className="mb-11">
            <HorizontalScroller title={settings.home_continue_watching_title || 'Продължи гледането'} seeAllLink="/profile">
              {watchHistory.map((item) => (
                <EpisodeCard key={item.episode_id} episode={item} showProgress showProductionTitle />
              ))}
            </HorizontalScroller>
          </ScrollReveal>
        )}

        {latestEpisodes.length > 0 && (
          <ScrollReveal className="mb-11">
            <HorizontalScroller
              title={settings.home_latest_title || 'Най-нови епизоди'}
              seeAllLink="/productions"
            >
              {latestEpisodes.map((episode) => (
                <EpisodeCard key={episode.id} episode={episode} showProgress={false} showProductionTitle />
              ))}
            </HorizontalScroller>
          </ScrollReveal>
        )}

        {freeProductions.length > 0 && (
          <ScrollReveal className="mb-11">
            <div className="flex items-center gap-4 mb-4">
              <h2 className="text-2xl font-semibold">{settings.home_free_title || 'Безплатна секция'}</h2>
              <div className="flex-1 h-px bg-gradient-to-r from-[var(--success)]/30 to-transparent" />
              <span className="text-sm text-[var(--text-secondary)]">{freeProductions.length} продукции</span>
            </div>
            <StaggerContainer className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {freeProductions.map((item) => (
                <StaggerItem key={item.id}>
                  <ProductionCard production={item} isInWatchlist={watchlistIds.has(item.id)} onToggleWatchlist={toggleWatchlist} />
                </StaggerItem>
              ))}
            </StaggerContainer>
          </ScrollReveal>
        )}

        {trailerProductions.length > 0 && (
          <ScrollReveal className="mb-11" delay={0.1}>
            <div className="flex items-center gap-4 mb-4">
              <h2 className="text-2xl font-semibold">{settings.home_trailer_title || 'Трейлъри'}</h2>
              <div className="flex-1 h-px bg-gradient-to-r from-[var(--accent-cyan)]/30 to-transparent" />
              <span className="text-sm text-[var(--text-secondary)]">{trailerProductions.length} продукции</span>
            </div>
            <StaggerContainer className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {trailerProductions.map((item) => (
                <StaggerItem key={item.id}>
                  <ProductionCard production={item} isInWatchlist={watchlistIds.has(item.id)} onToggleWatchlist={toggleWatchlist} />
                </StaggerItem>
              ))}
            </StaggerContainer>
          </ScrollReveal>
        )}

        <ScrollReveal delay={0.15}>
          <div className="flex items-center gap-4 mb-4">
            <h2 className="text-2xl font-semibold">{settings.home_premium_title || 'Премиум секция'}</h2>
            <div className="flex-1 h-px bg-gradient-to-r from-[var(--accent-gold)]/30 to-transparent" />
            <Link to="/subscribe" className="text-sm text-[var(--accent-gold-light)] no-underline">
              Отключи достъп
            </Link>
          </div>
          {subscriptionProductions.length > 0 ? (
            <StaggerContainer className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {subscriptionProductions.map((item) => (
                <StaggerItem key={item.id}>
                  <ProductionCard production={item} isInWatchlist={watchlistIds.has(item.id)} onToggleWatchlist={toggleWatchlist} />
                </StaggerItem>
              ))}
            </StaggerContainer>
          ) : (
            <p className="text-[var(--text-muted)]">Няма премиум продукции в момента.</p>
          )}
        </ScrollReveal>

        {!loading && !error && productions.length === 0 && (
          <div className="glass-card p-10 text-center mt-10">
            <h2 className="text-2xl font-semibold mb-2">{settings.home_empty_title || 'Скоро стартираме'}</h2>
            <p className="text-[var(--text-secondary)]">
              {settings.home_empty_subtitle || 'Все още няма публикувани продукции. Провери отново след малко.'}
            </p>
          </div>
        )}

        {error && (
          <div className="glass-card p-6 mt-6 border border-[var(--danger)]/35">
            <p className="text-sm text-[#ffc9c9]">{error}</p>
          </div>
        )}

        {loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-8">
            {Array.from({ length: 8 }).map((_, index) => (
              <div key={index} className="rounded-xl overflow-hidden">
                <div className="skeleton aspect-[16/10]" />
                <div className="mt-2 skeleton h-4 w-2/3" />
              </div>
            ))}
          </div>
        )}
      </div>
    </div >
  );
}
