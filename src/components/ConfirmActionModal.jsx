import { useEffect, useId, useRef, useState } from 'react';
import { motion, AnimatePresence } from '@/lib/motion';

export default function ConfirmActionModal({
  open,
  title,
  message,
  confirmLabel = 'Потвърди',
  cancelLabel = 'Отказ',
  tone = 'default',
  withReason = false,
  reasonLabel = 'Причина',
  reasonPlaceholder = 'Добави причина...',
  defaultReason = '',
  onClose,
  onConfirm,
  loading = false,
}) {
  const [reason, setReason] = useState(defaultReason);
  const dialogRef = useRef(null);
  const cancelButtonRef = useRef(null);
  const reasonRef = useRef(null);
  const previousFocusRef = useRef(null);
  const titleId = useId();
  const messageId = useId();

  useEffect(() => {
    if (!open) return;
    setReason(defaultReason || '');
  }, [open, defaultReason]);

  useEffect(() => {
    if (!open) return undefined;

    previousFocusRef.current = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const focusTarget = withReason ? reasonRef.current : cancelButtonRef.current;
    focusTarget?.focus({ preventScroll: true });

    const onKeyDown = (event) => {
      if (event.key === 'Escape' && !loading) {
        onClose?.();
        return;
      }

      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = dialogRef.current.querySelectorAll(
        'button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
      previousFocusRef.current?.focus?.({ preventScroll: true });
    };
  }, [loading, onClose, open, withReason]);

  const confirmClass = tone === 'danger'
    ? 'btn-outline border-[var(--danger)]/70 text-[var(--danger)] hover:bg-[var(--danger)]/10'
    : 'btn-gold';

  return (
    <AnimatePresence>
      {open && (
        <div
          className="fixed inset-0 z-[1000] flex items-center justify-center p-4"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={message ? messageId : undefined}
        >
          <motion.div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => !loading && onClose?.()}
          />

          <motion.div
            ref={dialogRef}
            className="relative w-full max-w-md glass-card p-5 shadow-premium-lg"
            initial={{ opacity: 0, scale: 0.92, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ type: 'spring', stiffness: 350, damping: 25 }}
          >
            <h3 id={titleId} className="text-lg font-semibold mb-2">{title}</h3>
            {message && <p id={messageId} className="text-sm text-[var(--text-secondary)] mb-4">{message}</p>}

            {withReason && (
              <div className="mb-4">
                <label className="text-xs uppercase tracking-[0.12em] text-[var(--text-muted)] block mb-1.5">
                  {reasonLabel}
                </label>
                <textarea
                  ref={reasonRef}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder={reasonPlaceholder}
                  rows={3}
                  className="input-dark resize-none"
                />
              </div>
            )}

            <div className="flex flex-wrap justify-end gap-2">
              <motion.button
                ref={cancelButtonRef}
                type="button"
                className="btn-outline"
                onClick={() => !loading && onClose?.()}
                disabled={loading}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                transition={{ type: 'spring', stiffness: 400, damping: 20 }}
              >
                {cancelLabel}
              </motion.button>
              <motion.button
                type="button"
                className={confirmClass}
                onClick={() => onConfirm?.(reason)}
                disabled={loading}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                transition={{ type: 'spring', stiffness: 400, damping: 20 }}
              >
                {loading ? 'Изчакване...' : confirmLabel}
              </motion.button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
