import { useCallback } from 'react';
import { motion } from 'framer-motion';

export default function VideoPlayer({ embedUrl, title, siteName = 'Платформа' }) {
  if (!embedUrl) return null;

  const handleContextMenu = useCallback((event) => {
    event.preventDefault();
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="relative w-full overflow-hidden rounded-2xl border border-[var(--border)] bg-black shadow-premium-md hover:border-[var(--accent-gold)]/25 transition-[border-color] duration-500"
      style={{ paddingBottom: '56.25%' }}
      onContextMenu={handleContextMenu}
    >
      <iframe
        className="absolute inset-0 w-full h-full"
        src={embedUrl}
        title={title || 'Видео'}
        frameBorder="0"
        sandbox="allow-scripts allow-same-origin allow-presentation"
        allow="autoplay; encrypted-media; picture-in-picture"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
      />

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 p-3 bg-gradient-to-t from-black/65 to-transparent">
        <p className="text-xs uppercase tracking-[0.22em] text-white/55">{siteName}</p>
      </div>
    </motion.div>
  );
}
