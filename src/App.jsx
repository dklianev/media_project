import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from '@/lib/motion';
import { useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { UploadActivityProvider } from './context/UploadActivityContext';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import AnnouncementBanner from './components/AnnouncementBanner';
import ErrorBoundary from './components/ErrorBoundary';
import ScrollToTop from './components/ScrollToTop';
import MaintenancePage from './pages/MaintenancePage';
import { getPublicSettings, subscribeToPublicSettingsUpdates } from './utils/settings';

// ─── Lazy-loaded pages ───
const LoginPage = lazy(() => import('./pages/LoginPage'));
const AuthCallback = lazy(() => import('./pages/AuthCallback'));
const CharacterNamePage = lazy(() => import('./pages/CharacterNamePage'));
const HomePage = lazy(() => import('./pages/HomePage'));
const ProductionsPage = lazy(() => import('./pages/ProductionsPage'));
const ProductionPage = lazy(() => import('./pages/ProductionPage'));
const EpisodePage = lazy(() => import('./pages/EpisodePage'));
const SubscribePage = lazy(() => import('./pages/SubscribePage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));
const LiveStreamPage = lazy(() => import('./pages/LiveStreamPage'));
const FAQPage = lazy(() => import('./pages/FAQPage'));
const CalendarPage = lazy(() => import('./pages/CalendarPage'));
const TicketPage = lazy(() => import('./pages/TicketPage'));
const MyPurchasesPage = lazy(() => import('./pages/MyPurchasesPage'));
const GiftsPage = lazy(() => import('./pages/GiftsPage'));
const WishlistPage = lazy(() => import('./pages/WishlistPage'));
const ReferralsPage = lazy(() => import('./pages/ReferralsPage'));
const WatchPartyPage = lazy(() => import('./pages/WatchPartyPage'));

// Admin pages
const AdminLayout = lazy(() => import('./pages/admin/AdminLayout'));
const Dashboard = lazy(() => import('./pages/admin/Dashboard'));
const ManageComments = lazy(() => import('./pages/admin/ManageComments'));
const ManageUsers = lazy(() => import('./pages/admin/ManageUsers'));
const ManagePlans = lazy(() => import('./pages/admin/ManagePlans'));
const ManageProductions = lazy(() => import('./pages/admin/ManageProductions'));
const ManageEpisodes = lazy(() => import('./pages/admin/ManageEpisodes'));
const ManagePromoCodes = lazy(() => import('./pages/admin/ManagePromoCodes'));
const ManagePayments = lazy(() => import('./pages/admin/ManagePayments'));
const ManageContentPurchases = lazy(() => import('./pages/admin/ManageContentPurchases'));
const ManageSettings = lazy(() => import('./pages/admin/ManageSettings'));
const ManageAuditLogs = lazy(() => import('./pages/admin/ManageAuditLogs'));
const ManageSupport = lazy(() => import('./pages/admin/ManageSupport'));
const ManageMediaLibrary = lazy(() => import('./pages/admin/ManageMediaLibrary'));
const ManagePromotions = lazy(() => import('./pages/admin/ManagePromotions'));
const ManageBundles = lazy(() => import('./pages/admin/ManageBundles'));
const ManageWatchParties = lazy(() => import('./pages/admin/ManageWatchParties'));

import { Crown } from 'lucide-react';

function PageLoader() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4">
      <div className="relative flex items-center justify-center">
        {/* Outer rotating ring */}
        <div className="absolute inset-x-[-12px] inset-y-[-12px] rounded-full border border-[var(--accent-gold)]/30 border-t-[var(--accent-gold)] animate-spin" />
        {/* Inner static icon with pulse */}
        <motion.div
          animate={{ scale: [0.95, 1.05, 0.95], opacity: [0.7, 1, 0.7] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          className="w-12 h-12 rounded-full bg-[var(--bg-secondary)] flex items-center justify-center shadow-[0_0_20px_rgba(212,175,55,0.15)]"
        >
          <Crown className="w-6 h-6 text-[var(--accent-gold)]" />
        </motion.div>
      </div>
      <p className="text-sm font-medium text-[var(--text-muted)] tracking-widest uppercase animate-pulse">Зареждане на съдържание...</p>
    </div>
  );
}

function AnimatedPage({ children }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.992, filter: 'blur(8px)' }}
      animate={{
        opacity: 1,
        y: 0,
        scale: 1,
        filter: 'blur(0px)',
        transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] },
      }}
      exit={{
        opacity: 0,
        y: -8,
        scale: 0.998,
        filter: 'blur(6px)',
        transition: { duration: 0.3, ease: [0.4, 0, 1, 1] },
      }}
      onAnimationStart={(def) => {
        if (def === 'animate' || (def && def.opacity === 1)) {
          window.scrollTo({ top: 0, behavior: 'auto' });
        }
      }}
    >
      {children}
    </motion.div>
  );
}

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <PageLoader />;
  if (!user) return <Navigate to="/login" replace />;
  if (!user.character_name) return <Navigate to="/character-name" replace />;
  return children;
}

