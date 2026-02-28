import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Crown, Film, Home, LogOut, Menu, Moon, Settings, Sparkles, Sun, User, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import SubscriptionBadge from './SubscriptionBadge';
import { getPublicSettings, subscribeToPublicSettingsUpdates } from '../utils/settings';

const DEFAULT_NAV = [
  { to: '/', key: 'nav_label_home', fallback: 'Начало', icon: Home },
  { to: '/productions', key: 'nav_label_catalog', fallback: 'Каталог', icon: Film },
  { to: '/subscribe', key: 'nav_label_subscribe', fallback: 'Абонаменти', icon: Crown },
  { to: '/profile', key: 'nav_label_profile', fallback: 'Профил', icon: User },
];

function NavPill({ to, label, icon: Icon, onClick }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      onClick={onClick}
      className={({ isActive }) =>
        `relative inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-semibold z-10 ${isActive
          ? 'text-[var(--text-primary)] border border-[var(--border-light)] bg-[linear-gradient(135deg,rgba(212,175,55,0.16),rgba(75,197,255,0.1))] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]'
          : 'text-[var(--text-secondary)] border border-transparent hover:text-[var(--text-primary)] hover:bg-white/5'
        }`
      }
    >
      {({ isActive }) => (
        <motion.span
          className="inline-flex items-center gap-2"
          whileHover={!isActive ? { scale: 1.05 } : {}}
          whileTap={{ scale: 0.95 }}
          transition={{ type: 'spring', stiffness: 400, damping: 20 }}
        >
          <Icon className="w-4 h-4" aria-hidden="true" />
          <span>{label}</span>
        </motion.span>
      )}
    </NavLink>
  );
}

/* ── Mobile Drawer ── */
function MobileDrawer({ open, onClose, navLinks, isAdmin, adminLabel, user, theme, toggleTheme, logout }) {
  // Close on route change
  const location = useLocation();
  useEffect(() => { if (open) onClose(); }, [location.pathname]);

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
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
            className="fixed top-0 right-0 bottom-0 w-72 z-[70] bg-[var(--bg-secondary)] border-l border-[var(--border)] shadow-2xl flex flex-col"
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
                onClick={onClose}
                whileTap={{ scale: 0.85 }}
                className="w-8 h-8 rounded-full border border-[var(--border)] flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] transition"
              >
                <X className="w-4 h-4" />
              </motion.button>
            </div>

            {/* Nav links */}
            <nav className="flex-1 overflow-y-auto p-4 space-y-1">
              {navLinks.map((link, i) => {
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

  const [navLinks, setNavLinks] = useState(
    DEFAULT_NAV.map((n) => ({ to: n.to, label: n.fallback, icon: n.icon }))
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
          setNavLinks(
            DEFAULT_NAV.map((n) => ({
              to: n.to,
              label: settings?.[n.key] || n.fallback,
              icon: n.icon,
            }))
          );
        })
        .catch(() => { });
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
          <div className="flex items-center justify-between gap-3">
            <Link to="/" className="no-underline flex items-center gap-2.5">
              {ui.siteLogo ? (
                <motion.img
                  src={ui.siteLogo}
                  alt=""
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

            <nav className="hidden xl:flex items-center gap-2">
              {navLinks.map((link) => (
                <NavPill key={link.to} {...link} />
              ))}
              {isAdmin && <NavPill to="/admin" label={ui.adminZoneLabel || 'Админ'} icon={Settings} />}
            </nav>

            <div className="flex items-center gap-2 sm:gap-3">
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
              <div className="hidden md:block">
                <p className="text-sm font-semibold leading-tight">{user?.character_name || 'Без име'}</p>
                <div className="flex items-center gap-1.5">
                  <SubscriptionBadge planName={user?.plan_name} tierLevel={user?.tier_level} />
                  {expiryWarning && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--warning)]/15 text-[var(--warning)] border border-[var(--warning)]/30 font-bold">
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
                className="xl:hidden w-9 h-9 rounded-full border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition flex items-center justify-center"
                whileTap={{ scale: 0.85 }}
                aria-label="Меню"
              >
                <Menu className="w-4 h-4" />
              </motion.button>
            </div>
          </div>
        </div>

        {location.pathname.startsWith('/admin') && (
          <div className="max-w-7xl mx-auto px-4 pb-2 text-xs text-[var(--text-muted)]">{ui.adminZoneLabel}</div>
        )}
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
