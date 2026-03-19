import { Wrench } from 'lucide-react';
import { motion } from '@/lib/motion';
import PageBackground from '../components/PageBackground';

export default function MaintenancePage({ message }) {
  return (
    <div className="relative min-h-screen flex items-center justify-center px-4 overflow-hidden">
      <PageBackground />
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="relative glass-card p-8 sm:p-12 max-w-lg w-full text-center"
      >
        <motion.div
          className="w-20 h-20 rounded-2xl bg-[var(--accent-gold)]/15 border border-[var(--accent-gold)]/30 flex items-center justify-center mx-auto mb-6"
          animate={{ rotate: [0, -10, 10, -5, 0] }}
          transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
        >
          <Wrench className="w-10 h-10 text-[var(--accent-gold-light)]" aria-hidden="true" />
        </motion.div>
        <h1 className="text-2xl sm:text-3xl font-bold mb-3">Поддръжка</h1>
        <p className="text-[var(--text-secondary)] text-base leading-relaxed">
          {message || 'Платформата е в режим на поддръжка. Моля, опитайте по-късно.'}
        </p>
        <div className="mt-8 h-1 w-24 mx-auto rounded-full bg-gradient-to-r from-[var(--accent-gold)]/60 via-[var(--accent-cyan)]/40 to-[var(--accent-gold)]/60" />
      </motion.div>
    </div>
  );
}
