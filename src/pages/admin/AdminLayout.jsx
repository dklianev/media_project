import { Link, Outlet, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  CreditCard,
  Film,
  History,
  LayoutDashboard,
  MessageSquare,
  Settings,
  ShieldCheck,
  Tags,
  Ticket,
  Tv,
  Users,
  Headphones,
} from 'lucide-react';
import PageBackground from '../../components/PageBackground';

const sidebarLinks = [
  { to: '/admin', icon: LayoutDashboard, label: 'Табло', exact: true },
  { to: '/admin/payments', icon: CreditCard, label: 'Плащания' },
  { to: '/admin/users', icon: Users, label: 'Потребители' },
  { to: '/admin/comments', icon: MessageSquare, label: 'Коментари' },
  { to: '/admin/productions', icon: Film, label: 'Продукции' },
  { to: '/admin/episodes', icon: Tv, label: 'Епизоди' },
  { to: '/admin/plans', icon: Tags, label: 'Планове' },
  { to: '/admin/promo-codes', icon: Ticket, label: 'Промо кодове' },
  { to: '/admin/audit', icon: History, label: 'Одит лог' },
  { to: '/admin/support', icon: Headphones, label: 'Запитвания' },
  { to: '/admin/settings', icon: Settings, label: 'Настройки' },
];

const ease = [0.16, 1, 0.3, 1];

export default function AdminLayout() {
  const location = useLocation();

  const isActive = (link) => {
    if (link.exact) return location.pathname === link.to;
    return location.pathname.startsWith(link.to);
  };

  return (
    <div className="relative min-h-[calc(100vh-72px)] max-w-[1700px] mx-auto px-3 sm:px-4 py-4 sm:py-6 overflow-hidden">
      <PageBackground />
      <div className="relative grid grid-cols-1 xl:grid-cols-[270px_1fr] gap-4">
        <motion.aside
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4, ease }}
          className="premium-panel p-4 h-fit xl:sticky xl:top-24"
        >
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] no-underline mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            Към платформата
          </Link>

          <div className="mb-4">
            <div className="pill-chip mb-3 w-fit">
              <ShieldCheck className="w-3.5 h-3.5" />
              Админ зона
            </div>
            <h2 className="text-lg font-semibold text-[var(--accent-gold-light)]">Админ панел</h2>
            <p className="text-xs text-[var(--text-muted)] mt-1">Управление на съдържание и абонаменти</p>
          </div>

          <nav className="hidden xl:flex flex-col gap-1.5">
            {sidebarLinks.map((link, index) => {
              const Icon = link.icon;
              const active = isActive(link);
              return (
                <motion.div
                  key={link.to}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.05 + index * 0.03, duration: 0.3, ease }}
                >
                  <Link
                    to={link.to}
                    className={`no-underline flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all ${active
                      ? 'border border-[var(--border-light)] bg-[linear-gradient(135deg,rgba(212,175,55,0.16),rgba(75,197,255,0.1))] text-[var(--text-primary)] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]'
                      : 'text-[var(--text-secondary)] border border-transparent hover:text-[var(--text-primary)] hover:bg-white/5 hover:translate-x-1'
                      }`}
                  >
                    <Icon className="w-4 h-4" />
                    {link.label}
                  </Link>
                </motion.div>
              );
            })}
          </nav>

          <nav className="xl:hidden mt-2 flex gap-2 overflow-x-auto pb-1">
            {sidebarLinks.map((link) => {
              const Icon = link.icon;
              const active = isActive(link);
              return (
                <Link
                  key={link.to}
                  to={link.to}
                  className={`no-underline inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-semibold whitespace-nowrap ${active
                    ? 'bg-[var(--accent-gold)]/18 text-[var(--accent-gold-light)] border border-[var(--accent-gold)]/38'
                    : 'text-[var(--text-secondary)] border border-[var(--border)]'
                    }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </motion.aside>

        <main className="min-w-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
