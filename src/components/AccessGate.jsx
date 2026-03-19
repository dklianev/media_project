import { Link } from '@/components/AppLink';
import { Lock, Crown } from 'lucide-react';
import { motion } from '@/lib/motion';

const GROUP_LABELS = {
  free: 'Безплатен',
  trailer: 'Трейлър',
  subscription: 'С абонамент',
};

const ease = [0.16, 1, 0.3, 1];

export default function AccessGate({ requiredTier, requiredGroup }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5, ease }}
      className="min-h-[60vh] flex items-center justify-center px-4"
    >
      <div className="glass-card p-10 text-center max-w-md w-full shadow-premium-lg">
        <motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.15, type: 'spring', stiffness: 300, damping: 20 }}
          className="w-20 h-20 mx-auto mb-6 rounded-full bg-[var(--bg-tertiary)] flex items-center justify-center border-glow"
        >
          <Lock className="w-10 h-10 text-[var(--accent-gold)]" />
        </motion.div>

        <motion.h2
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25, duration: 0.4, ease }}
          className="text-2xl font-bold mb-3"
        >
          Нямаш достъп
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.4, ease }}
          className="text-[var(--text-secondary)] mb-6"
        >
          Нямаш достъп до тази страница. Моля, провери дали имаш необходимия абонамент.
        </motion.p>
        {(requiredGroup || requiredTier !== undefined) && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.35, duration: 0.3 }}
            className="text-xs text-[var(--text-muted)] mb-6 space-y-1"
          >
            {requiredGroup && <p>Категория достъп: {GROUP_LABELS[requiredGroup] || requiredGroup}</p>}
            {requiredTier !== undefined && requiredTier !== null && requiredGroup === 'subscription' && (
              <p>Необходимо ниво: {requiredTier}</p>
            )}
          </motion.div>
        )}

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.4, ease }}
          className="flex flex-col gap-3"
        >
          <Link to="/subscribe" className="btn-gold inline-flex items-center justify-center gap-2 no-underline">
            <Crown className="w-4 h-4" />
            Виж абонаментите
          </Link>
          <Link to="/profile" className="btn-outline inline-flex items-center justify-center gap-2 no-underline">
            Към профила
          </Link>
        </motion.div>
      </div>
    </motion.div>
  );
}
