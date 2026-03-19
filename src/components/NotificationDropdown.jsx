import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from '@/lib/motion';
import { Bell, Check, ExternalLink } from 'lucide-react';
import { Link } from '@/components/AppLink';
import { api } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { getPublicSettings } from '../utils/settings';
import { formatDateTime } from '../utils/formatters';

export default function NotificationDropdown() {
    const { user } = useAuth();
    const [notifications, setNotifications] = useState([]);
    const [open, setOpen] = useState(false);
    const [unreadCount, setUnreadCount] = useState(0);
    const dropdownRef = useRef(null);
    const triggerRef = useRef(null);
    const [ui, setUi] = useState({
        notifications_title: 'Известия',
        notifications_mark_read: 'Маркирай всички',
        notifications_empty: 'Няма нови известия',
        notifications_view: 'Виж'
    });

    useEffect(() => {
        let active = true;
        getPublicSettings().then(settings => {
            if (active && settings) {
                setUi(prev => ({
                    notifications_title: settings.notifications_title || prev.notifications_title,
                    notifications_mark_read: settings.notifications_mark_read || prev.notifications_mark_read,
                    notifications_empty: settings.notifications_empty || prev.notifications_empty,
                    notifications_view: settings.notifications_view || prev.notifications_view,
                }));
            }
        }).catch((err) => { console.error('Notification settings load failed:', err); });
        return () => { active = false; };
    }, []);

    const fetchNotifications = async () => {
        try {
            const data = await api.get('/notifications');
            setNotifications(Array.isArray(data) ? data : []);
            setUnreadCount((Array.isArray(data) ? data : []).filter(n => !n.is_read).length);
        } catch (err) {
            console.error('Failed to fetch notifications:', err);
        }
    };

    useEffect(() => {
        if (!user) return;
        fetchNotifications();
        // Poll every 60 seconds
        const interval = setInterval(fetchNotifications, 60000);
        return () => clearInterval(interval);
    }, [user]);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setOpen(false);
            }
        };
        const handleEsc = (event) => {
            if (open && event.key === 'Escape') {
                setOpen(false);
                triggerRef.current?.focus({ preventScroll: true });
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleEsc);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleEsc);
        }
    }, [open]);

    const markAsRead = async (id) => {
        try {
            await api.put(`/notifications/${id}/read`);
            setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: 1 } : n));
            setUnreadCount(prev => Math.max(0, prev - 1));
        } catch (err) {
            console.error('Failed to mark as read:', err);
        }
    };

    const markAllAsRead = async () => {
        try {
            await api.put('/notifications/read-all');
            setNotifications(prev => prev.map(n => ({ ...n, is_read: 1 })));
            setUnreadCount(0);
        } catch (err) {
            console.error('Failed to mark all as read:', err);
        }
    };

    const handleNotificationClick = (notification) => {
        if (!notification.is_read) {
            markAsRead(notification.id);
        }
        setOpen(false);
    };

    if (!user) return null;

    return (
        <div className="relative" ref={dropdownRef}>
            <motion.button
                ref={triggerRef}
                onClick={() => setOpen(!open)}
                aria-haspopup="dialog"
                aria-expanded={open}
                className="relative w-9 h-9 rounded-full border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition flex items-center justify-center bg-[var(--bg-secondary)]/50"
                whileTap={{ scale: 0.9 }}
            >
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--danger)] text-[9px] font-bold text-white border-2 border-[var(--bg-secondary)]">
                        {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                )}
            </motion.button>

            <AnimatePresence>
                {open && (
                    <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        transition={{ duration: 0.2 }}
                        role="dialog"
                        aria-label={ui.notifications_title}
                        className="absolute right-0 mt-3 w-[calc(100vw-32px)] max-w-[360px] sm:w-80 max-h-[400px] flex flex-col bg-[var(--bg-secondary)] border border-[var(--border)] rounded-2xl shadow-premium-lg overflow-hidden z-[100]"
                    >
                        <div className="flex items-center justify-between p-3 border-b border-[var(--border)] bg-[var(--bg-secondary)]">
                            <h3 className="text-sm font-semibold">{ui.notifications_title}</h3>
                            {unreadCount > 0 && (
                                <button
                                    onClick={markAllAsRead}
                                    className="text-xs text-[var(--accent-gold)] hover:text-[var(--accent-gold-light)] flex items-center gap-1"
                                >
                                    <Check className="w-3 h-3" />
                                    {ui.notifications_mark_read}
                                </button>
                            )}
                        </div>

                        <div className="flex-1 overflow-y-auto bg-[var(--bg-primary)]/20 pb-2">
                            {notifications.length === 0 ? (
                                <div className="py-8 text-center text-[var(--text-muted)] text-sm">
                                    {ui.notifications_empty}
                                </div>
                            ) : (
                                <div className="flex flex-col">
                                    {notifications.map((notif) => (
                                        <div
                                            key={notif.id}
                                            className={`group relative p-3 border-b border-[var(--border)]/50 hover:bg-white/5 transition-colors ${!notif.is_read ? 'bg-[var(--accent-gold)]/5' : ''}`}
                                        >
                                            {!notif.is_read && (
                                                <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-[var(--accent-gold)]" />
                                            )}
                                            <div className="pl-2">
                                                <p className="text-sm font-medium text-[var(--text-primary)] mb-1 leading-snug">
                                                    {notif.title}
                                                </p>
                                                <p className="text-xs text-[var(--text-secondary)] line-clamp-2 mb-2 leading-relaxed">
                                                    {notif.message}
                                                </p>
                                                <div className="flex items-center justify-between mt-1">
                                                    <span className="text-[10px] text-[var(--text-muted)]">
                                                        {formatDateTime(notif.created_at, 'bg-BG', {
                                                            day: 'numeric',
                                                            month: 'short',
                                                            hour: '2-digit',
                                                            minute: '2-digit',
                                                        })}
                                                    </span>
                                                    {notif.link && (
                                                        <Link
                                                            to={notif.link}
                                                            onClick={() => handleNotificationClick(notif)}
                                                            className="text-[10px] text-[var(--accent-gold)] hover:underline inline-flex items-center gap-1"
                                                        >
                                                            {ui.notifications_view} <ExternalLink className="w-3 h-3" />
                                                        </Link>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
