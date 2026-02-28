import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Film, Heart, Search, Sparkles } from 'lucide-react';
import { api } from '../utils/api';
import { useDebounce } from '../hooks/useDebounce';
import { getPublicSettings } from '../utils/settings';
import { getAccessLabels } from '../utils/accessLabels';
import { useToastContext } from '../context/ToastContext';
import ProductionCard from '../components/ProductionCard';
import ScrollReveal from '../components/ScrollReveal';
import { StaggerContainer, StaggerItem } from '../components/StaggerContainer';
import PageBackground from '../components/PageBackground';

const DEFAULT_PILLS = [
    { value: 'all', label: 'Всички' },
    { value: 'free', label: 'Безплатни' },
    { value: 'trailer', label: 'Трейлъри' },
    { value: 'subscription', label: 'Абонаментни' },
    { value: 'watchlist', label: 'Любими' },
];



export default function ProductionsPage() {
    const { showToast } = useToastContext();
    const [productions, setProductions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [query, setQuery] = useState('');
    const [groupFilter, setGroupFilter] = useState('all');
    const [genreFilter, setGenreFilter] = useState('all');
    const [sortOption, setSortOption] = useState('default');
    const [watchlistIds, setWatchlistIds] = useState(new Set());
    const [s, setS] = useState({});
    const [filterPills, setFilterPills] = useState(DEFAULT_PILLS);
    const debouncedQuery = useDebounce(query, 300);

    useEffect(() => {
        let active = true;
        Promise.all([
            api.get('/productions'),
            api.get('/watchlist').catch(() => []),
            getPublicSettings(),
            getAccessLabels(),
        ])
            .then(([prods, wlIds, publicSettings, labels]) => {
                if (!active) return;
                setProductions(prods);
                setWatchlistIds(new Set(Array.isArray(wlIds) ? wlIds : []));
                setS(publicSettings || {});
                if (labels) {
                    setFilterPills([
                        { value: 'all', label: 'Всички' },
                        { value: 'free', label: labels.free },
                        { value: 'trailer', label: labels.trailer },
                        { value: 'subscription', label: labels.subscription },
                        { value: 'watchlist', label: 'Любими' },
                    ]);
                }
                setError('');
            })
            .catch((err) => {
                if (!active) return;
                setError(err.message || 'Неуспешно зареждане на каталога.');
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => {
            active = false;
        };
    }, []);

    const toggleWatchlist = useCallback(async (productionId) => {
        const isIn = watchlistIds.has(productionId);
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
            setWatchlistIds((prev) => {
                const next = new Set(prev);
                if (isIn) next.add(productionId);
                else next.delete(productionId);
                return next;
            });
            showToast('Неуспешна промяна в любими.', 'error');
        }
    }, [watchlistIds, showToast]);

    const availableGenres = useMemo(() => {
        const genres = new Set();
        productions.forEach(p => {
            if (Array.isArray(p.genres)) {
                p.genres.forEach(g => genres.add(g));
            }
        });
        return Array.from(genres).sort();
    }, [productions]);

    const filtered = useMemo(() => {
        const search = debouncedQuery.trim().toLowerCase();
        let result = productions.filter((production) => {
            const group = production.access_group || (production.required_tier > 0 ? 'subscription' : 'free');

            if (groupFilter === 'watchlist') {
                if (!watchlistIds.has(production.id)) return false;
            } else if (groupFilter !== 'all' && group !== groupFilter) {
                return false;
            }

            if (genreFilter !== 'all') {
                if (!Array.isArray(production.genres) || !production.genres.includes(genreFilter)) {
                    return false;
                }
            }

            const textOk =
                !search ||
                (production.title || '').toLowerCase().includes(search) ||
                (production.description || '').toLowerCase().includes(search);
            return textOk;
        });

        // Sorting
        if (sortOption === 'newest') {
            result.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        } else if (sortOption === 'alphabetical') {
            result.sort((a, b) => a.title.localeCompare(b.title));
        } else {
            // default is by sort_order + created_at
            result.sort((a, b) => {
                if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
                return new Date(b.created_at) - new Date(a.created_at);
            });
        }

        return result;
    }, [productions, debouncedQuery, groupFilter, genreFilter, sortOption, watchlistIds]);

    return (
        <div className="relative max-w-7xl mx-auto px-4 py-8 overflow-hidden">
            <PageBackground />

            <ScrollReveal variant="fadeUp">
                <section className="relative premium-panel p-5 sm:p-6 mb-8">
                    <div className="pill-chip mb-3 w-fit">
                        <Sparkles className="w-3.5 h-3.5" />
                        {s.catalog_badge_text || 'Каталог'}
                    </div>
                    <div className="flex flex-wrap items-end justify-between gap-3">
                        <div>
                            <h1 className="text-3xl sm:text-4xl font-bold flex items-center gap-3">
                                <Film className="w-8 h-8 text-[var(--accent-gold-light)]" />
                                {s.catalog_title || 'Каталог продукции'}
                            </h1>
                            <p className="text-[var(--text-secondary)] mt-2">
                                {s.catalog_description || 'Разгледай по категории: безплатни, трейлъри и абонаментни формати.'}
                            </p>
                        </div>

                        {/* Search */}
                        <div className="glass-card p-2 w-full sm:w-auto">
                            <div className="relative min-w-0 sm:min-w-[280px]">
                                <Search className="w-4 h-4 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2" />
                                <input
                                    value={query}
                                    onChange={(event) => setQuery(event.target.value)}
                                    className="input-dark pl-11 w-full"
                                    placeholder={s.catalog_search_placeholder || 'Търси заглавие...'}
                                    aria-label="Търсене в каталога"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Filtering & Listing */}
                    <div className="mt-8">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                            <div className="flex flex-wrap gap-2">
                                {filterPills.map((pill) => (
                                    <button
                                        key={pill.value}
                                        type="button"
                                        onClick={() => setGroupFilter(pill.value)}
                                        aria-pressed={groupFilter === pill.value}
                                        className={`px-5 py-2 rounded-full text-sm font-medium transition-all ${groupFilter === pill.value
                                            ? 'bg-[var(--accent-gold)] text-[#0a0b11] shadow-[0_0_15px_rgba(212,175,55,0.3)]'
                                            : 'bg-[var(--bg-secondary)]/80 text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)] border border-[var(--border)]'
                                            }`}
                                    >
                                        {pill.label}
                                    </button>
                                ))}
                            </div>

                            <div className="flex items-center gap-3">
                                <select
                                    className="input-dark text-sm py-2 px-3 border border-[var(--border)] rounded-lg min-w-[140px]"
                                    value={genreFilter}
                                    onChange={(e) => setGenreFilter(e.target.value)}
                                >
                                    <option value="all">Всички жанрове</option>
                                    {availableGenres.map(g => (
                                        <option key={g} value={g}>{g}</option>
                                    ))}
                                </select>

                                <select
                                    className="input-dark text-sm py-2 px-3 border border-[var(--border)] rounded-lg min-w-[140px]"
                                    value={sortOption}
                                    onChange={(e) => setSortOption(e.target.value)}
                                >
                                    <option value="default">Препоръчани</option>
                                    <option value="newest">Най-нови</option>
                                    <option value="alphabetical">А-Я</option>
                                </select>
                            </div>
                        </div>

                        {loading ? (
                            <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4 sm:gap-6">
                                {[...Array(10)].map((_, i) => (
                                    <div key={i} className="animate-pulse">
                                        <div className="bg-[var(--bg-secondary)]/50 aspect-[2/3] rounded-xl mb-3"></div>
                                        <div className="h-4 bg-[var(--bg-secondary)]/50 rounded w-3/4 mb-2"></div>
                                        <div className="h-3 bg-[var(--bg-secondary)]/50 rounded w-1/2"></div>
                                    </div>
                                ))}
                            </div>
                        ) : error ? (
                            <div className="glass-card p-5 mt-6 border border-[var(--danger)]/35 text-center">
                                <p className="text-sm text-[#ffc9c9]">{error}</p>
                            </div>
                        ) : filtered.length === 0 ? (
                            <div className="text-center py-20 glass-card">
                                <Film className="w-12 h-12 text-[var(--text-muted)] mx-auto mb-4 opacity-50" />
                                <p className="text-[var(--text-muted)]">Няма намерени продукции с този филтър.</p>
                            </div>
                        ) : (
                            <StaggerContainer className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4 sm:gap-6">
                                {filtered.map((prod) => (
                                    <StaggerItem key={prod.id}>
                                        <ProductionCard
                                            production={prod}
                                            isInWatchlist={watchlistIds.has(prod.id)}
                                            onToggleWatchlist={() => toggleWatchlist(prod.id)}
                                        />
                                    </StaggerItem>
                                ))}
                            </StaggerContainer>
                        )}
                    </div>
                </section>
            </ScrollReveal>
        </div>
    );
}
