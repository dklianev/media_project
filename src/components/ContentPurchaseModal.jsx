import { AnimatePresence, motion } from 'framer-motion';
import { Copy, CreditCard, ReceiptText, X } from 'lucide-react';
import { formatMoney } from '../utils/formatters';
import { useToastContext } from '../context/ToastContext';

function requestTitle(request) {
  if (!request) return '';
  if (request.target_type === 'episode') {
    const episodeLabel = request.episode_number ? `Епизод ${request.episode_number}` : 'Епизод';
    const parts = [request.production_title, episodeLabel, request.target_title].filter(Boolean);
    return parts.join(' - ');
  }
  return request.target_title || request.production_title || '';
}

export default function ContentPurchaseModal({ open, request, onClose }) {
  const { showToast } = useToastContext();

  const handleCopy = async (value) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(String(value));
      showToast('Копирано в клипборда.');
    } catch {
      showToast('Не успях да копирам стойността.', 'error');
    }
  };

  return (
    <AnimatePresence>
      {open && request && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
          <motion.button
            type="button"
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            aria-label="Затвори"
          />

          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 320, damping: 26 }}
            className="relative w-full max-w-2xl glass-card p-6 sm:p-7 shadow-premium-lg"
          >
            <button
              type="button"
              onClick={onClose}
              className="absolute right-4 top-4 rounded-full p-2 text-[var(--text-muted)] transition-colors hover:bg-white/10 hover:text-[var(--text-primary)]"
              aria-label="Затвори"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="mb-6 flex items-start gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full border border-[var(--accent-gold)]/35 bg-[var(--accent-gold)]/10 text-[var(--accent-gold-light)]">
                <CreditCard className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-xl font-semibold">Инструкции за плащане</h3>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">
                  Използвай референцията по-долу и изпрати сумата по банков път или по указания начин.
                </p>
                {requestTitle(request) && (
                  <p className="mt-2 text-sm font-medium text-[var(--accent-gold-light)]">
                    {requestTitle(request)}
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4">
                <p className="mb-2 text-xs uppercase tracking-[0.18em] text-[var(--text-muted)]">Референция</p>
                <p className="font-mono text-sm font-semibold break-all">{request.reference_code || '-'}</p>
                <button
                  type="button"
                  onClick={() => handleCopy(request.reference_code)}
                  className="mt-3 btn-outline inline-flex w-full items-center justify-center gap-1.5 py-2 text-xs"
                >
                  <Copy className="h-3.5 w-3.5" />
                  Копирай
                </button>
              </div>

              <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4">
                <p className="mb-2 text-xs uppercase tracking-[0.18em] text-[var(--text-muted)]">Сума</p>
                <p className="text-2xl font-bold text-[var(--accent-gold-light)]">
                  {formatMoney(request.final_price)}
                </p>
              </div>

              <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4">
                <p className="mb-2 text-xs uppercase tracking-[0.18em] text-[var(--text-muted)]">IBAN</p>
                <p className="font-mono text-sm font-semibold break-all">{request.iban || 'Не е зададен'}</p>
                <button
                  type="button"
                  onClick={() => handleCopy(request.iban)}
                  className="mt-3 btn-outline inline-flex w-full items-center justify-center gap-1.5 py-2 text-xs"
                >
                  <Copy className="h-3.5 w-3.5" />
                  Копирай
                </button>
              </div>
            </div>

            <div className="mt-5 rounded-xl border border-[var(--accent-gold)]/30 bg-[var(--accent-gold)]/8 p-4">
              <div className="mb-2 flex items-center gap-2 text-[var(--accent-gold-light)]">
                <ReceiptText className="h-4 w-4" />
                <span className="text-sm font-medium">Какво да напишеш в плащането</span>
              </div>
              <p className="text-sm text-[var(--text-secondary)]">
                {request.payment_info || 'След плащане заявката ще бъде прегледана и потвърдена от администратор.'}
              </p>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
