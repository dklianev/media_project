import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Calendar as CalendarIcon, Clock, Sparkles } from 'lucide-react';
import { api } from '../utils/api';
import PageBackground from '../components/PageBackground';
import ScrollReveal from '../components/ScrollReveal';
import EpisodeCard from '../components/EpisodeCard';
import { StaggerContainer, StaggerItem } from '../components/StaggerContainer';
import { getPublicSettings } from '../utils/settings';

export default function CalendarPage() {
    const [episodes, setEpisodes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [ui, setUi] = useState({
        calendar_title: 'Календар',
        calendar_subtitle: 'Следете графика на предстоящите епизоди и премиери. Никога не пропускайте ново видео от любимите си продукции.',
        calendar_empty: 'Няма информация за графика в момента.',
    });

    useEffect(() => {
        let active = true;

        getPublicSettings().then(settings => {
            if (active && settings) {
                setUi(prev => ({
                    calendar_title: settings.calendar_title || prev.calendar_title,
                    calendar_subtitle: settings.calendar_subtitle || prev.calendar_subtitle,
                    calendar_empty: settings.calendar_empty || prev.calendar_empty,
                }));
            }
        }).catch(() => { });
        api.get('/episodes/calendar')
            .then(data => {
                if (active) {
                    setEpisodes(Array.isArray(data) ? data : []);
                    setLoading(false);
                }
            })
            .catch(err => {
                if (active) {
                    setError(err.message || 'Неуспешно зареждане на календара.');
                    setLoading(false);
                }
            });
        return () => { active = false; };
    }, []);

    const groupedEpisodes = useMemo(() => {
        const groups = {};
        const now = new Date();

        episodes.forEach(ep => {
            const pubDate = new Date(ep.published_at);
            // Get date string (YYYY-MM-DD) for grouping
            const dateStr = pubDate.toISOString().split('T')[0];

            if (!groups[dateStr]) {
                groups[dateStr] = {
                    date: pubDate,
                    episodes: [],
                    isPast: pubDate < now && dateStr !== now.toISOString().split('T')[0],
                    isToday: dateStr === now.toISOString().split('T')[0]
                };
            }
            groups[dateStr].episodes.push(ep);
        });

        // Convert to array and sort by date ascending
        return Object.values(groups).sort((a, b) => a.date - b.date);
    }, [episodes]);

    const formatDate = (dateObj, isToday) => {
        if (isToday) return 'Днес';

        const options = { weekday: 'long', day: 'numeric', month: 'long' };
        let formatted = dateObj.toLocaleDateString('bg-BG', options);
        // Capitalize first letter
        return formatted.charAt(0).toUpperCase() + formatted.slice(1);
    };

    return (
        <div className="relative max-w-7xl mx-auto px-4 py-8 overflow-hidden min-h-[80vh]">
            <PageBackground />

            <ScrollReveal variant="fadeUp">
                <section className="relative premium-panel p-5 sm:p-6 mb-10">
                    <div className="pill-chip mb-3 w-fit">
                        <Sparkles className="w-3.5 h-3.5" />
                        График на излъчване
                    </div>
                    <h1 className="text-3xl sm:text-4xl font-bold flex items-center gap-3">
                        <CalendarIcon className="w-8 h-8 text-[var(--accent-gold-light)]" />
                        {ui.calendar_title}
                    </h1>
                    <p className="text-[var(--text-secondary)] mt-2 max-w-2xl">
                        {ui.calendar_subtitle}
                    </p>
                </section>
            </ScrollReveal>

            {loading ? (
                <div className="space-y-12">
                    {[...Array(3)].map((_, i) => (
                        <div key={i}>
                            <div className="animate-pulse h-8 w-48 bg-[var(--bg-secondary)] rounded mb-6"></div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                                {[...Array(4)].map((_, j) => (
                                    <div key={j} className="animate-pulse h-48 bg-[var(--bg-secondary)] rounded-xl"></div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            ) : error ? (
                <div className="glass-card p-5 border border-[var(--danger)]/35 text-center max-w-xl mx-auto mt-10">
                    <p className="text-[#ffc9c9]">{error}</p>
                </div>
            ) : groupedEpisodes.length === 0 ? (
                <div className="text-center py-20 glass-card">
                    <CalendarIcon className="w-12 h-12 text-[var(--text-muted)] mx-auto mb-4 opacity-50" />
                    <p className="text-[var(--text-muted)]">{ui.calendar_empty}</p>
                </div>
            ) : (
                <div className="space-y-12 md:space-y-16">
                    {groupedEpisodes.map((group, groupIndex) => (
                        <ScrollReveal key={groupIndex} variant="fadeUp" delay={0.1}>
                            <div className="relative">
                                {/* Date Header */}
                                <div className="flex items-center gap-4 mb-6">
                                    <div className={`
                    shrink-0 flex items-center gap-2 px-4 py-2 rounded-full font-medium border
                    ${group.isToday
                                            ? 'bg-[var(--accent-gold)]/20 border-[var(--accent-gold)]/50 text-[var(--accent-gold-light)]'
                                            : group.isPast
                                                ? 'bg-[var(--bg-secondary)] border-[var(--border)] text-[var(--text-muted)]'
                                                : 'bg-[var(--bg-secondary)]/80 border-[var(--border)] text-[var(--text-primary)]'}
                  `}>
                                        <Clock className="w-4 h-4" />
                                        {formatDate(group.date, group.isToday)}
                                    </div>
                                    <div className="flex-1 h-px bg-gradient-to-r from-[var(--border)] to-transparent" />
                                </div>

                                {/* Episodes Grid */}
                                <StaggerContainer className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
                                    {group.episodes.map(episode => (
                                        <StaggerItem key={episode.id}>
                                            <EpisodeCard
                                                episode={episode}
                                                showProgress={false}
                                            />
                                        </StaggerItem>
                                    ))}
                                </StaggerContainer>
                            </div>
                        </ScrollReveal>
                    ))}
                </div>
            )}
        </div>
    );
}
