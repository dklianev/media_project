import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { MessagesSquare, Send, ArrowLeft, Loader2 } from 'lucide-react';
import PageBackground from '../components/PageBackground';
import { api } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { useToastContext } from '../context/ToastContext';
import { formatDateTime } from '../utils/formatters';

export default function TicketPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();
    const { showToast } = useToastContext();

    const [ticket, setTicket] = useState(null);
    const [messages, setMessages] = useState([]);
    const [loading, setLoading] = useState(true);
    const [replyText, setReplyText] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const messagesEndRef = useRef(null);

    useEffect(() => {
        fetchTicketThread();
    }, [id]);

    useEffect(() => {
        // Auto-scroll to bottom of messages
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    const fetchTicketThread = async () => {
        try {
            setLoading(true);
            const { ticket, messages } = await api.get(`/support/${id}`);
            setTicket(ticket);
            setMessages(messages);
        } catch (err) {
            console.error('Error fetching ticket thread:', err);
            showToast('Неуспешно зареждане на запитването.', 'error');
            navigate('/faq'); // Go back if denied or not found
        } finally {
            setLoading(false);
        }
    };

    const handleReply = async (e) => {
        e.preventDefault();
        if (!replyText.trim() || submitting) return;

        try {
            setSubmitting(true);
            await api.post(`/support/${id}/reply`, { replyText });
            setReplyText('');
            await fetchTicketThread(); // Refresh thread to get new message
        } catch (err) {
            console.error('Error sending reply:', err);
            showToast('Грешка при изпращането на отговора.', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen pt-24 pb-12 px-4 flex justify-center items-center">
                <PageBackground />
                <Loader2 className="w-8 h-8 text-[var(--accent-primary)] animate-spin" />
            </div>
        );
    }

    if (!ticket) return null;

    return (
        <div className="min-h-screen pt-24 pb-12 px-4">
            <PageBackground />

            <div className="max-w-4xl mx-auto">
                {/* Header */}
                <div className="mb-8 pl-4 lg:pl-0">
                    <button
                        onClick={() => navigate(user?.role === 'admin' || user?.role === 'superadmin' ? '/admin/support' : '/faq')}
                        className="flex items-center gap-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors mb-4"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        Назад
                    </button>
                    <div className="flex items-center gap-3">
                        <div className="p-3 rounded-xl bg-[var(--accent-primary)]/10 text-[var(--accent-primary)] ring-1 ring-[var(--accent-primary)]/20 shadow-[0_0_30px_rgba(0,186,255,0.15)]">
                            <MessagesSquare className="w-6 h-6" />
                        </div>
                        <div>
                            <h1 className="text-3xl font-bold text-[var(--text-primary)] tracking-tight">
                                {ticket.subject}
                            </h1>
                            <p className="text-[var(--text-muted)] mt-1">
                                Статус: <span className={ticket.status === 'open' ? 'text-amber-400' : 'text-emerald-400'}>
                                    {ticket.status === 'open' ? 'Отворен' : 'Затворен'}
                                </span>
                            </p>
                        </div>
                    </div>
                </div>

                {/* Chat Thread Area */}
                <div
                    className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-2xl flex flex-col shadow-2xl relative overflow-hidden backdrop-blur-xl"
                    style={{ minHeight: '420px', height: 'min(70vh, 680px)' }}
                >

                    {/* Chat Messages */}
                    <div className="flex-1 overflow-y-auto p-6 space-y-6">

                        {/* Original Ticket Message (treated as first message) */}
                        <div className="flex w-full justify-start">
                            <div className="max-w-[80%] rounded-2xl rounded-tl-sm p-4 bg-[var(--bg-primary)] border border-[var(--border)] text-[var(--text-primary)] shadow-sm">
                                <div className="flex items-center justify-between gap-4 mb-2">
                                    <span className="font-semibold text-sm opacity-90">{ticket.username}</span>
                                    <span className="text-xs opacity-70">{formatDateTime(ticket.created_at)}</span>
                                </div>
                                <p className="whitespace-pre-wrap leading-relaxed">{ticket.message}</p>
                            </div>
                        </div>

                        {/* Thread Messages */}
                        {messages.map((msg) => {
                            const msgIsAdmin = msg.role === 'admin' || msg.role === 'superadmin';

                            const justifyClass = msgIsAdmin ? 'justify-end' : 'justify-start';
                            const bubbleClass = msgIsAdmin
                                ? 'rounded-2xl rounded-tr-sm p-4 bg-[var(--accent-primary)] text-[var(--accent-foreground, #fff)] shadow-lg'
                                : 'rounded-2xl rounded-tl-sm p-4 bg-[var(--bg-primary)] border border-[var(--border)] text-[var(--text-primary)] shadow-sm';

                            return (
                                <div key={msg.id} className={`flex w-full ${justifyClass}`}>
                                    <div className={`max-w-[80%] ${bubbleClass}`}>
                                        <div className="flex items-center justify-between gap-4 mb-2">
                                            <span className="font-semibold text-sm opacity-90 flex items-center gap-2">
                                                {msg.username}
                                                {msgIsAdmin && <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/20 text-white border border-white/10 font-medium">Admin</span>}
                                            </span>
                                            <span className="text-xs opacity-70">{formatDateTime(msg.created_at)}</span>
                                        </div>
                                        <p className="whitespace-pre-wrap leading-relaxed">{msg.message}</p>
                                    </div>
                                </div>
                            );
                        })}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Chat Input Area */}
                    <div className="p-4 border-t border-[var(--border)] bg-[var(--bg-primary)]">
                        <form onSubmit={handleReply} className="relative">
                            <textarea
                                value={replyText}
                                onChange={(e) => setReplyText(e.target.value)}
                                placeholder="Напишете вашия отговор..."
                                className="w-full bg-[var(--bg-primary)] border border-[var(--border)] rounded-xl py-3 pl-4 pr-14 text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)] focus:ring-1 focus:ring-[var(--accent-primary)] resize-none h-14 transition-all"
                                rows="1"
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        handleReply(e);
                                    }
                                }}
                            />
                            <button
                                type="submit"
                                disabled={!replyText.trim() || submitting}
                                className="absolute right-2 top-2 p-2 rounded-lg bg-[var(--accent-primary)] text-white hover:bg-[var(--accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                            </button>
                        </form>
                    </div>

                </div>
            </div>
        </div>
    );
}
