import { useState } from 'react';
import { AnimatePresence, motion } from '@/lib/motion';
import { Copy, Gift, X } from 'lucide-react';
import { api } from '../utils/api';
import { useToastContext } from '../context/ToastContext';
import { formatMoney } from '../utils/formatters';

export default function GiftModal({ open, onClose, giftType, targetId, planId, targetTitle, price }) {
  const { showToast } = useToastContext();
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleClose = () => {
    setMessage('');
    setResult(null);
    setError(null);
    onClose();
  };

  const handleSend = async (e) => {
    e.preventDefault();
    setSending(true);
    setError(null);

    try {
      const body = {
        gift_type: giftType,
        message: message.trim() || undefined,
      };
      if (giftType === 'subscription') {
        body.plan_id = planId;
      } else {
        body.target_id = targetId;
      }
      const data = await api.post('/gifts/create', body);
      setResult(data);
    } catch (err) {
      const msg = err?.data?.error || err?.message || 'Грешка при създаване на подаръка.';
      setError(msg);
    } finally {
      setSending(false);
    }
  };

  const handleCopy = async (value) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(String(value));
      showToast('Копирано в клипборда.');
    } catch {
      showToast('Не успях да копирам.', 'error');
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
          <motion.button
            type="button"
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={handleClose}
            aria-label="Затвори"
          />

          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 320, damping: 26 }}
            className="relative w-full max-w-lg glass-card p-6 sm:p-7 shadow-premium-lg"
          >
            <button
              type="button"
              onClick={handleClose}
              className="absolute right-4 top-4 rounded-full p-2 text-[var(--text-muted)] transition-colors hover:bg-white/10 hover:text-[var(--text-primary)]"
              aria-label="Затвори"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="mb-5 flex items-start gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full border border-[var(--accent-gold)]/35 bg-[var(--accent-gold)]/10 text-[var(--accent-gold-light)]">
                <Gift className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-xl font-semibold">Подари</h3>
                {targetTitle && (
                  <p className="mt-1 text-sm font-medium text-[var(--accent-gold-light)]">{targetTitle}</p>
                )}
                {price > 0 && (
                  <p className="mt-0.5 text-sm text-[var(--text-secondary)]">Цена: {formatMoney(price)}</p>
                )}
              </div>
            </div>

            {!result ? (
              <form onSubmit={handleSend} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">
                    Съобщение към получателя (по желание)
                  </label>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Напиши кратко послание..."
                    maxLength={200}
                    rows={3}
                    className="w-full px-4 py-2.5 rounded-xl bg-[var(--bg-tertiary)] border border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]/50 focus:outline-none focus:ring-2 focus:ring-[var(--accent-cyan)]/40 transition-all text-sm resize-none"
                    disabled={sending}
                  />
                </div>

                {error && (
                  <p className="text-sm text-[var(--danger)]">{error}</p>
                )}

                <div className="flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={handleClose}
                    className="px-4 py-2.5 rounded-xl text-sm font-medium text-[var(--text-secondary)] hover:bg-white/5 transition-colors"
                  >
                    Отказ
                  </button>
                  <button
                    type="submit"
                    disabled={sending}
                    className="px-6 py-2.5 rounded-xl bg-[var(--accent-gold)] text-black font-semibold text-sm hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer inline-flex items-center gap-2"
                  >
                    <Gift className="w-4 h-4" />
                    {sending ? 'Създаване...' : 'Създай подарък'}
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-4">
                <div className="rounded-xl border border-green-500/30 bg-green-500/10 p-4">
                  <p className="text-sm font-medium text-green-400 mb-2">
                    Подаръкът е създаден! Сподели кода с получателя.
                  </p>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-lg font-bold text-[var(--text-primary)]">{result.code}</span>
                    <button
                      type="button"
                      onClick={() => handleCopy(result.code)}
                      className="btn-outline inline-flex items-center gap-1.5 px-3 py-1.5 text-xs"
                    >
                      <Copy className="h-3.5 w-3.5" />
                      Копирай
                    </button>
                  </div>
                </div>

                {result.reference_code && (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4">
                      <p className="mb-1.5 text-xs uppercase tracking-[0.18em] text-[var(--text-muted)]">Референция за плащане</p>
                      <p className="font-mono text-sm font-semibold break-all">{result.reference_code}</p>
                      <button
                        type="button"
                        onClick={() => handleCopy(result.reference_code)}
                        className="mt-2 btn-outline inline-flex w-full items-center justify-center gap-1.5 py-2 text-xs"
                      >
                        <Copy className="h-3.5 w-3.5" />
                        Копирай
                      </button>
                    </div>
                    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4">
                      <p className="mb-1.5 text-xs uppercase tracking-[0.18em] text-[var(--text-muted)]">Сума</p>
                      <p className="text-2xl font-bold text-[var(--accent-gold-light)]">
                        {formatMoney(result.price)}
                      </p>
                    </div>
                  </div>
                )}

                {result.iban && (
                  <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4">
                    <p className="mb-1.5 text-xs uppercase tracking-[0.18em] text-[var(--text-muted)]">IBAN</p>
                    <p className="font-mono text-sm font-semibold break-all">{result.iban}</p>
                    <button
                      type="button"
                      onClick={() => handleCopy(result.iban)}
                      className="mt-2 btn-outline inline-flex w-full items-center justify-center gap-1.5 py-2 text-xs"
                    >
                      <Copy className="h-3.5 w-3.5" />
                      Копирай
                    </button>
                  </div>
                )}

                <p className="text-xs text-[var(--text-secondary)]">
                  След плащане администратор ще потвърди заявката и кодът ще стане активен за използване.
                </p>

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleClose}
                    className="btn-gold px-6 py-2.5 text-sm"
                  >
                    Затвори
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
