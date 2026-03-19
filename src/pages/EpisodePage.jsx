import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Link } from '@/components/AppLink';
import { motion } from '@/lib/motion';
import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Crown,
  Eye,
  Gift,
  Lock,
  ShoppingCart,
  SkipForward,
  Sparkles,
} from 'lucide-react';
import DOMPurify from 'dompurify';
import { api } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import AdBanner from '../components/AdBanner';
import CommentsSection from '../components/CommentsSection';
import ContentPurchaseModal from '../components/ContentPurchaseModal';
import GiftModal from '../components/GiftModal';
import EpisodeCard from '../components/EpisodeCard';
import ReactionBar from '../components/ReactionBar';
import ScrollReveal from '../components/ScrollReveal';
import VideoPlayer from '../components/VideoPlayer';
import { StaggerContainer, StaggerItem } from '../components/StaggerContainer';
import PageBackground from '../components/PageBackground';
import { useContentPurchaseFlow } from '../hooks/useContentPurchaseFlow';
import { formatMoney } from '../utils/formatters';

const GROUP_LABELS = {
  free: 'Безплатен достъп',
  trailer: 'Трейлър',
  subscription: 'С абонамент',
};

function useWatchProgress(episodeId, hasAccess, progressRef, durationRef) {
  const lastSentRef = useRef(null);

  useEffect(() => {
    lastSentRef.current = null;
  }, [episodeId]);

  useEffect(() => {
    if (!episodeId || !hasAccess) return undefined;

    const persistProgress = () => {
      const currentProgress = Math.max(0, Math.round(progressRef.current || 0));
      const currentDuration = Math.max(0, Math.round(durationRef.current || 0));
      const normalizedProgress =
        currentDuration > 0 && currentProgress >= currentDuration - 5
          ? currentDuration
          : currentProgress;

      if (normalizedProgress <= 0 && lastSentRef.current == null) return;
      if (normalizedProgress === lastSentRef.current) return;

      lastSentRef.current = normalizedProgress;
      api.put(`/watch-history/${episodeId}`, { progress_seconds: normalizedProgress }).catch((err) => {
        console.error('Watch progress save failed:', err);
      });
    };

    const intervalId = setInterval(persistProgress, 15000);
    window.addEventListener('pagehide', persistProgress);

    return () => {
      clearInterval(intervalId);
      window.removeEventListener('pagehide', persistProgress);
      persistProgress();
    };
  }, [durationRef, episodeId, hasAccess, progressRef]);
}

