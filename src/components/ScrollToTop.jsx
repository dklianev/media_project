import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from '@/lib/motion';
import { ArrowUp } from 'lucide-react';

export default function ScrollToTop() {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const handler = () => setVisible(window.scrollY > 400);
        window.addEventListener('scroll', handler, { passive: true });
        return () => window.removeEventListener('scroll', handler);
    }, []);

    return (
        <AnimatePresence>
            {visible && (
                <motion.button
                    initial={{ opacity: 0, scale: 0.5, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.5, y: 20 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                    onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                    className="fixed bottom-6 right-6 z-50 w-12 h-12 rounded-full bg-[var(--accent-gold)]/20 border border-[var(--accent-gold)]/40 backdrop-blur-md flex items-center justify-center text-[var(--accent-gold-light)] hover:bg-[var(--accent-gold)]/35 hover:border-[var(--accent-gold)]/60 hover:shadow-[0_0_20px_rgba(212,175,55,0.25)] transition-all duration-300 cursor-pointer focus-visible:ring-2 focus-visible:ring-[var(--accent-gold)] focus:outline-none"
                    aria-label="Превърти нагоре"
                >
                    <ArrowUp className="w-5 h-5" />
                </motion.button>
            )}
        </AnimatePresence>
    );
}
