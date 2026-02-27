import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const btnSpring = { type: 'spring', stiffness: 400, damping: 25 };

export default function AdminPagination({
  page,
  totalPages,
  total,
  pageSize,
  onPageChange,
  onPageSizeChange,
}) {
  const canPrev = page > 1;
  const canNext = page < totalPages;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className="mt-4 flex flex-wrap items-center justify-between gap-3"
    >
      <p className="text-sm text-[var(--text-muted)]">
        Общо записи: {Number(total || 0).toLocaleString('bg-BG')}
      </p>

      <div className="flex items-center gap-2">
        <select
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
          className="input-dark py-1.5 px-2 text-xs w-auto"
        >
          <option value={10}>10 / стр.</option>
          <option value={20}>20 / стр.</option>
          <option value={50}>50 / стр.</option>
        </select>

        <motion.button
          onClick={() => canPrev && onPageChange(page - 1)}
          disabled={!canPrev}
          whileHover={canPrev ? { scale: 1.03 } : {}}
          whileTap={canPrev ? { scale: 0.97 } : {}}
          transition={btnSpring}
          className="btn-outline py-1.5 px-2 text-xs inline-flex items-center gap-1 disabled:opacity-50"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          Назад
        </motion.button>

        <span className="text-xs text-[var(--text-secondary)] px-1">
          Стр. {page} / {totalPages}
        </span>

        <motion.button
          onClick={() => canNext && onPageChange(page + 1)}
          disabled={!canNext}
          whileHover={canNext ? { scale: 1.03 } : {}}
          whileTap={canNext ? { scale: 0.97 } : {}}
          transition={btnSpring}
          className="btn-outline py-1.5 px-2 text-xs inline-flex items-center gap-1 disabled:opacity-50"
        >
          Напред
          <ChevronRight className="w-3.5 h-3.5" />
        </motion.button>
      </div>
    </motion.div>
  );
}