export default function EpisodePage() {
  const { id } = useParams();
  const { isAdmin } = useAuth();
  const [episode, setEpisode] = useState(null);
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [fetchStatus, setFetchStatus] = useState(null);
  const [resumeProgressSeconds, setResumeProgressSeconds] = useState(0);
  const playerProgressRef = useRef(0);
  const playerDurationRef = useRef(0);

  const loadEpisode = async () => {
    setLoading(true);
    setFetchStatus(null);
    setResumeProgressSeconds(0);
    playerProgressRef.current = 0;
    playerDurationRef.current = 0;

    try {
      const data = await api.get(`/episodes/${id}`);
      setEpisode(data);
    } catch (err) {
      setEpisode(null);
      setFetchStatus(err.status || 500);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    api.get('/settings/public')
      .then((data) => setSettings(data))
      .catch((err) => {
        console.error('Episode settings load failed:', err);
      });
  }, []);

  useEffect(() => {
    loadEpisode();
  }, [id]);

  const {
    modalRequest,
    closePurchaseModal,
    requestPurchase,
    activeKey,
  } = useContentPurchaseFlow({
    onResolved: loadEpisode,
  });

  useEffect(() => {
    if (!episode?.id || !episode?.has_access) {
      setResumeProgressSeconds(0);
      return undefined;
    }

    let cancelled = false;

    api.get(`/watch-history/${episode.id}`)
      .then((data) => {
        if (!cancelled) {
          setResumeProgressSeconds(Math.max(0, Number(data?.progress_seconds || 0)));
        }
      })
      .catch(() => {
        if (!cancelled) setResumeProgressSeconds(0);
      });

    return () => {
      cancelled = true;
    };
  }, [episode?.has_access, episode?.id]);

  const [giftModal, setGiftModal] = useState(null);

  const isLocked = Boolean(episode && episode.has_access === false);
  const isLocalReady =
    episode?.video_source === 'local'
    && (episode?.local_video_url || episode?.transcoding_status === 'pending' || episode?.transcoding_status === 'processing');
  const hasPlayableVideo = Boolean(episode?.has_access && (episode?.video_embed_url || isLocalReady));

  useWatchProgress(
    episode?.id,
    hasPlayableVideo,
    playerProgressRef,
    playerDurationRef
  );

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="skeleton h-8 w-1/4 mb-5" />
        <div className="skeleton aspect-video rounded-2xl mb-6" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 skeleton h-40 rounded-2xl" />
          <div className="skeleton h-40 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!episode) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-14">
        <div className="glass-card p-10 text-center">
          <h1 className="text-2xl font-semibold mb-3">
            {fetchStatus === 404 ? 'Епизодът не е намерен' : 'Възникна проблем при зареждането'}
          </h1>
          <Link to="/productions" className="btn-outline inline-flex items-center gap-2 no-underline">
            <ArrowLeft className="w-4 h-4" />
            Към продукциите
          </Link>
        </div>
      </div>
    );
  }

  const sideImages = episode.side_images || [];
  const accessLabel = GROUP_LABELS[episode.effective_access_group] || 'С абонамент';
  const showEpisodePurchaseOffer =
    Boolean(episode.purchase_price)
    && (
      episode.can_purchase_episode
      || episode.has_pending_purchase
      || episode.is_purchased_episode
    );
  const showProductionPurchaseOffer =
    Boolean(episode.production_purchase_price)
    && (
      episode.can_purchase_production
      || episode.production_has_pending_purchase
      || episode.production_is_purchased
    );

  const openEpisodePurchase = () => requestPurchase('episode', episode.id, {
    target_type: 'episode',
    target_id: episode.id,
    target_title: episode.title,
    production_title: episode.production_title,
    production_slug: episode.production_slug,
    episode_number: episode.episode_number,
    final_price: episode.purchase_price,
  });

  const openProductionPurchase = () => requestPurchase('production', episode.production_id, {
    target_type: 'production',
    target_id: episode.production_id,
    target_title: episode.production_title,
    production_title: episode.production_title,
    production_slug: episode.production_slug,
    final_price: episode.production_purchase_price,
  });

  return (
    <div className="relative max-w-7xl mx-auto px-4 py-8 overflow-hidden">
      <PageBackground />

      <ScrollReveal variant="fadeUp">
        <div className="relative premium-panel p-5 sm:p-6 mb-6">
          <Link
            to={`/productions/${episode.production_slug}`}
            className="inline-flex items-center gap-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] no-underline mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            {episode.production_title}
          </Link>

          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="pill-chip mb-3 w-fit">
                <Sparkles className="w-3.5 h-3.5" />
                Епизод
              </div>
              <h1 className="text-3xl sm:text-4xl font-bold">{episode.title}</h1>
              <p className="text-sm text-[var(--text-muted)] mt-1">
                Епизод {episode.episode_number} - {accessLabel}
              </p>
            </div>
            {isAdmin && episode.view_count !== undefined && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text-secondary)]"
              >
                <Eye className="w-4 h-4" />
                {episode.view_count} гледания
              </motion.div>
            )}
          </div>
        </div>
      </ScrollReveal>

      <div className="relative grid grid-cols-1 xl:grid-cols-4 gap-6">
        <section className="xl:col-span-3 space-y-4">
          <AdBanner imageUrl={episode.ad_banner_url} link={episode.ad_banner_link} />

          <ScrollReveal variant="fadeUp" delay={0.1}>
            <div className="film-frame relative">
              <div className="film-grain rounded-2xl" />
              {hasPlayableVideo ? (
                <VideoPlayer
                  embedUrl={episode.video_embed_url}
                  youtubeVideoId={episode.youtube_video_id}
                  title={episode.title}
                  siteName={settings.site_name || 'Media Platform'}
                  nextEpisode={episode.next_episode}
                  previousEpisode={episode.previous_episode}
                  initialProgressSeconds={resumeProgressSeconds}
                  onProgressSample={(currentTime, totalDuration) => {
                    playerProgressRef.current = currentTime;
                    playerDurationRef.current = totalDuration;
                  }}
                  videoSource={episode.video_source || 'youtube'}
                  localVideoUrl={episode.local_video_url}
                  transcodingStatus={episode.transcoding_status}
                />
              ) : (
                <div
                  className="relative w-full overflow-hidden rounded-2xl border border-[var(--border)] bg-[linear-gradient(160deg,#0a0d17,#111626)] shadow-premium-md"
                  style={{ paddingBottom: '56.25%' }}
                >
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
                    <div className="w-16 h-16 rounded-full border border-[var(--accent-gold)]/45 bg-[var(--accent-gold)]/12 flex items-center justify-center mb-4">
                      <Lock className="w-7 h-7 text-[var(--accent-gold-light)]" />
                    </div>
                    <h2 className="text-xl font-semibold mb-2">Епизодът е заключен</h2>
                    <p className="text-sm text-[var(--text-secondary)] max-w-xl mb-4">
                      Можеш да го отключиш с абонамент или, ако е разрешено, с еднократна покупка.
                    </p>
                    <div className="flex flex-wrap items-center justify-center gap-2 mb-4 text-xs text-[var(--text-muted)]">
                      <span className="rounded-full border border-[var(--border)] bg-black/30 px-2.5 py-1 uppercase tracking-[0.1em]">
                        {accessLabel}
                      </span>
                      {episode.required_tier > 0 && episode.effective_access_group === 'subscription' && (
                        <span className="rounded-full border border-[var(--border)] bg-black/30 px-2.5 py-1 uppercase tracking-[0.1em]">
                          Tier {episode.required_tier}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center justify-center gap-3">
                      <Link to="/subscribe" className="btn-gold inline-flex items-center gap-2 no-underline">
                        <Crown className="w-4 h-4" />
                        Вземи абонамент
                      </Link>
                      {showEpisodePurchaseOffer && !episode.is_purchased_episode && (
                        <button
                          type="button"
                          onClick={openEpisodePurchase}
                          disabled={activeKey === `episode:${episode.id}`}
                          className="btn-outline inline-flex items-center gap-2 disabled:opacity-50"
                        >
                          {episode.has_pending_purchase ? (
                            <Clock3 className="w-4 h-4" />
                          ) : (
                            <ShoppingCart className="w-4 h-4" />
                          )}
                          {episode.has_pending_purchase
                            ? 'Виж покупката на епизода'
                            : `Купи епизода${episode.purchase_price ? ` за ${formatMoney(episode.purchase_price)}` : ''}`}
                        </button>
                      )}
                      {showProductionPurchaseOffer && !episode.production_is_purchased && (
                        <button
                          type="button"
                          onClick={openProductionPurchase}
                          disabled={activeKey === `production:${episode.production_id}`}
                          className="btn-outline inline-flex items-center gap-2 disabled:opacity-50"
                        >
                          {episode.production_has_pending_purchase ? (
                            <Clock3 className="w-4 h-4" />
                          ) : (
                            <ShoppingCart className="w-4 h-4" />
                          )}
                          {episode.production_has_pending_purchase
                            ? 'Виж покупката на продукцията'
                            : `Купи продукцията${episode.production_purchase_price ? ` за ${formatMoney(episode.production_purchase_price)}` : ''}`}
                        </button>
                      )}
                      {showEpisodePurchaseOffer && !episode.is_purchased_episode && !episode.has_pending_purchase && (
                        <button
                          type="button"
                          onClick={() => setGiftModal({ giftType: 'episode', targetId: episode.id, targetTitle: `${episode.production_title} - ${episode.title}`, price: episode.purchase_price })}
                          className="btn-outline inline-flex items-center gap-2"
                        >
                          <Gift className="w-4 h-4" />
                          Подари епизода
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </ScrollReveal>

          {episode.description && (
            <ScrollReveal variant="fadeUp" delay={0.15}>
              <article className="glass-card p-5">
                <h2 className="text-lg font-semibold mb-2">Описание</h2>
                <div
                  className="text-[var(--text-secondary)] prose prose-sm max-w-none"
                  dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(episode.description) }}
                />
              </article>
            </ScrollReveal>
          )}

          {!isLocked && (
            <ScrollReveal variant="fadeUp" delay={0.2}>
              <article className="glass-card p-5">
                <h2 className="text-lg font-semibold mb-3">Реакции</h2>
                <ReactionBar
                  episodeId={episode.id}
                  reactions={episode.reactions}
                  userReaction={episode.user_reaction}
                />
              </article>
            </ScrollReveal>
          )}

          {!isLocked && (
            <ScrollReveal variant="fadeUp" delay={0.25}>
              <CommentsSection episodeId={episode.id} />
            </ScrollReveal>
          )}
        </section>

        <aside className="space-y-4">
          {(showEpisodePurchaseOffer || showProductionPurchaseOffer) && (
            <ScrollReveal variant="fadeRight" delay={0.05}>
              <article className="glass-card p-4">
                <h3 className="text-sm uppercase tracking-[0.18em] text-[var(--text-muted)] mb-3">
                  Покупка
                </h3>
                <div className="space-y-3">
                  {showEpisodePurchaseOffer && (
                    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium">Този епизод</p>
                          <p className="text-xs text-[var(--text-muted)] mt-1">
                            {episode.purchase_price ? formatMoney(episode.purchase_price) : 'Без цена'}
                          </p>
                        </div>
                        {episode.is_purchased_episode ? (
                          <span className="inline-flex items-center gap-1 text-xs text-green-400">
                            <CheckCircle2 className="w-4 h-4" />
                            Купен
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={openEpisodePurchase}
                            disabled={activeKey === `episode:${episode.id}`}
                            className="btn-outline text-xs px-3 py-2 disabled:opacity-50"
                          >
                            {episode.has_pending_purchase ? 'Плащане' : 'Купи'}
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {showProductionPurchaseOffer && (
                    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium">Цялата продукция</p>
                          <p className="text-xs text-[var(--text-muted)] mt-1">
                            {episode.production_purchase_price
                              ? formatMoney(episode.production_purchase_price)
                              : 'Без цена'}
                          </p>
                        </div>
                        {episode.production_is_purchased ? (
                          <span className="inline-flex items-center gap-1 text-xs text-green-400">
                            <CheckCircle2 className="w-4 h-4" />
                            Купена
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={openProductionPurchase}
                            disabled={activeKey === `production:${episode.production_id}`}
                            className="btn-outline text-xs px-3 py-2 disabled:opacity-50"
                          >
                            {episode.production_has_pending_purchase ? 'Плащане' : 'Купи'}
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </article>
            </ScrollReveal>
          )}

          {episode.side_text && (
            <ScrollReveal variant="fadeRight" delay={0.1}>
              <article className="glass-card p-4">
                <h3 className="text-sm uppercase tracking-[0.18em] text-[var(--text-muted)] mb-2">
                  Допълнителна информация
                </h3>
                <p className="text-sm text-[var(--text-secondary)]">{episode.side_text}</p>
              </article>
            </ScrollReveal>
          )}

          {sideImages.map((image, index) => (
            <ScrollReveal key={index} variant="fadeRight" delay={0.15 + index * 0.05}>
              <img
                src={image}
                alt={`Допълнително изображение ${index + 1}`}
                loading="lazy"
                decoding="async"
                className="w-full rounded-xl border border-[var(--border)] object-cover hover:border-[var(--accent-gold)]/30 transition-colors"
              />
            </ScrollReveal>
          ))}
        </aside>
      </div>

      {episode.next_episode && (
        <div className="fixed bottom-6 right-6 z-50 hidden sm:block">
          <Link
            to={`/episodes/${episode.next_episode.id}`}
            className="btn-gold shadow-premium-md flex items-center gap-2 px-6 py-3.5 rounded-full hover:scale-105 transition-transform group font-semibold text-sm no-underline"
          >
            Следващ епизод
            <SkipForward className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>
      )}

      {episode.latest_episodes?.length > 0 && (
        <ScrollReveal variant="fadeUp" delay={0.1} className="mt-12">
          <section>
            <div className="flex items-center gap-3 mb-4">
              <h2 className="text-2xl font-semibold">Още от {episode.production_title}</h2>
              <div className="flex-1 h-[1px] bg-gradient-to-r from-[var(--accent-gold)]/30 to-transparent" />
            </div>
            <StaggerContainer className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {episode.latest_episodes.map((item) => (
                <StaggerItem key={item.id}>
                  <EpisodeCard episode={item} showProgress={false} showProductionTitle={false} asGridItem={true} />
                </StaggerItem>
              ))}
            </StaggerContainer>
          </section>
        </ScrollReveal>
      )}

      <ContentPurchaseModal
        open={Boolean(modalRequest)}
        request={modalRequest}
        onClose={closePurchaseModal}
      />

      {giftModal && (
        <GiftModal
          open
          onClose={() => setGiftModal(null)}
          giftType={giftModal.giftType}
          targetId={giftModal.targetId}
          targetTitle={giftModal.targetTitle}
          price={giftModal.price}
        />
      )}
    </div>
  );
}
