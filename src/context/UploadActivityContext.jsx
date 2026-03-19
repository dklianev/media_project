import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { AnimatePresence, motion } from '@/lib/motion';
import { LoaderCircle, ShieldAlert } from 'lucide-react';

const UploadActivityContext = createContext(null);

export function UploadActivityProvider({ children }) {
  const [activeCount, setActiveCount] = useState(0);
  const [message, setMessage] = useState('Обработваме изображението...');

  const runWithUploadLock = useCallback(async (task, nextMessage = 'Обработваме изображението...') => {
    setMessage(nextMessage);
    setActiveCount((current) => current + 1);
    try {
      return await task();
    } finally {
      setActiveCount((current) => Math.max(0, current - 1));
    }
  }, []);

  const value = useMemo(() => ({
    isUploading: activeCount > 0,
    activeCount,
    message,
    runWithUploadLock,
  }), [activeCount, message, runWithUploadLock]);

  return (
    <UploadActivityContext.Provider value={value}>
      {children}
      <AnimatePresence>
        {activeCount > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[10000] flex items-center justify-center bg-[rgba(3,6,14,0.72)] backdrop-blur-md"
          >
            <motion.div
              initial={{ opacity: 0, y: 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              className="glass-card w-[min(92vw,420px)] px-6 py-5 text-center"
            >
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-[var(--accent-gold)]/35 bg-[var(--accent-gold)]/10 text-[var(--accent-gold-light)]">
                <LoaderCircle className="h-7 w-7 animate-spin" />
              </div>
              <h2 className="text-lg font-semibold mb-2">Изчакване на обработката</h2>
              <p className="text-sm text-[var(--text-secondary)]">{message}</p>
              <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-[var(--text-muted)]">
                <ShieldAlert className="h-3.5 w-3.5" />
                Бутоните са временно заключени, за да не тръгнат паралелни заявки.
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </UploadActivityContext.Provider>
  );
}

export function useUploadActivity() {
  const ctx = useContext(UploadActivityContext);
  if (!ctx) throw new Error('useUploadActivity must be used within UploadActivityProvider');
  return ctx;
}
