import { Link } from '@/components/AppLink';
import { motion } from '@/lib/motion';
import { Ghost } from 'lucide-react';
import PageBackground from '../components/PageBackground';

export default function NotFoundPage() {
    return (
        <div className="relative min-h-screen flex items-center justify-center pb-12">
            <PageBackground />
            <motion.div
                initial={{ opacity: 0, y: 20, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                className="relative text-center max-w-lg mx-auto px-6"
            >
                <motion.div
                    animate={{ y: [0, -10, 0] }}
                    transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                    className="mx-auto mb-6 w-24 h-24 rounded-2xl bg-gradient-to-br from-[var(--accent-gold)]/20 to-[var(--accent-cyan)]/15 border border-[var(--border)] flex items-center justify-center"
                >
                    <Ghost className="w-12 h-12 text-[var(--accent-gold)]" />
                </motion.div>

                <h1 className="font-display text-6xl sm:text-7xl text-gradient-premium mb-4">404</h1>
                <p className="text-xl font-semibold text-[var(--text-primary)] mb-2">
                    Страницата не е намерена
                </p>
                <p className="text-[var(--text-secondary)] mb-8">
                    Адресът, който търсиш, не съществува или е бил преместен.
                </p>

                <div className="flex flex-wrap justify-center gap-3">
                    <Link to="/" className="btn-gold no-underline inline-flex items-center gap-2">
                        Към началната страница
                    </Link>
                    <button
                        onClick={() => window.history.back()}
                        className="btn-outline inline-flex items-center gap-2"
                    >
                        Назад
                    </button>
                </div>
            </motion.div>
        </div>
    );
}
