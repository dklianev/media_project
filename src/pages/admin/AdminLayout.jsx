import { Outlet, useLocation } from 'react-router-dom';
import { Link } from '@/components/AppLink';
import { motion } from '@/lib/motion';
import {
  ArrowLeft,
  CreditCard,
  Film,
  Headphones,
  History,
  Images,
  LayoutDashboard,
  MessageSquare,
  MonitorPlay,
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
    title: 'Общо',
    links: [
      { to: '/admin', icon: LayoutDashboard, label: 'Табло', exact: true },
    ],
  },
  {
    title: 'Съдържание',
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
      { to: '/admin/watch-parties', icon: MonitorPlay, label: 'Watch Parties' },
    ],
  },
  {
    title: 'Търговия',
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
      { to: '/admin/audit', icon: History, label: 'Audit лог' },
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
    <div className="relative mx-auto min-h-[calc(100vh-72px)] max-w-[1700px] overflow-hidden px-3 py-4 sm:px-4 sm:py-6">
      <PageBackground />
      <div className="relative grid grid-cols-1 gap-4 xl:grid-cols-[270px_1fr]">
        <motion.aside
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4, ease }}
          className="premium-panel h-fit p-4 xl:sticky"
          style={{ top: 'calc(var(--app-chrome-offset, 72px) + 1rem)' }}
        >
          <Link
            to="/"
            className="mb-4 inline-flex items-center gap-2 text-sm text-[var(--text-secondary)] no-underline hover:text-[var(--text-primary)]"
          >
            <ArrowLeft className="h-4 w-4" />
            Към платформата
          </Link>

          <div className="mb-4">
            <div className="pill-chip mb-3 w-fit">
              <ShieldCheck className="h-3.5 w-3.5" />
              Admin Panel
            </div>
            <h2 className="text-lg font-semibold text-[var(--accent-gold-light)]">Администрация</h2>
            <p className="mt-1 text-xs text-[var(--text-muted)]">Управление, контрол и модерация</p>
          </div>

          <nav className="mt-4 hidden flex-col gap-5 xl:flex">
            {linkGroups.map((group) => (
              <div key={group.title}>
                <p className="mb-2 mt-1 px-3 text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
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
                          className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium no-underline transition-all ${
                            active
                              ? 'border border-[var(--border-light)] bg-[linear-gradient(135deg,var(--accent-gold-light)_0%,var(--accent-gold)_100%)]/10 text-[var(--accent-gold-light)] shadow-sm'
                              : 'border border-transparent text-[var(--text-secondary)] hover:translate-x-1 hover:bg-white/5 hover:text-[var(--text-primary)]'
                          }`}
                        >
                          <Icon className={`h-4 w-4 ${active ? 'text-[var(--accent-gold-light)]' : ''}`} />
                          {link.label}
                        </Link>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>

          <div className="relative mt-3 xl:hidden">
            <div className="pointer-events-none absolute bottom-0 right-0 top-0 z-10 w-8 rounded-r-2xl bg-gradient-to-l from-[var(--bg-secondary)] to-transparent" />
            <nav className="custom-scrollbar flex snap-x snap-mandatory gap-2 overflow-x-auto pb-2 pr-6">
              {allLinks.map((link) => {
                const Icon = link.icon;
                const active = isActive(link);
                return (
                  <Link
                    key={link.to}
                    to={link.to}
                    className={`inline-flex snap-start items-center gap-1.5 whitespace-nowrap rounded-xl px-3.5 py-2 text-[13px] font-medium no-underline transition-colors ${
                      active
                        ? 'border border-[var(--accent-gold)]/30 bg-[var(--accent-gold)]/10 text-[var(--accent-gold-light)]'
                        : 'border border-[var(--border)] bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    <Icon className={`h-3.5 w-3.5 ${active ? 'text-[var(--accent-gold)]' : 'text-[var(--text-muted)]'}`} />
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
