import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Crown, Film, Heart, Home, Sparkles, HelpCircle } from 'lucide-react';
import { getPublicSettings, subscribeToPublicSettingsUpdates } from '../utils/settings';

const footerLinks = [
  { to: '/', label: 'Начало', icon: Home },
  { to: '/productions', label: 'Каталог', icon: Film },
  { to: '/subscribe', label: 'Абонаменти', icon: Crown },
  { to: '/faq', label: 'ЧЗВ', icon: HelpCircle },
];

const ease = [0.16, 1, 0.3, 1];

export default function Footer() {
  const [settings, setSettings] = useState({});

  useEffect(() => {
    const loadSettings = (force = false) => {
      getPublicSettings(force).then(setSettings).catch(() => setSettings({}));
    };

    loadSettings();
    const unsubscribe = subscribeToPublicSettingsUpdates(() => {
      loadSettings(true);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  return (
    <motion.footer
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.5, ease }}
      className="relative mt-10 border-t border-[var(--border)]/70 bg-[color:var(--glass)]/70 backdrop-blur-xl shadow-premium-sm"
    >
      {/* Top gradient accent line */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[var(--accent-gold)]/30 to-transparent" />

      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-6">
          {/* Brand */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.05, duration: 0.4, ease }}
          >
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-4 h-4 text-[var(--accent-gold-light)]" />
              <p className="font-semibold text-sm">{settings.site_name || 'Платформа'}</p>
            </div>
            <p className="text-xs text-[var(--text-muted)] max-w-[260px]">
              {settings.site_tagline || 'Твоята стрийминг платформа за реалити формати.'}
            </p>
          </motion.div>

          {/* Navigation */}
          <motion.nav
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1, duration: 0.4, ease }}
            className="flex flex-col gap-1.5"
          >
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-muted)] mb-1">Навигация</p>
            {footerLinks.map((link) => {
              const Icon = link.icon;
              return (
                <Link
                  key={link.to}
                  to={link.to}
                  className="inline-flex items-center gap-2 text-sm text-[var(--text-secondary)] hover:text-[var(--accent-gold-light)] transition-colors no-underline"
                >
                  <Icon className="w-3.5 h-3.5" />
                  {link.label}
                </Link>
              );
            })}
          </motion.nav>

          {/* Info */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.15, duration: 0.4, ease }}
            className="flex flex-col gap-1.5"
          >
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-muted)] mb-1">Информация</p>
            <p className="text-xs text-[var(--text-secondary)]">
              {settings.footer_note || 'Всички права запазени.'}
            </p>
            <p className="text-xs text-[var(--text-muted)] inline-flex items-center gap-1 mt-1">
              Направено с <Heart className="w-3 h-3 text-[var(--accent-crimson)]" /> {settings.footer_made_with || 'за общността'}
            </p>
          </motion.div>
        </div>

        {/* Bottom bar */}
        <div className="pt-4 border-t border-[var(--border)]/50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <p className="text-xs text-[var(--text-muted)]">
            © {new Date().getFullYear()} {settings.site_name || 'Платформа'}
          </p>
          <p className="text-[10px] text-[var(--text-muted)]/70 uppercase tracking-widest">
            {settings.footer_premium_experience || 'Premium Streaming Experience'}
          </p>
        </div>
      </div>
    </motion.footer>
  );
}
