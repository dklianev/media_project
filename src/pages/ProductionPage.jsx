import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Link } from '@/components/AppLink';
import { motion, useScroll, useTransform } from '@/lib/motion';
import {
  ArrowLeft,
  CheckCircle2,
  Clapperboard,
  Clock3,
  Lock,
  Play,
  ShoppingCart,
  Sparkles,
} from 'lucide-react';
import { api } from '../utils/api';
import AccessGate from '../components/AccessGate';
import ContentPurchaseModal from '../components/ContentPurchaseModal';
import ScrollReveal from '../components/ScrollReveal';
import { StaggerContainer, StaggerItem } from '../components/StaggerContainer';
import PageBackground from '../components/PageBackground';
import { useContentPurchaseFlow } from '../hooks/useContentPurchaseFlow';
import { getProductionAccessGroup } from '../utils/accessGroups';
import { formatMoney } from '../utils/formatters';

const ACCESS_LABEL = {
  free: 'Безплатно',
  trailer: 'Трейлър',
  subscription: 'Абонамент',
};

function getEpisodeLockedLabel(episode) {
  if (episode.has_pending_purchase || episode.production_has_pending_purchase) {
    return 'Отвори плащането';
  }
  if (episode.can_purchase_episode && episode.can_purchase_production) {
    return 'Купи епизод или продукция';
  }
  if (episode.can_purchase_episode) {
    return episode.purchase_price ? `Купи за ${formatMoney(episode.purchase_price)}` : 'Купи епизода';
  }
  if (episode.can_purchase_production) {
    return episode.production_purchase_price
      ? `Купи продукцията за ${formatMoney(episode.production_purchase_price)}`
      : 'Купи продукцията';
  }
  return 'Изисква абонамент';
}

function getEpisodeLockedHref(episode) {
  if (
    episode.can_purchase_episode
    || episode.can_purchase_production
    || episode.has_pending_purchase
    || episode.production_has_pending_purchase
  ) {
    return `/episodes/${episode.id}`;
  }
  return '/subscribe';
}

