import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { motion, useScroll, useTransform } from 'framer-motion';
import { ArrowLeft, Clapperboard, Lock, Play, Sparkles } from 'lucide-react';
import { api } from '../utils/api';
import AccessGate from '../components/AccessGate';
import ScrollReveal from '../components/ScrollReveal';
import { StaggerContainer, StaggerItem } from '../components/StaggerContainer';
import PageBackground from '../components/PageBackground';
import { getProductionAccessGroup } from '../utils/accessGroups';

const ACCESS_LABEL = {
  free: 'Безплатно',
  trailer: 'Трейлър',
  subscription: 'Абонамент',
};

export default function ProductionPage() {
  const { slug } = useParams();
  const [production, setProduction] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fetchStatus, setFetchStatus] = useState(null);

  const { scrollY } = useScroll();
  const coverY = useTransform(scrollY, [0, 400], [0, 80]);
  const coverScale = useTransform(scrollY, [0, 400], [1, 1.08]);

  useEffect(() => {
    setLoading(true);
    setFetchStatus(null);
    api.get(`/productions/${slug}`)
      .then((data) => {
        setProduction(data);
        setFetchStatus(null);
      })
      .catch((err) => {
        setProduction(null);
        setFetchStatus(err?.status || 500);
      })
      .finally(() => setLoading(false));
  }, [slug]);

  const hasAnyAccessibleEpisode = useMemo(
    () => (production?.episodes || []).some((episode) => episode.has_access),
    [production]
  );

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="skeleton h-72 rounded-2xl mb-6" />
        <div className="skeleton h-8 w-1/3 mb-2" />
        <div className="skeleton h-4 w-2/3 mb-8" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="skeleton aspect-video rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!production) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-14">
        <div className="glass-card p-10 text-center">
          <h1 className="text-2xl font-semibold mb-3">
            {fetchStatus === 404 ? 'Продукцията не е намерена' : 'Възникна проблем при зареждането'}
          </h1>
          {fetchStatus !== 404 && (
            <p className="text-[var(--text-secondary)] mb-4">Моля, опитай отново след малко.</p>
          )}
          <Link to="/productions" className="btn-outline no-underline inline-flex items-center gap-2">
            <ArrowLeft className="w-4 h-4" />
            Към каталога
          </Link>
        </div>
      </div>
    );
  }

  const productionGroup = getProductionAccessGroup(production);

  return (
    <div className="relative max-w-7xl mx-auto px-4 py-8 overflow-hidden">
      <PageBackground />

      <motion.div
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.3 }}
      >
        <Link
          to="/productions"
          className="relative inline-flex items-center gap-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] no-underline mb-5"
        >
          <ArrowLeft className="w-4 h-4" />
          Назад към каталог
        </Link>
      </motion.div>

      {/* Hero cover with parallax */}
      <ScrollReveal variant="fadeUp">
        <section className="relative premium-panel overflow-hidden p-3 sm:p-4 mb-8">
          <div className="pill-chip mb-3 w-fit">
            <Sparkles className="w-3.5 h-3.5" />
            Продукция
          </div>

          <div className="relative overflow-hidden rounded-2xl border border-[var(--border)]">
            {production.cover_image_url ? (
              <motion.img
                src={production.cover_image_url}
                alt={production.title || 'Корица на продукция'}
                loading="lazy"
                decoding="async"
                className="absolute inset-0 h-full w-full object-cover"
                style={{ y: coverY, scale: coverScale }}
              />
            ) : (
              <div className="absolute inset-0" style={{ background: 'var(--gradient-hero)' }} />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/45 to-transparent" />

            <div className="relative p-8 sm:p-10 min-h-[260px] flex flex-col justify-end">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              >
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <span className="badge badge-gold">{ACCESS_LABEL[productionGroup] || 'Абонамент'}</span>
                  {productionGroup === 'subscription' && (
                    <span className="rounded-full border border-white/20 bg-black/40 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/90">
                      Ниво {production.required_tier}
                    </span>
                  )}
                </div>
                <h1 className="text-3xl sm:text-4xl font-bold mb-3">{production.title}</h1>
                {production.description && <p className="text-[var(--text-secondary)] max-w-2xl">{production.description}</p>}
              </motion.div>
            </div>
          </div>
        </section>
      </ScrollReveal>

      {!production.has_access && !hasAnyAccessibleEpisode && (
        <ScrollReveal variant="fadeUp" delay={0.1}>
          <div className="mb-8">
            <AccessGate requiredTier={production.required_tier} requiredGroup={productionGroup} />
          </div>
        </ScrollReveal>
      )}

      {/* Episodes */}
      <ScrollReveal variant="fadeUp" delay={0.15}>
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-semibold">Епизоди</h2>
            <span className="text-sm text-[var(--text-secondary)]">{(production.episodes || []).length} налични</span>
          </div>

          {production.episodes?.length > 0 ? (
            <StaggerContainer className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {production.episodes.map((episode) => {
                const episodeGroup = episode.effective_access_group || productionGroup;
                const locked = !episode.has_access;
                return (
                  <StaggerItem key={episode.id}>
                    <Link
                      to={locked ? '/subscribe' : `/episodes/${episode.id}`}
                      className="no-underline"
                    >
                      <motion.article
                        whileHover={{ y: -4, boxShadow: '0 8px 24px rgba(212,175,55,0.1)' }}
                        whileTap={{ scale: 0.98 }}
                        transition={{ type: 'spring', stiffness: 260, damping: 20 }}
                        className="group glass-card overflow-hidden glass-card-hover h-full"
                      >
                        <div className="aspect-video bg-[var(--bg-tertiary)] relative overflow-hidden">
                          {episode.thumbnail_url ? (
                            <img
                              src={episode.thumbnail_url}
                              alt={episode.title || 'Кадър от епизод'}
                              loading="lazy"
                              decoding="async"
                              className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                            />
                          ) : (
                            <div className="h-full w-full flex items-center justify-center">
                              <Clapperboard className="w-8 h-8 text-[var(--text-muted)]" />
                            </div>
                          )}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-transparent" />

                          {locked && (
                            <div className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-full border border-white/20 bg-black/45 px-2 py-1 text-[11px] font-semibold">
                              <Lock className="w-3 h-3" />
                              Заключено
                            </div>
                          )}

                          {/* Play button on hover */}
                          {!locked && (
                            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                              <div className="w-12 h-12 rounded-full border border-[var(--accent-gold)]/50 bg-[var(--accent-gold)]/20 backdrop-blur-sm flex items-center justify-center shadow-[0_0_24px_rgba(212,175,55,0.25)]">
                                <Play className="w-5 h-5 text-[var(--accent-gold-light)] ml-0.5" />
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="p-4">
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <p className="text-xs text-[var(--text-muted)]">Епизод {episode.episode_number}</p>
                            <span className="text-[10px] uppercase tracking-[0.12em] text-[var(--text-muted)]">
                              {ACCESS_LABEL[episodeGroup] || 'Абонамент'}
                            </span>
                          </div>
                          <h3 className="font-semibold mb-2 line-clamp-2">{episode.title}</h3>
                          <span className="inline-flex items-center gap-1 text-sm text-[var(--accent-gold-light)]">
                            {locked ? <Lock className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                            {locked ? 'Отключи достъп' : 'Отвори'}
                          </span>
                        </div>
                      </motion.article>
                    </Link>
                  </StaggerItem>
                );
              })}
            </StaggerContainer>
          ) : (
            <div className="glass-card p-8 text-center">
              <p className="text-[var(--text-secondary)]">Все още няма публикувани епизоди за тази продукция.</p>
            </div>
          )}
        </section>
      </ScrollReveal>
    </div>
  );
}
