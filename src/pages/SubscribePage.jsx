import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  BadgeCheck,
  Ban,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Crown,
  Sparkles,
  Tag,
  XCircle,
} from 'lucide-react';
import { api } from '../utils/api';
import { getPublicSettings } from '../utils/settings';
import { formatMoney } from '../utils/formatters';
import { useToastContext } from '../context/ToastContext';
import ScrollReveal from '../components/ScrollReveal';
import ConfirmActionModal from '../components/ConfirmActionModal';
import PageBackground from '../components/PageBackground';

function statusMeta(status) {
  if (status === 'confirmed') {
    return { label: 'Потвърдено', className: 'text-[var(--success)]', icon: CheckCircle2 };
  }
  if (status === 'rejected') {
    return { label: 'Отказано', className: 'text-[var(--danger)]', icon: XCircle };
  }
  if (status === 'cancelled') {
    return { label: 'Анулирано', className: 'text-[var(--text-muted)]', icon: Ban };
  }
  return { label: 'Чака потвърждение', className: 'text-[var(--warning)]', icon: Clock };
}

export default function SubscribePage() {
  const [plans, setPlans] = useState([]);
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [promoCode, setPromoCode] = useState('');
  const [discountPercent, setDiscountPercent] = useState(0);
  const [promoStatus, setPromoStatus] = useState(null);
  const [promoError, setPromoError] = useState('');
  const [paymentResult, setPaymentResult] = useState(null);
  const [myPayments, setMyPayments] = useState([]);
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(false);
  const [initialError, setInitialError] = useState('');
  const [cancellingId, setCancellingId] = useState(null);
  const [cancelModal, setCancelModal] = useState({ open: false, paymentId: null });
  const { showToast } = useToastContext();

  const refreshPayments = async () => {
    const paymentsData = await api.get('/my-payments');
    setMyPayments(paymentsData);
    return paymentsData;
  };

  useEffect(() => {
    Promise.all([api.get('/plans'), api.get('/my-payments'), getPublicSettings()])
      .then(([plansData, paymentsData, publicSettings]) => {
        setPlans(plansData);
        setMyPayments(paymentsData);
        setSettings(publicSettings || {});
        if (plansData.length > 0) setSelectedPlanId(String(plansData[0].id));
        setInitialError('');
      })
      .catch((err) => {
        setInitialError(err.message || 'Неуспешно зареждане на абонаментите.');
      });
  }, []);

  const selectedPlan = useMemo(
    () => plans.find((plan) => plan.id === Number(selectedPlanId)),
    [plans, selectedPlanId]
  );

  const originalPrice = Number(selectedPlan?.price || 0);
  const finalPrice = Math.round(originalPrice * (1 - discountPercent / 100) * 100) / 100;

  const validatePromo = async () => {
    const code = promoCode.trim();
    if (!code) return;
    try {
      const result = await api.post('/promo/validate', { code });
      setDiscountPercent(result.discount_percent || 0);
      setPromoStatus('valid');
      setPromoError('');
    } catch (err) {
      setDiscountPercent(0);
      setPromoStatus('invalid');
      setPromoError(err.message || 'Невалиден код');
    }
  };

  const generateReference = async () => {
    if (!selectedPlan) return;
    setLoading(true);
    try {
      const result = await api.post('/subscribe', {
        plan_id: selectedPlan.id,
        promo_code: promoStatus === 'valid' ? promoCode.trim() : undefined,
      });
      setPaymentResult(result);
      await refreshPayments();
      showToast('Основанието е генерирано.');
    } catch (err) {
      showToast(err.message || 'Възникна грешка', 'error');
    } finally {
      setLoading(false);
    }
  };

  const cancelPayment = async (reasonText) => {
    if (!cancelModal.paymentId) return;
    setCancellingId(cancelModal.paymentId);
    try {
      await api.put(`/my-payments/${cancelModal.paymentId}/cancel`, { reason: reasonText.trim() || undefined });
      await refreshPayments();
      showToast('Заявката е анулирана.');
      setCancelModal({ open: false, paymentId: null });
    } catch (err) {
      showToast(err.message || 'Неуспешно анулиране', 'error');
    } finally {
      setCancellingId(null);
    }
  };

  const copyText = async (text) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      showToast('Копирано в клипборда.');
    } catch {
      showToast('Неуспешно копиране.', 'error');
    }
  };

  return (
    <div className="relative max-w-6xl mx-auto px-4 py-8 overflow-hidden">
      <PageBackground />

      <ScrollReveal variant="fadeUp" className="relative mb-7">
        <div className="pill-chip mb-3 w-fit">
          <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
          {settings.subscribe_badge_text || 'Премиум достъп'}
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold flex items-center gap-3">
          <Crown className="w-8 h-8 text-[var(--accent-gold-light)]" aria-hidden="true" />
          {settings.subscribe_title || 'Абонаменти'}
        </h1>
        <p className="text-[var(--text-secondary)] mt-2">
          {settings.subscribe_subtitle || 'Избери план, приложи промо код и генерирай основание за плащане.'}
        </p>

        {/* Step progress indicator */}
        <div className="flex items-center gap-2 mt-5">
          {[settings.subscribe_step_plan || 'Избери план', settings.subscribe_step_promo || 'Промо код', settings.subscribe_step_payment || 'Плащане'].map((step, i) => {
            const currentStep = paymentResult ? 2 : selectedPlan ? 1 : 0;
            return (
              <div key={step} className="flex items-center gap-2 flex-1 last:flex-initial">
                <div className={`step-dot ${currentStep >= i ? 'step-dot-active' : 'step-dot-inactive'}`}>
                  {currentStep > i ? <Check className="w-4 h-4" aria-hidden="true" /> : i + 1}
                </div>
                <span className={`text-sm font-semibold hidden sm:inline ${currentStep >= i ? 'text-[var(--accent-gold-light)]' : 'text-[var(--text-muted)]'}`}>{step}</span>
                {i < 2 && <div className={`step-line flex-1 ${currentStep > i ? 'step-line-active' : 'step-line-inactive'}`} />}
              </div>
            );
          })}
        </div>
        {initialError && (
          <p className="mt-3 rounded-xl border border-[var(--danger)]/45 bg-[var(--danger)]/10 p-3 text-sm text-[#ffc9c9]">
            {initialError}
          </p>
        )}
      </ScrollReveal>

      <section className="premium-panel p-4 sm:p-5 mb-6" style={{ overflow: 'visible' }}>
        <h2 className="text-xl sm:text-2xl font-semibold mb-10 relative z-20">Избери план</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 pt-3" style={{ overflow: 'visible' }}>
          {plans.map((plan, index) => {
            const active = String(plan.id) === selectedPlanId;
            const isPopular = !!plan.is_popular;
            return (
              <motion.button
                key={plan.id}
                onClick={() => {
                  setSelectedPlanId(String(plan.id));
                  setPaymentResult(null);
                }}
                className={`relative text-left rounded-2xl border p-5 transition-all duration-500 z-10 hover:z-20 ${active
                  ? 'border-[var(--accent-gold)]/55 bg-[var(--accent-gold)]/12 glow-pulse animated-border'
                  : 'border-[var(--border)] bg-[var(--bg-card)] hover:border-[var(--border-light)]'
                  }`}
                whileHover={{ y: -6, scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              >
                {isPopular && (
                  <div className="popular-ribbon"><span>{settings.subscribe_popular_label || 'Популярен'}</span></div>
                )}
                {active && (
                  <motion.div
                    className="absolute inset-0 border-2 border-[var(--accent-gold)] rounded-2xl pointer-events-none"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.2 }}
                  />
                )}
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-lg font-semibold">{plan.name}</h3>
                  <span className="badge badge-gold">{settings.subscribe_tier_prefix || 'Ниво'} {plan.tier_level}</span>
                </div>
                <p className="text-sm text-[var(--text-secondary)] min-h-10">
                  {plan.description || 'Премиум достъп до съдържание.'}
                </p>
                <p className="mt-3 text-2xl font-bold text-gradient-gold">{formatMoney(plan.price)}</p>
                {plan.features?.length > 0 && (
                  <ul className="mt-3 space-y-1">
                    {plan.features.slice(0, 3).map((f, i) => (
                      <li key={i} className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
                        <CheckCircle2 className="w-3.5 h-3.5 text-[var(--success)] flex-shrink-0" aria-hidden="true" />
                        {f}
                      </li>
                    ))}
                  </ul>
                )}
              </motion.button>
            );
          })}
        </div >
      </section >

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <section className="xl:col-span-2 glass-card p-5 sm:p-6">
          {selectedPlan && (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4 mb-4">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <h3 className="text-lg font-semibold text-[var(--accent-gold-light)]">{selectedPlan.name}</h3>
                <span className="badge badge-gold">{settings.subscribe_tier_prefix || 'Ниво'} {selectedPlan.tier_level}</span>
              </div>
              {selectedPlan.features?.length > 0 && (
                <ul className="space-y-1.5 text-sm text-[var(--text-secondary)]">
                  {selectedPlan.features.map((feature, index) => (
                    <li key={`${feature}-${index}`} className="flex gap-2">
                      <BadgeCheck className="w-4 h-4 text-[var(--success)] mt-0.5" aria-hidden="true" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <h2 className="text-xl font-semibold mb-3">Промо код</h2>
          <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto] gap-3 mb-3">
            <div className="relative min-w-0 flex-1">
              <Tag className="w-4 h-4 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
              <input
                value={promoCode}
                onChange={(event) => {
                  setPromoCode(event.target.value);
                  setPromoStatus(null);
                  setDiscountPercent(0);
                }}
                className="input-dark pl-11 pr-4 h-11"
                placeholder={settings.subscribe_promo_placeholder || 'напр. NANCY10'}
              />
            </div>
            <button
              onClick={validatePromo}
              disabled={!promoCode.trim()}
              className="btn-outline h-11 px-6 shrink-0 whitespace-nowrap disabled:opacity-60 hover:scale-[1.03] active:scale-[0.97]"
            >
              Приложи
            </button>
          </div>

          {promoStatus === 'valid' && (
            <p className="text-sm text-[var(--success)] mb-4">Промо кодът е валиден: {discountPercent}%.</p>
          )}
          {promoStatus === 'invalid' && <p className="text-sm text-[#ffc9c9] mb-4">{promoError}</p>}

          <h2 className="text-xl font-semibold mb-3">Калкулация</h2>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4 mb-5">
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="text-[var(--text-secondary)]">Оригинална цена</span>
              <span>{formatMoney(originalPrice)}</span>
            </div>
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="text-[var(--text-secondary)]">Отстъпка</span>
              <span className={discountPercent > 0 ? 'text-[var(--success)]' : ''}>
                {discountPercent > 0 ? `${discountPercent}%` : '0%'}
              </span>
            </div>
            <div className="flex items-center justify-between text-base font-bold border-t border-[var(--border)] pt-2">
              <span>Крайна сума</span>
              <span className="text-[var(--accent-gold-light)]">{formatMoney(finalPrice)}</span>
            </div>
          </div>

          <button onClick={generateReference} disabled={!selectedPlan || loading} className="btn-gold w-full">
            {loading ? 'Генериране...' : 'Генерирай основание за плащане'}
          </button>
        </section>

        <section className="glass-card p-5 sm:p-6">
          <h2 className="text-xl font-semibold mb-4">{settings.subscribe_my_requests_title || 'Моите заявки'}</h2>
          {myPayments.length === 0 ? (
            <p className="text-sm text-[var(--text-secondary)]">Нямаш генерирани основания.</p>
          ) : (
            <div className="space-y-3 max-h-[470px] overflow-auto pr-1">
              {myPayments.map((payment) => {
                const meta = statusMeta(payment.status);
                const Icon = meta.icon;
                const canCancel = payment.status === 'pending';
                return (
                  <article key={payment.id} className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-3">
                    <p className="font-mono text-sm font-semibold">{payment.reference_code}</p>
                    <p className="text-xs text-[var(--text-muted)] mt-1">
                      {payment.plan_name} • {formatMoney(payment.final_price)}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${meta.className}`}>
                        <Icon className="w-4 h-4" aria-hidden="true" />
                        {meta.label}
                      </span>
                      {canCancel && (
                        <button
                          onClick={() => setCancelModal({ open: true, paymentId: payment.id })}
                          disabled={cancellingId === payment.id}
                          className="btn-outline text-xs py-1 px-3"
                        >
                          {cancellingId === payment.id ? 'Изчакване...' : 'Анулирай'}
                        </button>
                      )}
                    </div>
                    {payment.rejection_reason && (
                      <p className="text-xs text-[#ffb8b8] mt-2">Причина за отказ: {payment.rejection_reason}</p>
                    )}
                    {payment.cancelled_reason && (
                      <p className="text-xs text-[var(--text-muted)] mt-2">Причина за анулиране: {payment.cancelled_reason}</p>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>

      <AnimatePresence>
        {paymentResult && (
          <motion.section
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ type: 'spring', stiffness: 200, damping: 25 }}
            className="premium-panel p-5 sm:p-6 mt-6 border border-[var(--accent-gold)]/45 animated-border glow-pulse"
          >
            <h2 className="text-xl font-semibold mb-4 text-[var(--accent-gold-light)]">Данни за плащане</h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-3">
                <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-muted)] mb-1">IBAN</p>
                <p className="font-mono text-sm break-all">{paymentResult.iban || 'Не е зададен'}</p>
                <button onClick={() => copyText(paymentResult.iban)} className="mt-3 btn-outline text-xs inline-flex items-center gap-1.5">
                  <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                  Копирай
                </button>
              </div>

              <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-3">
                <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-muted)] mb-1">Сума</p>
                <p className="text-xl font-bold text-[var(--accent-gold-light)]">{formatMoney(paymentResult.final_price)}</p>
              </div>

              <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-3">
                <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-muted)] mb-1">Основание</p>
                <p className="font-mono text-sm">{paymentResult.reference_code}</p>
                <button onClick={() => copyText(paymentResult.reference_code)} className="mt-3 btn-outline text-xs inline-flex items-center gap-1.5">
                  <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                  Копирай
                </button>
              </div>
            </div>

            <p className="text-sm text-[var(--text-secondary)] mt-4">
              {paymentResult.payment_info || 'Преведи сумата по посочения IBAN с точното основание.'}
            </p>
            <p className="text-sm text-[var(--accent-gold-light)] mt-2">
              Екипът ще активира абонамента след потвърждение на плащането.
            </p>
          </motion.section>
        )}
      </AnimatePresence>

      <ConfirmActionModal
        open={cancelModal.open}
        title="Анулиране на заявка"
        message="Можеш да добавиш причина по желание. Заявката ще бъде маркирана като анулирана."
        confirmLabel="Анулирай"
        cancelLabel="Назад"
        tone="danger"
        withReason
        reasonLabel="Причина (по желание)"
        reasonPlaceholder="Напр. Въведена е грешна сума"
        loading={cancellingId === cancelModal.paymentId}
        onClose={() => setCancelModal({ open: false, paymentId: null })}
        onConfirm={cancelPayment}
      />
    </div >
  );
}
