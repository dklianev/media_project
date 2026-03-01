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
    const [headerHeight, setHeaderHeight] = useState(68);
    const debouncedQuery = useDebounce(query, 300);

    useEffect(() => {
        const updateHeight = () => {
            const nav = document.querySelector('header');
            if (nav) {
                setHeaderHeight(nav.getBoundingClientRect().bottom);
            }
        };
        updateHeight();
        window.addEventListener('scroll', updateHeight, { passive: true });
        window.addEventListener('resize', updateHeight, { passive: true });
        return () => {
            window.removeEventListener('scroll', updateHeight);
            window.removeEventListener('resize', updateHeight);
        };
    }, []);

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

    const clearFilters = () => {
        setQuery('');
        setGroupFilter('all');
        setGenreFilter('all');
        setSortOption('default');
    };

    const hasActiveFilters = query !== '' || groupFilter !== 'all' || genreFilter !== 'all' || sortOption !== 'default';

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
                        <div
                            className="sticky z-40 bg-[var(--bg-primary)]/95 backdrop-blur-xl pb-4 pt-2 -mx-4 px-4 sm:-mx-6 sm:px-6 shadow-[0_10px_30px_-15px_rgba(0,0,0,0.5)] border-b border-[var(--border)]/50 mb-6"
                            style={{ top: `${headerHeight}px` }}
                        >

                            {/* Filter Summary & Result Count */}
                            <div className="flex items-center justify-between mb-4">
                                <span className="text-sm font-medium text-[var(--text-secondary)]">
                                    Намерени <strong className="text-[var(--text-primary)]">{filtered.length}</strong> {filtered.length === 1 ? 'резултат' : 'резултата'}
                                </span>
                                {hasActiveFilters && (
                                    <button
                                        onClick={clearFilters}
                                        className="text-xs font-semibold uppercase tracking-wider text-[var(--danger)] hover:text-[#ff8f8f] hover:bg-[var(--danger)]/10 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
                                    >
                                        Изчисти всички
                                    </button>
                                )}
                            </div>

                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
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

                                <div className="flex items-center gap-3 w-full sm:w-auto overflow-x-auto">
                                    <select
                                        className="input-dark text-sm py-2 px-3 border border-[var(--border)] rounded-lg min-w-[170px]"
                                        value={genreFilter}
                                        onChange={(e) => setGenreFilter(e.target.value)}
                                    >
                                        <option value="all">Всички жанрове</option>
                                        {availableGenres.map(g => (
                                            <option key={g} value={g}>{g}</option>
                                        ))}
                                    </select>

                                    <select
                                        className="input-dark text-sm py-2 px-3 border border-[var(--border)] rounded-lg min-w-[160px]"
                                        value={sortOption}
                                        onChange={(e) => setSortOption(e.target.value)}
                                    >
                                        <option value="default">Препоръчани</option>
                                        <option value="newest">Най-нови</option>
                                        <option value="alphabetical">А-Я</option>
                                    </select>
                                </div>
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
                            <StaggerContainer className="flex flex-col items-center justify-center text-center py-20 px-4 bg-[var(--bg-secondary)]/30 rounded-2xl border border-[var(--border)]/50 border-dashed relative overflow-hidden group">
                                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-[var(--accent-cyan)] opacity-5 blur-[80px] rounded-full pointer-events-none" />

                                <StaggerItem>
                                    <div className="relative w-20 h-20 rounded-full bg-[var(--bg-tertiary)] flex items-center justify-center mb-6 shadow-xl border border-[var(--border)]">
                                        <Film className="w-10 h-10 text-[var(--text-muted)] opacity-70" />
                                    </div>
                                </StaggerItem>

                                <StaggerItem>
                                    <h3 className="text-xl font-bold text-[var(--text-primary)] mb-2 tracking-tight">Няма намерени резултати</h3>
                                </StaggerItem>

                                <StaggerItem>
                                    <p className="text-[var(--text-secondary)] mb-8 max-w-sm text-sm">
                                        Опитай да промениш филтрите на търсенето, за да намериш това което търсиш.
                                    </p>
                                </StaggerItem>

                                <StaggerItem>
                                    <div className="mt-4">
                                        <button onClick={clearFilters} className="btn-outline border-[var(--border)] text-[var(--text-primary)] hover:border-[var(--accent-gold)] hover:text-[var(--accent-gold)] transition-colors px-6 py-2.5 rounded-xl text-sm uppercase tracking-widest cursor-pointer">
                                            Изчисти филтрите
                                        </button>
                                    </div>
                                </StaggerItem>
                            </StaggerContainer>
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
