import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Suspense, lazy, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { ToastProvider } from './context/ToastContext';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import AnnouncementBanner from './components/AnnouncementBanner';
import ErrorBoundary from './components/ErrorBoundary';
import ScrollToTop from './components/ScrollToTop';
import MaintenancePage from './pages/MaintenancePage';
import { getPublicSettings } from './utils/settings';

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

// Admin pages
const AdminLayout = lazy(() => import('./pages/admin/AdminLayout'));
const Dashboard = lazy(() => import('./pages/admin/Dashboard'));
const ManageUsers = lazy(() => import('./pages/admin/ManageUsers'));
const ManagePlans = lazy(() => import('./pages/admin/ManagePlans'));
const ManageProductions = lazy(() => import('./pages/admin/ManageProductions'));
const ManageEpisodes = lazy(() => import('./pages/admin/ManageEpisodes'));
const ManagePromoCodes = lazy(() => import('./pages/admin/ManagePromoCodes'));
const ManagePayments = lazy(() => import('./pages/admin/ManagePayments'));
const ManageSettings = lazy(() => import('./pages/admin/ManageSettings'));
const ManageAuditLogs = lazy(() => import('./pages/admin/ManageAuditLogs'));

function PageLoader() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="w-10 h-10 border-[3px] border-[var(--accent-gold)] border-t-transparent rounded-full animate-spin" />
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

  useEffect(() => {
    let active = true;
    getPublicSettings()
      .then((settings) => {
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

        // Maintenance mode check
        if (settings?.maintenance_mode === 'true') {
          setMaintenance(settings.maintenance_message || '');
        }
      })
      .catch(() => {
        if (!active) return;
        document.title = 'Платформа';
      });
    return () => {
      active = false;
    };
  }, []);

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
        {!hideChrome && user && <AnnouncementBanner />}
        {!hideChrome && user && <Navbar />}
        {!hideChrome && user && <ScrollToTop />}

        <main className="flex-1 film-grain">
          <Suspense fallback={<PageLoader />}>
            <AnimatePresence mode="wait">
              <Routes location={location} key={location.pathname}>
                {/* Public */}
                <Route path="/login" element={<AnimatedPage><LoginPage /></AnimatedPage>} />
                <Route path="/auth/callback" element={<AuthCallback />} />
                <Route path="/character-name" element={<AnimatedPage><CharacterNamePage /></AnimatedPage>} />

                {/* Protected */}
                <Route path="/" element={<ProtectedRoute><AnimatedPage><HomePage /></AnimatedPage></ProtectedRoute>} />
                <Route path="/productions" element={<ProtectedRoute><AnimatedPage><ProductionsPage /></AnimatedPage></ProtectedRoute>} />
                <Route path="/productions/:slug" element={<ProtectedRoute><AnimatedPage><ProductionPage /></AnimatedPage></ProtectedRoute>} />
                <Route path="/episodes/:id" element={<ProtectedRoute><AnimatedPage><EpisodePage /></AnimatedPage></ProtectedRoute>} />
                <Route path="/subscribe" element={<ProtectedRoute><AnimatedPage><SubscribePage /></AnimatedPage></ProtectedRoute>} />
                <Route path="/profile" element={<ProtectedRoute><AnimatedPage><ProfilePage /></AnimatedPage></ProtectedRoute>} />
                <Route path="/live" element={<ProtectedRoute><AnimatedPage><LiveStreamPage /></AnimatedPage></ProtectedRoute>} />

                {/* Admin */}
                <Route path="/admin" element={<AdminRoute><AdminLayout /></AdminRoute>}>
                  <Route index element={<Dashboard />} />
                  <Route path="users" element={<ManageUsers />} />
                  <Route path="plans" element={<ManagePlans />} />
                  <Route path="productions" element={<ManageProductions />} />
                  <Route path="episodes" element={<ManageEpisodes />} />
                  <Route path="promo-codes" element={<ManagePromoCodes />} />
                  <Route path="payments" element={<ManagePayments />} />
                  <Route path="settings" element={<ManageSettings />} />
                  <Route path="audit" element={<ManageAuditLogs />} />
                </Route>

                {/* Fallback */}
                <Route path="*" element={<AnimatedPage><NotFoundPage /></AnimatedPage>} />
              </Routes>
            </AnimatePresence>
          </Suspense>
        </main>
        {!hideChrome && user && <Footer />}
      </ToastProvider>
    </ErrorBoundary>
  );
}
