import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from '@/lib/motion';
import { Bell, Check, ExternalLink, Trash2, X } from 'lucide-react';
import { Link } from '@/components/AppLink';
import { api } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { useToastContext } from '../context/ToastContext';
import { getPublicSettings } from '../utils/settings';
import { formatDateTime } from '../utils/formatters';

export default function NotificationDropdown() {
    const { user } = useAuth();
    const { showToast } = useToastContext();
    const [notifications, setNotifications] = useState([]);
    const [open, setOpen] = useState(false);
    const [unreadCount, setUnreadCount] = useState(0);
    const dropdownRef = useRef(null);
    const triggerRef = useRef(null);
    const [ui, setUi] = useState({
        notifications_title: 'Известия',
        notifications_mark_read: 'Маркирай всички',
        notifications_empty: 'Няма нови известия',
        notifications_view: 'Виж',
        notifications_remove: 'Премахни',
        notifications_clear: 'Изчисти всички',
    });

    useEffect(() => {
        let active = true;

        getPublicSettings()
            .then((settings) => {
                if (!active || !settings) return;
                setUi((prev) => ({
                    notifications_title: settings.notifications_title || prev.notifications_title,
                    notifications_mark_read: settings.notifications_mark_read || prev.notifications_mark_read,
                    notifications_empty: settings.notifications_empty || prev.notifications_empty,
                    notifications_view: settings.notifications_view || prev.notifications_view,
                    notifications_remove: prev.notifications_remove,
                    notifications_clear: prev.notifications_clear,
                }));
            })
            .catch((err) => {
                console.error('Notification settings load failed:', err);
            });

        return () => {
            active = false;
        };
    }, []);

    const fetchNotifications = async () => {
        try {
            const data = await api.get('/notifications');
            const items = Array.isArray(data) ? data : [];
            setNotifications(items);
            setUnreadCount(items.filter((item) => !item.is_read).length);
        } catch (err) {
            console.error('Failed to fetch notifications:', err);
        }
    };

    useEffect(() => {
        if (!user) return undefined;

        fetchNotifications();
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
        };
    }, [open]);

    const markAsRead = async (id) => {
        try {
            await api.put(`/notifications/${id}/read`);
            setNotifications((prev) => prev.map((item) => (
                item.id === id ? { ...item, is_read: 1 } : item
            )));
            setUnreadCount((prev) => Math.max(0, prev - 1));
        } catch (err) {
            console.error('Failed to mark as read:', err);
        }
    };

    const markAllAsRead = async () => {
        try {
            await api.put('/notifications/read-all');
            setNotifications((prev) => prev.map((item) => ({ ...item, is_read: 1 })));
            setUnreadCount(0);
        } catch (err) {
            console.error('Failed to mark all as read:', err);
        }
    };

    const removeNotification = async (id) => {
        const target = notifications.find((item) => item.id === id);
        if (!target) return;

        try {
            await api.delete(`/notifications/${id}`);
            setNotifications((prev) => prev.filter((item) => item.id !== id));
            if (!target.is_read) {
                setUnreadCount((prev) => Math.max(0, prev - 1));
            }
        } catch (err) {
            console.error('Failed to remove notification:', err);
            showToast(err.message || 'Неуспешно премахване на известието.', 'error');
        }
    };

    const clearNotifications = async () => {
        try {
            await api.delete('/notifications');
            setNotifications([]);
            setUnreadCount(0);
        } catch (err) {
            console.error('Failed to clear notifications:', err);
            showToast(err.message || 'Неуспешно изчистване на известията.', 'error');
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
                onClick={() => setOpen((prev) => !prev)}
                aria-haspopup="dialog"
                aria-expanded={open}
                className="relative flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--bg-secondary)]/50 text-[var(--text-muted)] transition hover:text-[var(--text-primary)]"
                whileTap={{ scale: 0.9 }}
            >
                <Bell className="h-4 w-4" />
                {unreadCount > 0 && (
                    <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full border-2 border-[var(--bg-secondary)] bg-[var(--danger)] text-[9px] font-bold text-white">
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
                        className="absolute right-0 z-[100] mt-3 flex max-h-[400px] w-[calc(100vw-32px)] max-w-[360px] flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-secondary)] shadow-premium-lg sm:w-80"
                    >
                        <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--bg-secondary)] p-3">
                            <h3 className="text-sm font-semibold">{ui.notifications_title}</h3>
                            <div className="flex items-center gap-3">
                                {notifications.length > 0 && (
                                    <button
                                        type="button"
                                        onClick={clearNotifications}
                                        className="flex items-center gap-1 text-xs text-[var(--text-muted)] hover:text-[var(--danger)]"
                                    >
                                        <Trash2 className="h-3 w-3" />
                                        {ui.notifications_clear}
                                    </button>
                                )}
                                {unreadCount > 0 && (
                                    <button
                                        type="button"
                                        onClick={markAllAsRead}
                                        className="flex items-center gap-1 text-xs text-[var(--accent-gold)] hover:text-[var(--accent-gold-light)]"
                                    >
                                        <Check className="h-3 w-3" />
                                        {ui.notifications_mark_read}
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto bg-[var(--bg-primary)]/20 pb-2">
                            {notifications.length === 0 ? (
                                <div className="py-8 text-center text-sm text-[var(--text-muted)]">
                                    {ui.notifications_empty}
                                </div>
                            ) : (
                                <div className="flex flex-col">
                                    {notifications.map((notification) => (
                                        <div
                                            key={notification.id}
                                            className={`group relative border-b border-[var(--border)]/50 p-3 transition-colors hover:bg-white/5 ${!notification.is_read ? 'bg-[var(--accent-gold)]/5' : ''}`}
                                        >
                                            {!notification.is_read && (
                                                <div className="absolute bottom-0 left-0 top-0 w-[2px] bg-[var(--accent-gold)]" />
                                            )}
                                            <button
                                                type="button"
                                                onClick={(event) => {
                                                    event.stopPropagation();
                                                    removeNotification(notification.id);
                                                }}
                                                className="absolute right-2 top-2 rounded-full p-1 text-[var(--text-muted)] opacity-0 transition hover:bg-white/10 hover:text-[var(--text-primary)] focus:opacity-100 group-hover:opacity-100"
                                                aria-label={`${ui.notifications_remove}: ${notification.title}`}
                                            >
                                                <X className="h-3.5 w-3.5" />
                                            </button>

                                            <div className="pl-2 pr-7">
                                                <p className="mb-1 text-sm font-medium leading-snug text-[var(--text-primary)]">
                                                    {notification.title}
                                                </p>
                                                <p className="mb-2 line-clamp-2 text-xs leading-relaxed text-[var(--text-secondary)]">
                                                    {notification.message}
                                                </p>
                                                <div className="mt-1 flex items-center justify-between gap-3">
                                                    <span className="text-[10px] text-[var(--text-muted)]">
                                                        {formatDateTime(notification.created_at, 'bg-BG', {
                                                            day: 'numeric',
                                                            month: 'short',
                                                            hour: '2-digit',
                                                            minute: '2-digit',
                                                        })}
                                                    </span>
                                                    {notification.link && (
                                                        <Link
                                                            to={notification.link}
                                                            onClick={() => handleNotificationClick(notification)}
                                                            className="inline-flex items-center gap-1 text-[10px] text-[var(--accent-gold)] hover:underline"
                                                        >
                                                            {ui.notifications_view} <ExternalLink className="h-3 w-3" />
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
