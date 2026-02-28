import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Crown, Eye, Lock, Sparkles } from 'lucide-react';
import DOMPurify from 'dompurify';
import { api } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import AdBanner from '../components/AdBanner';
import EpisodeCard from '../components/EpisodeCard';
import ReactionBar from '../components/ReactionBar';
import VideoPlayer from '../components/VideoPlayer';
import ScrollReveal from '../components/ScrollReveal';
import { StaggerContainer, StaggerItem } from '../components/StaggerContainer';
import PageBackground from '../components/PageBackground';

const GROUP_LABELS = {
  free: 'Безплатен достъп',
  trailer: 'Трейлър',
  subscription: 'С абонамент',
};

// Periodically send watch progress to the server
function useWatchProgress(episodeId, hasAccess) {
  const secondsRef = useRef(0);
  const intervalRef = useRef(null);

  useEffect(() => {
    if (!episodeId || !hasAccess) return;

    // Record initial view
    api.put(`/watch-history/${episodeId}`, { progress_seconds: 0 }).catch(() => { });

    // Increment seconds and periodically send progress
    secondsRef.current = 0;
    intervalRef.current = setInterval(() => {
      secondsRef.current += 30;
      api.put(`/watch-history/${episodeId}`, { progress_seconds: secondsRef.current }).catch(() => { });
    }, 30000);

    return () => {
      // Send final progress on unmount
      if (secondsRef.current > 0) {
        api.put(`/watch-history/${episodeId}`, { progress_seconds: secondsRef.current }).catch(() => { });
      }
      clearInterval(intervalRef.current);
    };
  }, [episodeId, hasAccess]);
}

export default function EpisodePage() {
  const { id } = useParams();
  const { isAdmin } = useAuth();
  const [episode, setEpisode] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fetchStatus, setFetchStatus] = useState(null);

  useEffect(() => {
    setLoading(true);
    setFetchStatus(null);
    api.get(`/episodes/${id}`)
      .then((data) => {
        setEpisode(data);
      })
      .catch((err) => {
        setEpisode(null);
        setFetchStatus(err.status || 500);
      })
      .finally(() => setLoading(false));
  }, [id]);

  const isLocked = Boolean(episode && episode.has_access === false);
  const hasPlayableVideo = Boolean(episode?.has_access && episode?.video_embed_url);

  // Track watch progress
  useWatchProgress(
    episode?.id,
    hasPlayableVideo
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
            {fetchStatus === 404 ? 'Епизодът не е наличен' : 'Възникна проблем при зареждането'}
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

  return (
    <div className="relative max-w-7xl mx-auto px-4 py-8 overflow-hidden">
      <PageBackground />

      {/* Header */}
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
                Нов епизод
              </div>
              <h1 className="text-3xl sm:text-4xl font-bold">{episode.title}</h1>
              <p className="text-sm text-[var(--text-muted)] mt-1">
                Епизод {episode.episode_number} • {accessLabel}
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

          {/* Video with film grain */}
          <ScrollReveal variant="fadeUp" delay={0.1}>
            <div className="film-frame relative">
              <div className="film-grain rounded-2xl" />
              {hasPlayableVideo ? (
                <VideoPlayer embedUrl={episode.video_embed_url} youtubeVideoId={episode.youtube_video_id} title={episode.title} />
              ) : (
                <div className="relative w-full overflow-hidden rounded-2xl border border-[var(--border)] bg-[linear-gradient(160deg,#0a0d17,#111626)] shadow-premium-md" style={{ paddingBottom: '56.25%' }}>
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
                    <div className="w-16 h-16 rounded-full border border-[var(--accent-gold)]/45 bg-[var(--accent-gold)]/12 flex items-center justify-center mb-4">
                      <Lock className="w-7 h-7 text-[var(--accent-gold-light)]" />
                    </div>
                    <h2 className="text-xl font-semibold mb-2">Епизодът е заключен</h2>
                    <p className="text-sm text-[var(--text-secondary)] max-w-xl mb-4">
                      Необходим е активен абонамент, за да се зареди видеото за този епизод.
                    </p>
                    <div className="flex flex-wrap items-center justify-center gap-2 mb-4 text-xs text-[var(--text-muted)]">
                      <span className="rounded-full border border-[var(--border)] bg-black/30 px-2.5 py-1 uppercase tracking-[0.1em]">
                        {accessLabel}
                      </span>
                      {episode.required_tier > 0 && episode.effective_access_group === 'subscription' && (
                        <span className="rounded-full border border-[var(--border)] bg-black/30 px-2.5 py-1 uppercase tracking-[0.1em]">
                          Ниво {episode.required_tier}
                        </span>
                      )}
                    </div>
                    <Link to="/subscribe" className="btn-gold inline-flex items-center gap-2 no-underline">
                      <Crown className="w-4 h-4" />
                      Отключи достъп
                    </Link>
                  </div>
                </div>
              )}
            </div>
          </ScrollReveal>

          {/* Description */}
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

          {/* Reactions */}
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
        </section>

        {/* Sidebar */}
        <aside className="space-y-4">
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

      {/* Related episodes */}
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
                  <EpisodeCard episode={item} showProgress={false} showProductionTitle={false} />
                </StaggerItem>
              ))}
            </StaggerContainer>
          </section>
        </ScrollReveal>
      )}
    </div>
  );
}
