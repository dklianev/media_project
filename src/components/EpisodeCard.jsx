import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Clapperboard, Clock, Play } from 'lucide-react';
import Tooltip from './Tooltip';

export default function EpisodeCard({ episode, showProgress = false, showProductionTitle = true }) {
    const href = `/episodes/${episode.episode_id || episode.id}`;
    const title = episode.title || 'Епизод';
    const thumbnail = episode.thumbnail_url;
    const productionTitle = episode.production_title;
    const episodeNumber = episode.episode_number;
    const progress = episode.progress_seconds || 0;
    const duration = episode.duration_seconds || 3600;

    return (
        <div className="min-w-[240px] sm:min-w-[265px] flex-shrink-0" style={{ scrollSnapAlign: 'start' }}>
            <Link to={href} className="no-underline group block h-full">
                <motion.article
                    whileHover={{ y: -6 }}
                    whileTap={{ scale: 0.97 }}
                    transition={{ type: 'spring', stiffness: 260, damping: 20 }}
                    className="glass-card flex flex-col h-full relative rounded-2xl border border-[var(--border)] shadow-premium-sm transition-all duration-300 hover:border-[var(--accent-gold)]/40 hover:shadow-[0_12px_40px_rgba(212,175,55,0.15),0_0_0_1px_rgba(212,175,55,0.08)] hover:z-50"
                >
                    <div className="aspect-video relative overflow-hidden rounded-t-[15px]">
                        {thumbnail ? (
                            <img
                                src={thumbnail}
                                alt={title}
                                loading="lazy"
                                decoding="async"
                                className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-110"
                            />
                        ) : (
                            <div className="h-full w-full flex flex-col items-center justify-center bg-gradient-to-br from-[var(--bg-secondary)] via-[var(--bg-tertiary)] to-[var(--bg-secondary)]">
                                <Clapperboard className="w-8 h-8 text-[var(--accent-gold)] opacity-60 mb-2" />
                                <p className="text-xs text-[var(--text-primary)] font-medium px-2 text-center line-clamp-2 drop-shadow-sm">{title}</p>
                            </div>
                        )}

                        {/* Gradient overlays (matching ProductionCard) */}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />

                        {/* Top gold accent line on hover */}
                        <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-[var(--accent-gold)] to-transparent opacity-0 group-hover:opacity-80 transition-opacity duration-500 z-10" />

                        {/* Cinematic light-sweep shine */}
                        <div className="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-500">
                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/8 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000 ease-in-out" />
                        </div>

                        {/* Gold glow overlay on hover (Matching ProductionCard) */}
                        <div className="absolute inset-0 bg-gradient-to-t from-[var(--accent-gold)]/8 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

                        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                            <Tooltip text="Пусни епизода">
                                <div className="w-10 h-10 rounded-full bg-[var(--accent-gold)]/20 border border-[var(--accent-gold)]/50 border backdrop-blur-sm flex items-center justify-center shadow-[0_0_20px_rgba(212,175,55,0.4)]">
                                    <Play className="w-5 h-5 text-[var(--accent-gold-light)] ml-0.5" />
                                </div>
                            </Tooltip>
                        </div>
                        {showProgress && progress > 0 && (
                            <div className="absolute bottom-0 inset-x-0 h-1 bg-white/10">
                                <div
                                    className="h-full bg-[var(--accent-gold)] rounded-full"
                                    style={{ width: `${Math.min(100, (progress / duration) * 100)}%` }}
                                />
                            </div>
                        )}
                    </div>
                    <div className="p-3">
                        {showProductionTitle && productionTitle && (
                            <p className="text-xs text-[var(--text-muted)] mb-0.5 flex items-center gap-1">
                                {showProgress && <Clock className="w-3 h-3" />}
                                {productionTitle}
                            </p>
                        )}
                        <h3 className="text-sm font-semibold line-clamp-2">
                            {episodeNumber ? `Еп. ${episodeNumber} — ${title}` : title}
                        </h3>
                    </div>
                </motion.article>
            </Link>
        </div>
    );
}