export default function ProductionPage() {
  const { slug } = useParams();
  const [production, setProduction] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fetchStatus, setFetchStatus] = useState(null);

  const { scrollY } = useScroll();
  const coverY = useTransform(scrollY, [0, 400], [0, 80]);
  const coverScale = useTransform(scrollY, [0, 400], [1, 1.08]);

  const loadProduction = async () => {
    setLoading(true);
    setFetchStatus(null);
    try {
      const data = await api.get(`/productions/${slug}`);
      setProduction(data);
      setFetchStatus(null);
    } catch (err) {
      setProduction(null);
      setFetchStatus(err?.status || 500);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProduction();
  }, [slug]);

  const {
    modalRequest,
    closePurchaseModal,
    requestPurchase,
    activeKey,
  } = useContentPurchaseFlow({
    onResolved: loadProduction,
  });

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
            <p className="text-[var(--text-secondary)] mb-4">Опитай отново след малко.</p>
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
  const directProductionPurchaseAvailable =
    ['production', 'both'].includes(production.purchase_mode) && Boolean(production.purchase_price);
  const episodePurchasesAvailable = ['episodes', 'both'].includes(production.purchase_mode);
  const showProductionPurchaseCard =
    directProductionPurchaseAvailable || production.has_pending_purchase || production.is_purchased;
  const purchasableEpisodeCount = (production.episodes || []).filter(
    (episode) => episode.can_purchase_episode || episode.has_pending_purchase || episode.is_purchased_episode
  ).length;

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
          Назад към каталога
        </Link>
      </motion.div>

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
                alt={production.title || 'Корицата на продукцията'}
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
                  <span className="badge badge-gold">{ACCESS_LABEL[productionGroup] || 'Достъп'}</span>
                  {productionGroup === 'subscription' && (
                    <span className="rounded-full border border-white/20 bg-black/40 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/90">
                      Tier {production.required_tier}
                    </span>
                  )}
                  {directProductionPurchaseAvailable && (
                    <span className="rounded-full border border-white/20 bg-black/40 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/90">
                      Купи {formatMoney(production.purchase_price)}
                    </span>
                  )}
                  {episodePurchasesAvailable && (
                    <span className="rounded-full border border-white/20 bg-black/40 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/90">
                      По епизод
                    </span>
                  )}
                </div>
                <h1 className="text-3xl sm:text-4xl font-bold mb-3">{production.title}</h1>
                {production.description && (
                  <p className="text-[var(--text-secondary)] max-w-2xl">{production.description}</p>
                )}
              </motion.div>
            </div>
          </div>
        </section>
      </ScrollReveal>

      {(showProductionPurchaseCard || episodePurchasesAvailable) && (
        <ScrollReveal variant="fadeUp" delay={0.08}>
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
            {showProductionPurchaseCard && (
              <article className="glass-card p-5 border border-[var(--accent-gold)]/20">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--accent-gold-light)] mb-2">
                      Покупка на продукция
                    </p>
                    <h2 className="text-xl font-semibold">Купи цялата продукция</h2>
                    <p className="text-sm text-[var(--text-secondary)] mt-2 max-w-xl">
                      Еднократната покупка отключва продукцията и всички епизоди към нея.
                    </p>
                  </div>
                  {production.purchase_price && (
                    <div className="text-right">
                      <p className="text-xs text-[var(--text-muted)]">Цена</p>
                      <p className="text-2xl font-bold text-[var(--accent-gold-light)]">
                        {formatMoney(production.purchase_price)}
                      </p>
                    </div>
                  )}
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-3">
                  {production.is_purchased ? (
                    <span className="inline-flex items-center gap-2 rounded-full border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm text-green-400">
                      <CheckCircle2 className="w-4 h-4" />
                      Купено завинаги
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={activeKey === `production:${production.id}`}
                      onClick={() => requestPurchase('production', production.id, {
                        target_type: 'production',
                        target_id: production.id,
                        target_title: production.title,
                        production_title: production.title,
                        production_slug: production.slug,
                        final_price: production.purchase_price,
                      })}
                      className="btn-gold inline-flex items-center gap-2 disabled:opacity-50"
                    >
                      {production.has_pending_purchase ? (
                        <Clock3 className="w-4 h-4" />
                      ) : (
                        <ShoppingCart className="w-4 h-4" />
                      )}
                      {production.has_pending_purchase ? 'Виж плащането' : 'Купи продукцията'}
                    </button>
                  )}

                  {production.has_pending_purchase && !production.is_purchased && (
                    <span className="text-sm text-[var(--text-secondary)]">
                      Има чакаща заявка за тази продукция.
                    </span>
                  )}
                </div>
              </article>
            )}

            {episodePurchasesAvailable && (
              <article className="glass-card p-5">
                <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)] mb-2">
                  Покупка по епизод
                </p>
                <h2 className="text-xl font-semibold">Купувай и епизод по епизод</h2>
                <p className="text-sm text-[var(--text-secondary)] mt-2">
                  Отвори конкретен заключен епизод и ще видиш отделната му цена и бутон за покупка.
                </p>
                <p className="text-sm text-[var(--accent-gold-light)] mt-4">
                  {purchasableEpisodeCount > 0
                    ? `${purchasableEpisodeCount} епизода в тази продукция вече могат да се купуват поотделно.`
                    : 'Цените по епизод се настройват отделно за всеки епизод.'}
                </p>
              </article>
            )}
          </section>
        </ScrollReveal>
      )}

      {!production.has_access && !hasAnyAccessibleEpisode && (
        <ScrollReveal variant="fadeUp" delay={0.1}>
          <div className="mb-8">
            <AccessGate requiredTier={production.required_tier} requiredGroup={productionGroup} />
          </div>
        </ScrollReveal>
      )}

      <ScrollReveal variant="fadeUp" delay={0.15}>
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-semibold">Епизоди</h2>
            <span className="text-sm text-[var(--text-secondary)]">{(production.episodes || []).length} епизода</span>
          </div>

          {production.episodes?.length > 0 ? (
            <StaggerContainer className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {production.episodes.map((episode) => {
                const episodeGroup = episode.effective_access_group || productionGroup;
                const locked = !episode.has_access;
                return (
                  <StaggerItem key={episode.id}>
                    <Link
                      to={locked ? getEpisodeLockedHref(episode) : `/episodes/${episode.id}`}
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
                              alt={episode.title || 'Миниатюра на епизода'}
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
                              Заключен
                            </div>
                          )}

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
                              {ACCESS_LABEL[episodeGroup] || 'Достъп'}
                            </span>
                          </div>
                          <h3 className="font-semibold mb-2 line-clamp-2">{episode.title}</h3>
                          <span className="inline-flex items-center gap-1 text-sm text-[var(--accent-gold-light)]">
                            {locked ? <Lock className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                            {locked ? getEpisodeLockedLabel(episode) : 'Гледай'}
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
              <p className="text-[var(--text-secondary)]">Още няма публикувани епизоди за тази продукция.</p>
            </div>
          )}
        </section>
      </ScrollReveal>

      <ContentPurchaseModal
        open={Boolean(modalRequest)}
        request={modalRequest}
        onClose={closePurchaseModal}
      />
    </div>
  );
}