function AdminRoute({ children }) {
  const { user, loading, isAdmin } = useAuth();
  if (loading) return <PageLoader />;
  if (!user) return <Navigate to="/login" replace />;
  if (!isAdmin) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  const location = useLocation();
  const { user, isAdmin } = useAuth();
  const hideChrome = ['/login', '/auth/callback', '/character-name'].includes(location.pathname);
  const [maintenance, setMaintenance] = useState(null);
  const chromeRef = useRef(null);

  useEffect(() => {
    let active = true;
    const applySettings = (settings) => {
      if (!active) return;
      document.title = settings?.site_name || 'Платформа';

      // Dynamic favicon
      if (settings?.site_favicon) {
        let link = document.querySelector("link[rel~='icon']");
        if (!link) {
          link = document.createElement('link');
          link.rel = 'icon';
          document.head.appendChild(link);
        }
        link.href = settings.site_favicon;
      }

      setMaintenance(settings?.maintenance_mode === 'true' ? (settings.maintenance_message || '') : null);
    };

    const loadSettings = (force = false) => {
      getPublicSettings(force)
        .then((settings) => {
          applySettings(settings);
        })
        .catch(() => {
          if (!active) return;
          document.title = 'Платформа';
          setMaintenance(null);
        });
    };

    loadSettings();
    const unsubscribe = subscribeToPublicSettingsUpdates(() => {
      loadSettings(true);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    const root = document.documentElement;

    if (hideChrome || !user || !chromeRef.current) {
      root.style.setProperty('--app-chrome-offset', '0px');
      return undefined;
    }

    const updateChromeOffset = () => {
      const rect = chromeRef.current?.getBoundingClientRect();
      root.style.setProperty('--app-chrome-offset', `${Math.max(0, Math.round(rect?.height || 0))}px`);
    };

    updateChromeOffset();

    const resizeObserver = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => updateChromeOffset())
      : null;

    if (resizeObserver && chromeRef.current) {
      resizeObserver.observe(chromeRef.current);
    }

    window.addEventListener('resize', updateChromeOffset, { passive: true });

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener('resize', updateChromeOffset);
      root.style.setProperty('--app-chrome-offset', '0px');
    };
  }, [hideChrome, location.pathname, user]);

  // Show maintenance page for non-admin users
  if (maintenance !== null && !isAdmin) {
    return (
      <ErrorBoundary>
        <MaintenancePage message={maintenance} />
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <ToastProvider>
        <UploadActivityProvider>
          <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[9999] focus:px-4 focus:py-2 focus:bg-[var(--accent-gold)] focus:text-black focus:rounded-lg focus:text-sm focus:font-semibold">
            Към основното съдържание
          </a>
          {!hideChrome && user && (
            <div ref={chromeRef}>
              <AnnouncementBanner />
              <Navbar />
            </div>
          )}
          {!hideChrome && user && <ScrollToTop />}

          <main id="main-content" className="flex-1 film-grain">
            <Suspense fallback={<PageLoader />}>
              <AnimatePresence mode="wait">
                <Routes location={location} key={location.pathname}>
                {/* Public */}
                <Route path="/login" element={<AnimatedPage><LoginPage /></AnimatedPage>} />
                <Route path="/auth/callback" element={<AuthCallback />} />
                <Route path="/character-name" element={<AnimatedPage><CharacterNamePage /></AnimatedPage>} />
                <Route path="/faq" element={<AnimatedPage><FAQPage /></AnimatedPage>} />
                <Route path="/calendar" element={<ProtectedRoute><AnimatedPage><CalendarPage /></AnimatedPage></ProtectedRoute>} />

                {/* Protected */}
                <Route path="/" element={<ProtectedRoute><AnimatedPage><HomePage /></AnimatedPage></ProtectedRoute>} />
                <Route path="/productions" element={<ProtectedRoute><AnimatedPage><ProductionsPage /></AnimatedPage></ProtectedRoute>} />
                <Route path="/productions/:slug" element={<ProtectedRoute><AnimatedPage><ProductionPage /></AnimatedPage></ProtectedRoute>} />
                <Route path="/episodes/:id" element={<ProtectedRoute><AnimatedPage><EpisodePage /></AnimatedPage></ProtectedRoute>} />
                <Route path="/subscribe" element={<ProtectedRoute><AnimatedPage><SubscribePage /></AnimatedPage></ProtectedRoute>} />
                <Route path="/profile" element={<ProtectedRoute><AnimatedPage><ProfilePage /></AnimatedPage></ProtectedRoute>} />
                <Route path="/live" element={<ProtectedRoute><AnimatedPage><LiveStreamPage /></AnimatedPage></ProtectedRoute>} />
                <Route path="/support/:id" element={<ProtectedRoute><AnimatedPage><TicketPage /></AnimatedPage></ProtectedRoute>} />
                <Route path="/my-purchases" element={<ProtectedRoute><AnimatedPage><MyPurchasesPage /></AnimatedPage></ProtectedRoute>} />
                <Route path="/gifts" element={<ProtectedRoute><AnimatedPage><GiftsPage /></AnimatedPage></ProtectedRoute>} />
                <Route path="/wishlist" element={<ProtectedRoute><AnimatedPage><WishlistPage /></AnimatedPage></ProtectedRoute>} />
                <Route path="/referrals" element={<ProtectedRoute><AnimatedPage><ReferralsPage /></AnimatedPage></ProtectedRoute>} />
                <Route path="/watch-party" element={<ProtectedRoute><AnimatedPage><WatchPartyPage /></AnimatedPage></ProtectedRoute>} />

                {/* Admin */}
                <Route path="/admin" element={<AdminRoute><AdminLayout /></AdminRoute>}>
                  <Route index element={<Dashboard />} />
                  <Route path="users" element={<ManageUsers />} />
                  <Route path="comments" element={<ManageComments />} />
                  <Route path="plans" element={<ManagePlans />} />
                  <Route path="productions" element={<ManageProductions />} />
                  <Route path="episodes" element={<ManageEpisodes />} />
                  <Route path="promo-codes" element={<ManagePromoCodes />} />
                  <Route path="payments" element={<ManagePayments />} />
                  <Route path="content-purchases" element={<ManageContentPurchases />} />
                  <Route path="media" element={<ManageMediaLibrary />} />
                  <Route path="settings" element={<ManageSettings />} />
                  <Route path="audit" element={<ManageAuditLogs />} />
                  <Route path="support" element={<ManageSupport />} />
                  <Route path="promotions" element={<ManagePromotions />} />
                  <Route path="bundles" element={<ManageBundles />} />
                  <Route path="watch-parties" element={<ManageWatchParties />} />
                </Route>

                {/* Fallback */}
                <Route path="*" element={<AnimatedPage><NotFoundPage /></AnimatedPage>} />
                </Routes>
              </AnimatePresence>
            </Suspense>
          </main>
          {!hideChrome && user && <Footer />}
        </UploadActivityProvider>
      </ToastProvider>
    </ErrorBoundary>
  );
}
