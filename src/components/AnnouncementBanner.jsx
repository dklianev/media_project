import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Info, AlertTriangle, CheckCircle2, X } from 'lucide-react';
import { getPublicSettings, subscribeToPublicSettingsUpdates } from '../utils/settings';

const TYPE_CONFIG = {
  info: {
    icon: Info,
    bg: 'bg-[var(--accent-cyan)]/10',
    border: 'border-[var(--accent-cyan)]/30',
    text: 'text-[var(--accent-cyan)]',
    iconColor: 'text-[var(--accent-cyan)]',
  },
  warning: {
    icon: AlertTriangle,
    bg: 'bg-[var(--warning)]/10',
    border: 'border-[var(--warning)]/30',
    text: 'text-[var(--warning)]',
    iconColor: 'text-[var(--warning)]',
  },
  success: {
    icon: CheckCircle2,
    bg: 'bg-[var(--success)]/10',
    border: 'border-[var(--success)]/30',
    text: 'text-[var(--success)]',
    iconColor: 'text-[var(--success)]',
  },
};

function hashStr(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return String(h);
}

export default function AnnouncementBanner() {
  const [banner, setBanner] = useState(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const loadBanner = (force = false) => {
      getPublicSettings(force)
        .then((s) => {
          setBanner(null);
          setDismissed(false);

          if (s?.announcement_enabled !== 'true' || !s?.announcement_text?.trim()) return;
          const text = s.announcement_text.trim();
          const type = s.announcement_type || 'info';
          const key = `announcement_dismissed_${hashStr(text)}`;
          if (sessionStorage.getItem(key) === '1') return;
          setBanner({ text, type, dismissKey: key });
        })
        .catch(() => {});
    };

    loadBanner();
    const unsubscribe = subscribeToPublicSettingsUpdates(() => {
      loadBanner(true);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const handleDismiss = () => {
    if (banner?.dismissKey) {
      sessionStorage.setItem(banner.dismissKey, '1');
    }
    setDismissed(true);
  };

  const show = banner && !dismissed;
  const config = show ? (TYPE_CONFIG[banner.type] || TYPE_CONFIG.info) : null;
  const Icon = config?.icon;

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="overflow-hidden"
        >
          <div className={`${config.bg} ${config.border} border-b px-4 py-2.5`}>
            <div className="max-w-7xl mx-auto flex items-center gap-3">
              <Icon className={`w-4 h-4 shrink-0 ${config.iconColor}`} aria-hidden="true" />
              <p className={`text-sm font-medium flex-1 ${config.text}`}>
                {banner.text}
              </p>
              <button
                onClick={handleDismiss}
                className="shrink-0 p-1 rounded-full hover:bg-white/10 transition-colors"
                aria-label="Затвори известието"
              >
                <X className="w-4 h-4 text-[var(--text-muted)]" aria-hidden="true" />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
