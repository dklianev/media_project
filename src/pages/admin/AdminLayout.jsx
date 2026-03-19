import { Link, Outlet, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  CreditCard,
  Film,
  Gift,
  Headphones,
  History,
  Images,
  LayoutDashboard,
  MessageSquare,
  Package,
  Percent,
  Settings,
  ShieldCheck,
  Tags,
  Ticket,
  Tv,
  Users,
} from 'lucide-react';
import PageBackground from '../../components/PageBackground';

const linkGroups = [
  {
    title: 'Обзор',
    links: [
      { to: '/admin', icon: LayoutDashboard, label: 'Табло', exact: true },
    ],
  },
  {
    title: 'Каталог',
    links: [
      { to: '/admin/productions', icon: Film, label: 'Продукции' },
      { to: '/admin/episodes', icon: Tv, label: 'Епизоди' },
      { to: '/admin/media', icon: Images, label: 'Media Library' },
    ],
  },
  {
    title: 'Общност',
    links: [
      { to: '/admin/users', icon: Users, label: 'Потребители' },
      { to: '/admin/comments', icon: MessageSquare, label: 'Коментари' },
      { to: '/admin/support', icon: Headphones, label: 'Поддръжка' },
    ],
  },
  {
    title: 'Монетизация',
    links: [
      { to: '/admin/plans', icon: Tags, label: 'Планове' },
      { to: '/admin/promo-codes', icon: Ticket, label: 'Промо кодове' },
      { to: '/admin/payments', icon: CreditCard, label: 'Плащания' },
      { to: '/admin/content-purchases', icon: CreditCard, label: 'Content Purchases' },
      { to: '/admin/promotions', icon: Percent, label: 'Промоции' },
      { to: '/admin/bundles', icon: Package, label: 'Пакети' },
    ],
  },
  {
    title: 'Система',
    links: [
      { to: '/admin/audit', icon: History, label: 'Одит лог' },
      { to: '/admin/settings', icon: Settings, label: 'Настройки' },
    ],
  },
];

const allLinks = linkGroups.flatMap((group) => group.links);
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
          className="premium-panel p-4 h-fit xl:sticky"
          style={{ top: 'calc(var(--app-chrome-offset, 72px) + 1rem)' }}
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
              Admin Panel
            </div>
            <h2 className="text-lg font-semibold text-[var(--accent-gold-light)]">Управление</h2>
            <p className="text-xs text-[var(--text-muted)] mt-1">Съдържание, покупки и настройки</p>
          </div>

          <nav className="hidden xl:flex flex-col gap-5 mt-4">
            {linkGroups.map((group) => (
              <div key={group.title}>
                <p className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] mt-1 mb-2 px-3 font-semibold">
                  {group.title}
                </p>
                <div className="flex flex-col gap-1.5">
                  {group.links.map((link, index) => {
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
                          className={`no-underline flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium transition-all ${
                            active
                              ? 'border border-[var(--border-light)] bg-[linear-gradient(135deg,var(--accent-gold-light)_0%,var(--accent-gold)_100%)]/10 text-[var(--accent-gold-light)] shadow-sm'
                              : 'text-[var(--text-secondary)] border border-transparent hover:text-[var(--text-primary)] hover:bg-white/5 hover:translate-x-1'
                          }`}
                        >
                          <Icon className={`w-4 h-4 ${active ? 'text-[var(--accent-gold-light)]' : ''}`} />
                          {link.label}
                        </Link>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>

          <div className="xl:hidden mt-3 relative">
            <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-[var(--bg-secondary)] to-transparent pointer-events-none z-10 rounded-r-2xl" />
            <nav className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar snap-x snap-mandatory pr-6">
              {allLinks.map((link) => {
                const Icon = link.icon;
                const active = isActive(link);
                return (
                  <Link
                    key={link.to}
                    to={link.to}
                    className={`snap-start no-underline inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-[13px] font-medium whitespace-nowrap transition-colors ${
                      active
                        ? 'bg-[var(--accent-gold)]/10 text-[var(--accent-gold-light)] border border-[var(--accent-gold)]/30'
                        : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border border-[var(--border)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    <Icon className={`w-3.5 h-3.5 ${active ? 'text-[var(--accent-gold)]' : 'text-[var(--text-muted)]'}`} />
                    {link.label}
                  </Link>
                );
              })}
            </nav>
          </div>
        </motion.aside>

        <main className="min-w-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
