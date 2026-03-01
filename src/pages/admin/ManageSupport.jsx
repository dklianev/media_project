
import { useState, useEffect } from 'react';
import { api } from '../../utils/api';
import { useToastContext } from '../../context/ToastContext';
import { Mail, Search, CheckCircle, Clock, RefreshCw, User, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { formatDateTime } from '../../utils/formatters';

export default function ManageSupport() {
    const [tickets, setTickets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('all'); // all, open, closed
    const [searchTerm, setSearchTerm] = useState('');
    const { showToast } = useToastContext();
    const navigate = useNavigate();

    const fetchTickets = () => {
        setLoading(true);
        const query = filter !== 'all' ? `?status=${filter}` : '';
        api.get(`/support/admin${query}`)
            .then(data => setTickets(data))
            .catch(err => showToast(err.message || 'Грешка при зареждане', 'error'))
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        fetchTickets();
    }, [filter]);

    const filteredTickets = tickets.filter(t =>
        t.subject?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.username?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.discord_username?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold">Запитвания</h1>
                    <p className="text-[var(--text-muted)] text-sm mt-1">
                        Управление на потребителски запитвания от формата за контакт
                    </p>
                </div>
                <button onClick={fetchTickets} className="btn-outline text-sm py-2 px-3 flex items-center gap-2">
                    <RefreshCw className="w-4 h-4" /> Обнови
                </button>
            </div>

            <div className="glass-card p-4 sm:p-5 flex flex-col sm:flex-row gap-4 items-center justify-between">
                <div className="relative w-full sm:max-w-xs">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                    <input
                        type="text"
                        placeholder="Търси по тема, име или имейл..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="input-dark w-full pl-9"
                    />
                </div>

                <div className="flex bg-[var(--bg-tertiary)] p-1 rounded-lg w-full sm:w-auto overflow-x-auto shrink-0">
                    <button
                        onClick={() => setFilter('all')}
                        className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${filter === 'all' ? 'bg-[var(--accent-gold)] text-black' : 'text-[var(--text-secondary)] hover:text-white'}`}
                    >
                        Всички
                    </button>
                    <button
                        onClick={() => setFilter('open')}
                        className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5 ${filter === 'open' ? 'bg-amber-500/20 text-amber-500' : 'text-[var(--text-secondary)] hover:text-white'}`}
                    >
                        <Clock className="w-3.5 h-3.5" /> Отворени
                    </button>
                    <button
                        onClick={() => setFilter('closed')}
                        className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5 ${filter === 'closed' ? 'bg-emerald-500/20 text-emerald-500' : 'text-[var(--text-secondary)] hover:text-white'}`}
                    >
                        <CheckCircle className="w-3.5 h-3.5" /> Затворени
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="glass-card p-12 flex justify-center items-center">
                    <div className="w-8 h-8 border-2 border-[var(--accent-gold)] border-t-transparent rounded-full animate-spin"></div>
                </div>
            ) : filteredTickets.length === 0 ? (
                <div className="glass-card p-12 text-center">
                    <Mail className="w-12 h-12 text-[var(--text-muted)] opacity-50 mx-auto mb-4" />
                    <h3 className="text-lg font-medium">Няма намерени запитвания</h3>
                    <p className="text-[var(--text-muted)] mt-1">Не са открити тикети, отговарящи на критериите.</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {filteredTickets.map(ticket => (
                        <div
                            key={ticket.id}
                            className="glass-card p-5 transition-all hover:bg-white/5"
                        >
                            <div className="flex items-start justify-between gap-4 mb-3">
                                <h3 className="font-semibold text-lg line-clamp-1">{ticket.subject}</h3>
                                <span className={`px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider rounded-md shrink-0 flex items-center gap-1.5 ${ticket.status === 'open' ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20' : 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                                    }`}>
                                    {ticket.status === 'open' ? <Clock className="w-3 h-3" /> : <CheckCircle className="w-3 h-3" />}
                                    {ticket.status === 'open' ? 'Отворен' : 'Затворен'}
                                </span>
                            </div>

                            <p className="text-sm text-[var(--text-secondary)] line-clamp-2 mb-4 leading-relaxed">
                                {ticket.message}
                            </p>

                            <div className="flex items-center justify-between gap-4 text-xs text-[var(--text-muted)] border-t border-[var(--border)] pt-3">
                                <div className="flex items-center gap-4">
                                    <div className="flex items-center gap-1.5 font-medium text-[var(--text-primary)]">
                                        <User className="w-3.5 h-3.5" />
                                        {ticket.username}
                                    </div>
                                    <div>•</div>
                                    <div>{formatDateTime(ticket.created_at)}</div>
                                </div>
                                <button
                                    onClick={() => navigate(`/support/${ticket.id}`)}
                                    className="p-2 bg-[var(--accent-primary)]/10 text-[var(--accent-primary)] hover:bg-[var(--accent-primary)]/20 rounded-lg transition-colors flex items-center gap-2"
                                    title="Отвори разговора"
                                >
                                    <ExternalLink className="w-4 h-4" />
                                    <span className="text-sm">Преглед</span>
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
