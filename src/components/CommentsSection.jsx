import { useState, useEffect, lazy, Suspense } from 'react';
import { motion, AnimatePresence } from '@/lib/motion';
import { MessageSquare, Send, Trash2, User, Smile } from 'lucide-react';

const LazyEmojiPicker = lazy(() => import('emoji-picker-react'));
import { api } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { useToastContext } from '../context/ToastContext';
import { getPublicSettings } from '../utils/settings';
import { formatDate } from '../utils/formatters';

export default function CommentsSection({ episodeId }) {
    const { user, isAdmin } = useAuth();
    const { showToast } = useToastContext();
    const [comments, setComments] = useState([]);
    const [newComment, setNewComment] = useState('');
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    const [ui, setUi] = useState({
        comments_title: 'Дискусия',
        comments_placeholder: 'Напиши коментар...',
        comments_empty: 'Все още няма коментари. Бъдете първи!'
    });

    useEffect(() => {
        let active = true;

        getPublicSettings().then(settings => {
            if (active && settings) {
                setUi(prev => ({
                    comments_title: settings.comments_title || prev.comments_title,
                    comments_placeholder: settings.comments_placeholder || prev.comments_placeholder,
                    comments_empty: settings.comments_empty || prev.comments_empty,
                }));
            }
        }).catch((err) => { console.error('Comments settings load failed:', err); });
        api.get(`/comments/episode/${episodeId}`)
            .then(data => {
                if (active) {
                    setComments(Array.isArray(data) ? data : []);
                    setLoading(false);
                }
            })
            .catch(err => {
                if (active) {
                    console.error(err);
                    setLoading(false);
                }
            });
        return () => { active = false; };
    }, [episodeId]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!newComment.trim()) return;

        setSubmitting(true);
        try {
            const added = await api.post('/comments', { episode_id: episodeId, content: newComment });
            setComments(prev => [added, ...prev]);
            setNewComment('');
            showToast('Коментарът е публикуван.', 'success');
        } catch (err) {
            showToast(err.message || 'Грешка при публикуване.', 'error');
        } finally {
            setSubmitting(false);
            setShowEmojiPicker(false);
        }
    };

    const handleDelete = async (commentId) => {
        if (!window.confirm('Сигурни ли сте, че искате да изтриете този коментар?')) return;
        try {
            await api.delete(`/comments/${commentId}`);
            setComments(prev => prev.filter(c => c.id !== commentId));
            showToast('Коментарът е изтрит.', 'success');
        } catch (err) {
            showToast(err.message || 'Грешка при изтриване.', 'error');
        }
    };

    if (loading) {
        return (
            <div className="mt-8 pt-8 border-t border-[var(--border)] opacity-60">
                <div className="animate-pulse h-6 w-32 bg-[var(--bg-secondary)] rounded mb-4"></div>
                <div className="animate-pulse h-24 w-full bg-[var(--bg-secondary)] rounded mb-4"></div>
            </div>
        );
    }

    return (
        <div className="mt-8 pt-8 border-t border-[var(--border)]">
            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[var(--accent-gold)]/10 flex items-center justify-center border border-[var(--accent-gold)]/20 shadow-[0_0_15px_rgba(212,175,55,0.15)]">
                        <MessageSquare className="w-5 h-5 text-[var(--accent-gold)]" />
                    </div>
                    <div>
                        <h3 className="text-xl font-bold text-[var(--text-primary)] tracking-wide flex items-center gap-2">
                            {ui.comments_title}
                            <span className="text-sm font-medium px-2.5 py-0.5 rounded-full bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border border-[var(--border)]">
                                {comments.length}
                            </span>
                        </h3>
                    </div>
                </div>
            </div>

            <form onSubmit={handleSubmit} className="mb-8">
                <div className="relative">
                    <textarea
                        value={newComment}
                        onChange={(e) => setNewComment(e.target.value)}
                        className="input-dark w-full min-h-[100px] resize-y py-3 px-4 pb-12"
                        placeholder={ui.comments_placeholder}
                        disabled={submitting}
                    />

                    {/* Toolbar inside textarea area */}
                    <div className="absolute left-3 bottom-3 flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                            className="p-1.5 text-[var(--text-muted)] hover:text-[var(--accent-gold)] rounded-md hover:bg-[var(--bg-tertiary)] transition-colors"
                            title="Вмъкни емоджи"
                        >
                            <Smile className="w-5 h-5" />
                        </button>
                    </div>

                    <button
                        type="submit"
                        disabled={!newComment.trim() || submitting}
                        className="absolute right-3 bottom-3 p-2 bg-[var(--accent-gold)] text-black rounded-lg hover:bg-[var(--accent-gold-light)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium flex items-center gap-1 shadow-[0_0_15px_rgba(212,175,55,0.2)]"
                        title="Изпрати"
                    >
                        {submitting ? <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" /> : <><Send className="w-4 h-4" /></>}
                    </button>

                    {/* Emoji Picker Popover */}
                    <AnimatePresence>
                        {showEmojiPicker && (
                            <motion.div
                                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                className="absolute left-0 bottom-full mb-2 z-50"
                            >
                                <Suspense fallback={<div className="p-4 text-sm text-[var(--text-muted)]">Зареждане...</div>}>
                                    <LazyEmojiPicker
                                        theme="dark"
                                        emojiStyle="native"
                                        onEmojiClick={(emojiData) => {
                                            setNewComment(prev => prev + emojiData.emoji);
                                        }}
                                        lazyLoadEmojis={true}
                                    />
                                </Suspense>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </form>

            <div className="space-y-4">
                <AnimatePresence initial={false}>
                    {comments.map((comment, index) => (
                        <motion.div
                            key={comment.id || index}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="glass-card p-4 sm:p-5 relative group"
                        >
                            <div className="flex items-start gap-4">
                                <div className="w-10 h-10 rounded-full bg-[var(--bg-secondary)] border border-[var(--border)] overflow-hidden shrink-0 flex items-center justify-center">
                                    {comment.discord_avatar ? (
                                        <img
                                            src={comment.discord_avatar}
                                            alt="avatar"
                                            className="w-full h-full object-cover"
                                            onError={(e) => { e.target.style.display = 'none'; if (e.target.nextSibling) e.target.nextSibling.style.display = 'block'; }}
                                        />
                                    ) : null}
                                    <User className="w-5 h-5 text-[var(--text-muted)]" style={{ display: comment.discord_avatar ? 'none' : 'block' }} />
                                </div>

                                <div className="flex-1 min-w-0">
                                    <div className="flex items-baseline justify-between mb-1">
                                        <span className="font-medium text-[var(--text-primary)] truncate pr-2">
                                            {comment.character_name || comment.discord_username || 'Неизвестен'}
                                        </span>
                                        <span className="text-xs text-[var(--text-muted)] shrink-0">
                                            {formatDate(comment.created_at, 'bg-BG', { day: '2-digit', month: 'short', year: 'numeric' })}
                                        </span>
                                    </div>

                                    <p className="text-sm text-[var(--text-secondary)] whitespace-pre-wrap break-words">
                                        {comment.content}
                                    </p>
                                </div>
                            </div>

                            {/* Admin or Author Delete Button */}
                            {(isAdmin || user?.id === comment.user_id) && (
                                <button
                                    onClick={() => handleDelete(comment.id)}
                                    className="absolute top-4 right-4 p-1.5 text-[var(--text-muted)] hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity bg-[var(--bg-secondary)] rounded-md border border-[var(--border)]"
                                    title="Изтрий коментара"
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                </button>
                            )}
                        </motion.div>
                    ))}

                    {comments.length === 0 && (
                        <div className="text-center py-8 text-[var(--text-muted)]">
                            {ui.comments_empty}
                        </div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}
