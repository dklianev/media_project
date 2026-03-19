import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Link, NavLink } from '@/components/AppLink';
import { AnimatePresence, motion } from '@/lib/motion';
import { Calendar as CalendarIcon, ChevronDown, Crown, Film, Gift, Heart, Home, LogOut, Menu, Moon, MonitorPlay, Settings, ShoppingBag, Sun, User, Users, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import SubscriptionBadge from './SubscriptionBadge';
import NotificationDropdown from './NotificationDropdown';
import { getPublicSettings, subscribeToPublicSettingsUpdates } from '../utils/settings';

const DEFAULT_NAV = [
  { to: '/', key: 'nav_label_home', fallback: 'Начало', icon: Home },
  { to: '/productions', key: 'nav_label_catalog', fallback: 'Каталог', icon: Film },
  { to: '/calendar', key: 'nav_label_calendar', fallback: 'График', icon: CalendarIcon },
  { to: '/subscribe', key: 'nav_label_subscribe', fallback: 'Абонаменти', icon: Crown },
  { to: '/watch-party', key: 'nav_label_watch_party', fallback: 'Watch Party', icon: MonitorPlay },
];

const PROFILE_NAV = [
  { to: '/profile', fallback: 'Профил', icon: User },
  { to: '/my-purchases', fallback: 'Покупки', icon: ShoppingBag },
  { to: '/gifts', fallback: 'Подаръци', icon: Gift },
  { to: '/wishlist', fallback: 'Желания', icon: Heart },
  { to: '/referrals', fallback: 'Покани', icon: Users },
];

const EXTRA_NAV = [
  ...PROFILE_NAV,
  { to: '/watch-party', fallback: 'Watch Party', icon: MonitorPlay },
];

function NavPill({ to, label, icon: Icon, onClick }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      onClick={onClick}
      className={({ isActive }) =>
        `relative inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-semibold whitespace-nowrap z-10 ${isActive
          ? 'text-[var(--text-primary)] border border-[var(--border-light)] bg-[linear-gradient(135deg,rgba(212,175,55,0.16),rgba(75,197,255,0.1))] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]'
          : 'text-[var(--text-secondary)] border border-transparent hover:text-[var(--text-primary)] hover:bg-white/5'
        }`
      }
    >
      {({ isActive }) => (
        <motion.span
          className="inline-flex items-center gap-1.5"
          whileHover={!isActive ? { scale: 1.05 } : {}}
          whileTap={{ scale: 0.95 }}
          transition={{ type: 'spring', stiffness: 400, damping: 20 }}
        >
          <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>{label}</span>
        </motion.span>
      )}
    </NavLink>
  );
}

