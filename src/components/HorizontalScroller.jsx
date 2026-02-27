import { useRef, useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function HorizontalScroller({ title, seeAllLink, children }) {
  const scrollRef = useRef(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    checkScroll();
    el.addEventListener('scroll', checkScroll, { passive: true });
    const ro = new ResizeObserver(checkScroll);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', checkScroll);
      ro.disconnect();
    };
  }, [checkScroll]);

  const scroll = (direction) => {
    const el = scrollRef.current;
    if (!el) return;
    const amount = el.clientWidth * 0.75;
    el.scrollBy({ left: direction === 'left' ? -amount : amount, behavior: 'smooth' });
  };

  const handleKeyDown = (event) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      scroll('left');
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      scroll('right');
    }
  };

  return (
    <section className="relative group/scroller">
      {(title || seeAllLink) && (
        <motion.div
          initial={{ opacity: 0, x: -12 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="flex items-center gap-4 mb-4 relative z-10"
        >
          {title && (
            <h2 className="text-2xl font-semibold">{title}</h2>
          )}
          <div className="flex-1 h-px bg-gradient-to-r from-[var(--accent-gold)]/30 to-transparent" />
          {seeAllLink && (
            <Link to={seeAllLink} className="text-sm text-[var(--accent-gold-light)] no-underline whitespace-nowrap">
              Виж всички
            </Link>
          )}
        </motion.div>
      )}

      <div className="relative">
        {/* Left gradient + arrow */}
        <div
          className={`absolute left-0 top-0 bottom-0 w-16 z-10 bg-gradient-to-r from-[var(--bg-primary)] to-transparent pointer-events-none transition-opacity duration-300 ${canScrollLeft ? 'opacity-100' : 'opacity-0'}`}
        />
        {canScrollLeft && (
          <motion.button
            type="button"
            onClick={() => scroll('left')}
            aria-label="Превърти наляво"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            className="absolute left-2 top-1/2 -translate-y-1/2 z-30 w-10 h-10 rounded-full bg-[var(--bg-secondary)]/90 border border-[var(--border)] hidden md:flex items-center justify-center text-[var(--text-primary)] hover:border-[var(--accent-gold)] hover:bg-[var(--accent-gold)] hover:text-black transition-all shadow-lg opacity-80 hover:opacity-100"
          >
            <ChevronLeft className="w-6 h-6 ml-[-2px]" />
          </motion.button>
        )}

        {/* Scrollable content */}
        <div
          ref={scrollRef}
          onKeyDown={handleKeyDown}
          tabIndex={0}
          role="region"
          aria-label={title || 'Хоризонтален списък'}
          className="flex gap-4 overflow-x-auto scroll-smooth hide-scrollbar py-3 -my-3 px-1"
          style={{ scrollSnapType: 'x mandatory', overflowY: 'visible' }}
        >
          {children}
        </div>

        {/* Right gradient + arrow */}
        <div
          className={`absolute right-0 top-0 bottom-0 w-16 z-10 bg-gradient-to-l from-[var(--bg-primary)] to-transparent pointer-events-none transition-opacity duration-300 ${canScrollRight ? 'opacity-100' : 'opacity-0'}`}
        />
        {canScrollRight && (
          <motion.button
            type="button"
            onClick={() => scroll('right')}
            aria-label="Превърти надясно"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            className="absolute right-2 top-1/2 -translate-y-1/2 z-30 w-10 h-10 rounded-full bg-[var(--bg-secondary)]/90 border border-[var(--border)] hidden md:flex items-center justify-center text-[var(--text-primary)] hover:border-[var(--accent-gold)] hover:bg-[var(--accent-gold)] hover:text-black transition-all shadow-lg opacity-80 hover:opacity-100"
          >
            <ChevronRight className="w-6 h-6 mr-[-2px]" />
          </motion.button>
        )}
      </div>
    </section>
  );
}
