import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { TvMinimalPlay, Sparkles, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { getPublicSettings } from '../utils/settings';
import PageBackground from '../components/PageBackground';

function normalizeHost(rawValue) {
    const raw = String(rawValue || '').trim().toLowerCase();
    if (!raw) return '';

    let candidate = raw;
    if (candidate.includes('://')) {
        try {
            candidate = new URL(candidate).hostname.toLowerCase();
        } catch {
            return '';
        }
    }

    candidate = candidate.split('/')[0].split(':')[0].trim();
    if (!candidate) return '';
    if (!/^[a-z0-9.-]+$/.test(candidate)) return '';
    if (candidate.startsWith('.') || candidate.endsWith('.')) return '';

    return candidate;
}

function resolveTwitchParents(extraParentsRaw) {
    const parents = new Set();

    const currentHost = normalizeHost(window.location.hostname || window.location.host);
    if (currentHost) {
        parents.add(currentHost);
        if (currentHost === 'localhost') parents.add('127.0.0.1');
        if (currentHost === '127.0.0.1') parents.add('localhost');
    }

    String(extraParentsRaw || '')
        .split(/[,\s]+/)
        .map((part) => normalizeHost(part))
        .filter(Boolean)
        .forEach((host) => parents.add(host));

    return Array.from(parents);
}

export default function LiveStreamPage() {
    const [settings, setSettings] = useState({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        let active = true;
        getPublicSettings()
            .then((data) => {
                if (!active) return;
                setSettings(data || {});
                setError('');
            })
            .catch(() => {
                if (!active) return;
                setSettings({});
                setError('Неуспешно зареждане на live настройките.');
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => {
            active = false;
        };
    }, []);

    const isLive = settings?.stream_is_live === 'true';
    const platform = settings?.stream_platform || 'twitch';
    const channel = settings?.stream_channel || '';
    const offlineMessage = settings?.stream_offline_message || 'В момента няма активен стрийм.';
    const normalizedChannel = String(channel || '').trim();
    const encodedChannel = encodeURIComponent(normalizedChannel);
    const twitchParents = useMemo(
        () => resolveTwitchParents(settings?.stream_twitch_parents),
        [settings?.stream_twitch_parents]
    );
    const twitchParentQuery = useMemo(
        () => twitchParents.map((parent) => `parent=${encodeURIComponent(parent)}`).join('&'),
        [twitchParents]
    );

    useEffect(() => {
        if (!isLive || platform !== 'twitch' || !normalizedChannel) return;
        if (!twitchParentQuery) {
            if (import.meta.env.DEV) console.warn('[Twitch Embed] Missing valid parent hostname. Configure a valid domain.');
            return;
        }
        if (import.meta.env.DEV) console.info('[Twitch Embed] parent values:', twitchParents.join(', '));
    }, [isLive, normalizedChannel, platform, twitchParentQuery, twitchParents]);

    if (loading) {
        return (
            <div className="relative min-h-screen px-4 py-8 sm:py-12 flex flex-col items-center">
                <PageBackground />
                <div className="w-full max-w-7xl mx-auto">
                    <div className="premium-panel p-5 sm:p-6">
                        <div className="skeleton h-8 w-48 mb-4" />
                        <div className="skeleton aspect-video rounded-2xl" />
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="relative min-h-screen px-4 py-8 sm:py-12 flex flex-col items-center">
            <PageBackground />

            <div className="w-full max-w-7xl mx-auto flex flex-col gap-6">
                {error && (
                    <div className="glass-card p-4 border border-[var(--danger)]/35">
                        <p className="text-sm text-[var(--danger)]">{error}</p>
                    </div>
                )}
                <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-4"
                >
                    <h1 className="text-3xl font-bold flex items-center gap-3">
                        <TvMinimalPlay className="w-8 h-8 text-[var(--accent-gold)]" />
                        Стрийминг на живо
                    </h1>
                    {isLive ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-[0.08em] bg-[var(--danger)]/20 text-[var(--danger)] border border-[var(--danger)]/50 shadow-[0_0_15px_rgba(239,68,68,0.3)] animate-pulse">
                            <span className="w-2 h-2 rounded-full bg-[var(--danger)] animate-ping" />
                            На живо
                        </span>
                    ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-[0.08em] border border-[var(--border)] text-[var(--text-muted)] bg-[var(--bg-secondary)]/60">
                            <span className="w-1.5 h-1.5 rounded-full bg-[var(--text-muted)]" />
                            Офлайн
                        </span>
                    )}
                </motion.div>

                <div className="w-full mt-4 premium-panel overflow-hidden">
                    {isLive && normalizedChannel ? (
                        platform === 'twitch' ? (
                            twitchParentQuery ? (
                                <div className="flex flex-col lg:flex-row w-full aspect-video lg:aspect-[21/9] bg-black">
                                    <iframe
                                        src={`https://player.twitch.tv/?channel=${encodedChannel}&${twitchParentQuery}&autoplay=true`}
                                        frameBorder="0"
                                        allowFullScreen
                                        scrolling="no"
                                        className="flex-1 w-full h-full"
                                        title="Twitch Player"
                                    />
                                    <iframe
                                        src={`https://www.twitch.tv/embed/${encodedChannel}/chat?${twitchParentQuery}&darkpopout`}
                                        frameBorder="0"
                                        scrolling="no"
                                        className="w-full lg:w-[350px] h-64 lg:h-full border-t lg:border-t-0 lg:border-l border-[var(--border)] bg-[#18181B]"
                                        title="Twitch Chat"
                                    />
                                </div>
                            ) : (
                                <div className="w-full aspect-video flex flex-col items-center justify-center text-center p-6 lg:aspect-[21/9] border-t border-[var(--border)]">
                                    <h2 className="text-xl lg:text-2xl font-semibold mb-3">Невалиден Twitch parent</h2>
                                    <p className="text-[var(--text-muted)] max-w-lg">
                                        Домейнът за Twitch embed не е валиден. Провери домейна на текущата среда и настройките за стрийма.
                                    </p>
                                </div>
                            )
                        ) : platform === 'kick' ? (
                            <div className="flex flex-col lg:flex-row w-full aspect-video lg:aspect-[21/9] bg-black">
                                <iframe
                                    src={`https://player.kick.com/${encodedChannel}`}
                                    frameBorder="0"
                                    allowFullScreen
                                    scrolling="no"
                                    className="flex-1 w-full h-full"
                                    title="Kick Player"
                                />
                                <iframe
                                    src={`https://kick.com/${encodedChannel}/chatroom`}
                                    frameBorder="0"
                                    scrolling="no"
                                    className="w-full lg:w-[350px] h-64 lg:h-full border-t lg:border-t-0 lg:border-l border-[var(--border)] bg-[#18181B]"
                                    title="Kick Chat"
                                />
                            </div>
                        ) : null
                    ) : (
                        <div className="w-full aspect-video flex flex-col items-center justify-center bg-gradient-to-br from-[var(--bg-secondary)] via-[var(--bg-tertiary)] to-[var(--bg-secondary)] text-center p-6 lg:aspect-[21/9] border-t border-[var(--border)]">
                            <motion.div
                                initial={{ scale: 0.8, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                transition={{ type: 'spring', damping: 20 }}
                                className="w-24 h-24 mb-6 rounded-full bg-[var(--bg-tertiary)] border border-[var(--border)] flex items-center justify-center relative shadow-[0_0_40px_rgba(0,0,0,0.5)]"
                            >
                                <div className="absolute inset-0 bg-[var(--accent-gold)]/5 rounded-full blur-xl" />
                                <Sparkles className="w-10 h-10 text-[var(--accent-gold)] opacity-60 relative z-10" />
                            </motion.div>
                            <h2 className="text-2xl lg:text-3xl font-display font-semibold mb-3 text-[var(--text-primary)]">Стриймът е офлайн</h2>
                            <p className="text-[var(--text-muted)] max-w-lg text-lg leading-relaxed mb-8">{offlineMessage}</p>
                            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
                                <Link to="/productions" className="btn-gold px-8 py-3 text-sm flex items-center gap-2 no-underline">
                                    Към каталога <ArrowRight className="w-4 h-4" />
                                </Link>
                            </motion.div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