/* ── Profile Dropdown (desktop) ── */
function ProfileDropdown({ links }) {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef(null);
  const timeoutRef = useRef(null);
  const location = useLocation();
  const isChildActive = links.some((l) => location.pathname === l.to);

  const scheduleClose = () => {
    timeoutRef.current = setTimeout(() => setOpen(false), 150);
  };
  const cancelClose = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  };
  const handleEnter = () => { cancelClose(); setOpen(true); };
  const handleLeave = () => { scheduleClose(); };

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  useEffect(() => () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }, []);

  return (
    <div
      className="relative"
      ref={dropdownRef}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      <button
        onClick={() => setOpen((o) => !o)}
        className={`relative inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-semibold whitespace-nowrap z-10 transition-colors ${isChildActive
          ? 'text-[var(--text-primary)] border border-[var(--border-light)] bg-[linear-gradient(135deg,rgba(212,175,55,0.16),rgba(75,197,255,0.1))] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]'
          : 'text-[var(--text-secondary)] border border-transparent hover:text-[var(--text-primary)] hover:bg-white/5'
        }`}
      >
        <User className="w-4 h-4 shrink-0" />
        <span>Профил</span>
        <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.97 }}
            transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
            className="absolute top-full right-0 mt-2 w-48 rounded-xl border border-[var(--glass-border)] bg-[var(--bg-secondary)]/95 backdrop-blur-xl shadow-2xl shadow-black/40 overflow-hidden z-50"
          >
            <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-[var(--accent-gold)]/30 to-transparent" />
            <div className="py-1.5">
              {links.map((link) => {
                const Icon = link.icon;
                return (
                  <NavLink
                    key={link.to}
                    to={link.to}
                    end
                    className={({ isActive }) =>
                      `flex items-center gap-2.5 px-4 py-2.5 text-[13px] font-medium transition-colors ${isActive
                        ? 'text-[var(--accent-gold-light)] bg-[var(--accent-gold)]/10'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-white/5'
                      }`
                    }
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    {link.label}
                  </NavLink>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── Mobile Drawer ── */
function MobileDrawer({ open, onClose, navLinks, isAdmin, adminLabel, user, theme, toggleTheme, logout }) {
  const location = useLocation();
  const drawerRef = useRef(null);
  const closeButtonRef = useRef(null);
  const previousFocusRef = useRef(null);
  const previousPathnameRef = useRef(location.pathname);

  useEffect(() => {
    if (!open) return undefined;

    previousFocusRef.current = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus({ preventScroll: true });

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }

      if (event.key !== 'Tab' || !drawerRef.current) return;
      const focusable = drawerRef.current.querySelectorAll(
        'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
      previousFocusRef.current?.focus?.({ preventScroll: true });
    };
  }, [open]);

  useEffect(() => {
    if (open && previousPathnameRef.current !== location.pathname) {
      onClose();
    }
    previousPathnameRef.current = location.pathname;
  }, [location.pathname, onClose, open]);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm"
          />
          {/* Drawer */}
          <motion.aside
            ref={drawerRef}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
            className="fixed top-0 right-0 bottom-0 w-72 z-[70] bg-[var(--bg-secondary)] border-l border-[var(--border)] shadow-2xl flex flex-col"
            role="dialog"
            aria-modal="true"
            aria-label="Навигационно меню"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
              <div className="flex items-center gap-2">
                {user?.discord_avatar && (
                  <img src={user.discord_avatar} alt="" className="w-8 h-8 rounded-full border border-[var(--accent-gold)]/40 object-cover" />
                )}
                <div>
                  <p className="text-sm font-semibold">{user?.character_name || 'Без име'}</p>
                  <SubscriptionBadge planName={user?.plan_name} tierLevel={user?.tier_level} />
                </div>
              </div>
              <motion.button
                ref={closeButtonRef}
                onClick={onClose}
                whileTap={{ scale: 0.85 }}
                className="w-8 h-8 rounded-full border border-[var(--border)] flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] transition"
              >
                <X className="w-4 h-4" />
              </motion.button>
            </div>

            {/* Nav links */}
            <nav className="flex-1 overflow-y-auto p-4 space-y-1">
              {navLinks.map((link) => {
                const Icon = link.icon;
                return (
                  <NavLink
                    key={link.to}
                    to={link.to}
                    end={link.to === '/'}
                    onClick={onClose}
                    className={({ isActive }) =>
                      `flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition ${isActive
                        ? 'bg-[var(--accent-gold)]/10 text-[var(--accent-gold-light)] border border-[var(--accent-gold)]/25'
                        : 'text-[var(--text-secondary)] hover:bg-white/5 border border-transparent'
                      }`
                    }
                  >
                    <Icon className="w-4.5 h-4.5" />
                    {link.label}
                  </NavLink>
                );
              })}
              {isAdmin && (
                <NavLink
                  to="/admin"
                  onClick={onClose}
                  className={({ isActive }) =>
                    `flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition ${isActive
                      ? 'bg-[var(--accent-gold)]/10 text-[var(--accent-gold-light)] border border-[var(--accent-gold)]/25'
                      : 'text-[var(--text-secondary)] hover:bg-white/5 border border-transparent'
                    }`
                  }
                >
                  <Settings className="w-4.5 h-4.5" />
                  {adminLabel || 'Админ'}
                </NavLink>
              )}
            </nav>

            {/* Bottom actions */}
            <div className="p-4 border-t border-[var(--border)] space-y-2">
              <button
                onClick={() => { toggleTheme(); onClose(); }}
                className="w-full flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-[var(--text-secondary)] hover:bg-white/5 transition border border-transparent"
              >
                {theme === 'dark' ? <Sun className="w-4.5 h-4.5" /> : <Moon className="w-4.5 h-4.5" />}
                {theme === 'dark' ? 'Светла тема' : 'Тъмна тема'}
              </button>
              <button
                onClick={() => { logout(); onClose(); }}
                className="w-full flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-[var(--danger)] hover:bg-[var(--danger)]/10 transition border border-transparent"
              >
                <LogOut className="w-4.5 h-4.5" />
                Изход
              </button>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

export default function Navbar() {
  const location = useLocation();
  const { user, logout, isAdmin } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [ui, setUi] = useState({
    siteName: 'Elite Capital',
    siteTagline: 'Премиум стрийминг платформа',
    liveBadgeText: 'На живо',
    adminZoneLabel: 'Административна зона',
    siteLogo: '',
    stream_is_live: 'false',
  });

  const [navLinks, setNavLinks] = useState([
    ...DEFAULT_NAV.map((n) => ({ to: n.to, label: n.fallback, icon: n.icon })),
    ...EXTRA_NAV.map((n) => ({ to: n.to, label: n.fallback, icon: n.icon, extra: true })),
  ]);
  const [profileLinks, setProfileLinks] = useState(
    PROFILE_NAV.map((n) => ({ to: n.to, label: n.fallback, icon: n.icon })),
  );

  useEffect(() => {
    const loadSettings = (force = false) => {
      getPublicSettings(force)
        .then((settings) => {
          setUi((prev) => ({
            siteName: settings?.site_name || prev.siteName,
            siteTagline: settings?.site_tagline || prev.siteTagline,
            liveBadgeText: settings?.live_badge_text || prev.liveBadgeText,
            adminZoneLabel: settings?.nav_label_admin_zone || 'Административна зона',
            siteLogo: settings?.site_logo || '',
            stream_is_live: settings?.stream_is_live || 'false',
          }));
          setNavLinks([
            ...DEFAULT_NAV.map((n) => ({
              to: n.to,
              label: settings?.[n.key] || n.fallback,
              icon: n.icon,
            })),
            ...EXTRA_NAV.map((n) => ({
              to: n.to,
              label: n.fallback,
              icon: n.icon,
              extra: true,
            })),
          ]);
          setProfileLinks(
            PROFILE_NAV.map((n) => ({ to: n.to, label: n.fallback, icon: n.icon })),
          );
        })
        .catch((err) => { console.error('Navbar settings load failed:', err); });
    };

    loadSettings();
    const unsubscribe = subscribeToPublicSettingsUpdates(() => {
      loadSettings(true);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handler, { passive: true });
    return () => window.removeEventListener('scroll', handler);
  }, []);

  // Subscription expiry warning
  const expiryWarning = (() => {
    if (!user?.subscription_expires_at) return null;
    const expires = new Date(user.subscription_expires_at);
    const daysLeft = Math.ceil((expires - Date.now()) / (1000 * 60 * 60 * 24));
    if (daysLeft <= 0) return 'Изтекъл';
    if (daysLeft <= 3) return `${daysLeft}д`;
    return null;
  })();

  return (
    <>
      <motion.header
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className={`spotlight-top sticky top-0 z-50 border-b border-[var(--border)]/70 transition-all duration-500 ${scrolled
          ? 'bg-[rgba(4,6,15,0.92)] backdrop-blur-2xl shadow-lg shadow-black/30 py-0'
          : 'bg-[color:var(--glass)]/90 backdrop-blur-xl'
          }`}
      >
        <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-[var(--accent-cyan)]/45 to-transparent" />

        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between gap-1.5 lg:gap-3">
            <Link to="/" className="no-underline flex items-center gap-2.5">
              {ui.siteLogo ? (
                <motion.img
                  src={ui.siteLogo}
                  alt={ui.siteName || 'Лого на платформата'}
                  className="w-10 h-10 rounded-xl object-cover shadow-lg shadow-[var(--accent-gold)]/25"
                  whileHover={{ scale: 1.08 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 15 }}
                />
              ) : (
                <motion.span
                  className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#f6e4b2] to-[var(--accent-gold)] text-[#11131a] flex items-center justify-center shadow-lg shadow-[var(--accent-gold)]/25"
                  whileHover={{ scale: 1.08 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 15 }}
                >
                  <Crown className="w-5 h-5" aria-hidden="true" />
                </motion.span>
              )}
              <div className="leading-tight min-w-0">
                <p className="font-display text-xl sm:text-2xl text-gradient-gold truncate max-w-[130px] sm:max-w-[280px]">{ui.siteName}</p>
                <p className="hidden sm:block text-[10px] uppercase tracking-[0.28em] text-[var(--text-muted)] truncate">{ui.siteTagline}</p>
              </div>
            </Link>

            <nav className="hidden md:flex flex-1 justify-center items-center gap-1">
              {navLinks.filter((l) => !l.extra).map((link) => (
                <NavPill key={link.to} {...link} />
              ))}
              <ProfileDropdown links={profileLinks} />
              {isAdmin && <NavPill to="/admin" label={ui.adminZoneLabel || 'Админ'} icon={Settings} />}
            </nav>

            <div className="flex items-center gap-1.5 sm:gap-2">
              <Link
                to="/live"
                className={`flex items-center gap-1.5 rounded-full px-2 sm:px-3 py-1 sm:py-1.5 text-[11px] font-bold uppercase tracking-[0.08em] transition-all no-underline ${ui.stream_is_live === 'true'
                  ? 'bg-[var(--danger)]/20 text-[var(--danger)] border border-[var(--danger)]/50 shadow-[0_0_15px_rgba(239,68,68,0.3)] animate-pulse hover:bg-[var(--danger)]/30'
                  : 'border border-[var(--border)] text-[var(--text-muted)] bg-[var(--bg-secondary)]/60 opacity-60 hover:opacity-100'
                  }`}
                title={ui.stream_is_live === 'true' ? 'На живо' : 'Офлайн'}
              >
                <span className={`w-2 h-2 sm:w-1.5 sm:h-1.5 rounded-full shrink-0 ${ui.stream_is_live === 'true' ? 'bg-[var(--danger)] animate-ping' : 'bg-[var(--text-muted)]'}`} />
                <span className="hidden sm:inline whitespace-nowrap">{ui.stream_is_live === 'true' ? 'На живо' : 'Офлайн'}</span>
              </Link>

              <NotificationDropdown />

              {user?.discord_avatar ? (
                <motion.img
                  src={user.discord_avatar}
                  alt={user?.character_name ? `Аватар на ${user.character_name}` : 'Потребителски аватар'}
                  className="w-9 h-9 rounded-full border border-[var(--accent-gold)]/45 object-cover"
                  whileHover={{ scale: 1.1, borderColor: 'rgba(212,175,55,0.7)' }}
                />
              ) : (
                <div className="w-9 h-9 rounded-full border border-[var(--border)] bg-[var(--bg-tertiary)]" />
              )}
              <div className="hidden lg:block max-w-[150px]">
                <p className="text-[13px] font-semibold leading-tight truncate">{user?.character_name || 'Без име'}</p>
                <div className="flex items-center gap-1 mt-0.5">
                  <div className="shrink-0 scale-90 origin-left">
                    <SubscriptionBadge planName={user?.plan_name} tierLevel={user?.tier_level} />
                  </div>
                  {expiryWarning && (
                    <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--warning)]/15 text-[var(--warning)] border border-[var(--warning)]/30 font-bold hidden lg:inline-block">
                      {expiryWarning}
                    </span>
                  )}
                </div>
              </div>
              <motion.button
                onClick={toggleTheme}
                className="hidden sm:flex w-9 h-9 rounded-full border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--accent-gold)] hover:border-[var(--accent-gold)]/45 transition items-center justify-center"
                title={theme === 'dark' ? 'Светла тема' : 'Тъмна тема'}
                aria-label={theme === 'dark' ? 'Светла тема' : 'Тъмна тема'}
                whileHover={{ rotate: 20, scale: 1.08 }}
                whileTap={{ scale: 0.85 }}
              >
                {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </motion.button>
              <motion.button
                onClick={logout}
                className="hidden sm:flex w-9 h-9 rounded-full border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--danger)] hover:border-[var(--danger)]/45 transition items-center justify-center"
                title="Изход"
                aria-label="Изход"
                whileHover={{ rotate: -12 }}
                whileTap={{ scale: 0.85 }}
              >
                <LogOut className="w-4 h-4" aria-hidden="true" />
              </motion.button>

              {/* Mobile hamburger */}
              <motion.button
                onClick={() => setMobileOpen(true)}
                className="md:hidden w-9 h-9 rounded-full border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition flex items-center justify-center"
                whileTap={{ scale: 0.85 }}
                aria-label="Меню"
                aria-expanded={mobileOpen}
                aria-haspopup="dialog"
              >
                <Menu className="w-4 h-4" />
              </motion.button>
            </div>
          </div>
        </div>
      </motion.header>

      <MobileDrawer
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        navLinks={navLinks}
        isAdmin={isAdmin}
        adminLabel={ui.adminZoneLabel}
        user={user}
        theme={theme}
        toggleTheme={toggleTheme}
        logout={logout}
      />
    </>
  );
}
