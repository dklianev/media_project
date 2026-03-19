import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from '@/lib/motion';
import {
  BadgeCheck,
  Ban,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Crown,
  Gift,
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
import GiftModal from '../components/GiftModal';
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
  const [currentStep, setCurrentStep] = useState(1);
  const [giftModal, setGiftModal] = useState(null);
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
      setCurrentStep(3);
      await refreshPayments();
      showToast('Основанието е генерирано.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
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

  const handlePlanSelect = (planId) => {
    setSelectedPlanId(String(planId));
    setPaymentResult(null);
  };

  const handleContinueToStep2 = () => {
    if (!selectedPlan) return;
    setCurrentStep(2);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleBackToStep1 = () => {
    setCurrentStep(1);
    setPaymentResult(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
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
            const stepNumber = i + 1;
            return (
              <div key={step} className="flex items-center gap-2 flex-1 last:flex-initial">
                <div className={`step-dot ${currentStep >= stepNumber ? 'step-dot-active' : 'step-dot-inactive'}`}>
                  {currentStep > stepNumber ? <Check className="w-4 h-4" aria-hidden="true" /> : stepNumber}
                </div>
                <span className={`text-sm font-semibold hidden sm:inline ${currentStep >= stepNumber ? 'text-[var(--accent-gold-light)]' : 'text-[var(--text-muted)]'}`}>{step}</span>
                {i < 2 && <div className={`step-line flex-1 ${currentStep > stepNumber ? 'step-line-active' : 'step-line-inactive'}`} />}
              </div>
            );
          })}
        </div>
        {initialError && (
          <p className="mt-3 rounded-xl border border-[var(--danger)]/45 bg-[var(--danger)]/10 p-3 text-sm text-[var(--danger)]">
            {initialError}
          </p>
        )}
      </ScrollReveal>

      {/* --- Wizard Content --- */}
      <AnimatePresence mode="wait">

        {/* STEP 1: CHOOSE PLAN */}
        {currentStep === 1 && (
          <motion.section
            key="step1"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
            className="premium-panel p-5 sm:p-6 pt-6 sm:pt-7 mb-10" style={{ overflow: 'visible' }}
          >
            <h2 className="text-xl sm:text-2xl font-semibold mb-8 sm:mb-10 relative z-30">Избери своя план</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 pt-4" style={{ overflow: 'visible' }}>
              {plans.map((plan, index) => {
                const active = String(plan.id) === selectedPlanId;
                const isPopular = !!plan.is_popular;
                return (
                  <motion.button
                    key={plan.id}
                    onClick={() => handlePlanSelect(plan.id)}
                    className={`relative text-left rounded-2xl border p-5 transition-all duration-500 ${active
                      ? 'border-[var(--accent-gold)]/55 bg-[var(--accent-gold)]/12 glow-pulse animated-border shadow-[0_10px_30px_rgba(212,175,55,0.15)]'
                      : 'border-[var(--border)] bg-[var(--bg-card)] hover:border-[var(--border-light)] hover:shadow-lg'
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
                      <ul className="mt-4 space-y-2">
                        {plan.features.slice(0, 4).map((f, i) => (
                          <li key={i} className="flex items-start gap-2 text-xs text-[var(--text-secondary)]">
                            <CheckCircle2 className="w-4 h-4 text-[var(--success)] flex-shrink-0 mt-0.5" aria-hidden="true" />
                            {f}
                          </li>
                        ))}
                      </ul>
                    )}
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setGiftModal({ planId: plan.id, targetTitle: plan.name, price: plan.price }); }}
                      className="mt-4 w-full inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--accent-gold)]/30 bg-[var(--accent-gold)]/8 px-3 py-2 text-xs font-medium text-[var(--accent-gold-light)] hover:bg-[var(--accent-gold)]/15 transition-colors"
                    >
                      <Gift className="w-3.5 h-3.5" />
                      Подари този план
                    </button>
                  </motion.button>
                );
              })}
            </div>

            <div className="mt-8 flex justify-end">
              <button
                onClick={handleContinueToStep2}
                disabled={!selectedPlanId}
                className="btn-gold px-8 py-3 text-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed hidden sm:flex"
              >
                Продължи с план &quot;{selectedPlan?.name}&quot;
              </button>
              <button
                onClick={handleContinueToStep2}
                disabled={!selectedPlanId}
                className="btn-gold px-8 py-3 w-full text-sm block sm:hidden"
              >
                Продължи
              </button>
            </div>
          </motion.section >
        )}

        {/* STEP 2: PROMO & PAYMENT GENERATION */}
        {currentStep === 2 && (
          <motion.section
            key="step2"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.3 }}
            className="max-w-3xl mx-auto"
          >
            <div className="glass-card p-6 sm:p-8">
              <button
                onClick={handleBackToStep1}
                className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors mb-6 flex items-center gap-1"
              >
                &larr; Назад към плановете
              </button>

              {selectedPlan && (
                <div className="rounded-xl border border-[var(--accent-gold)]/30 bg-[var(--accent-gold)]/5 p-5 mb-8">
                  <p className="text-xs uppercase tracking-[0.15em] text-[var(--text-muted)] mb-2">Избран План</p>
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <h3 className="text-2xl font-bold text-[var(--accent-gold-light)]">{selectedPlan.name}</h3>
                    <span className="badge badge-gold px-3 py-1 text-sm">{settings.subscribe_tier_prefix || 'Ниво'} {selectedPlan.tier_level}</span>
                  </div>
                  {selectedPlan.features?.length > 0 && (
                    <ul className="space-y-2 text-sm text-[var(--text-secondary)] mt-4 pt-4 border-t border-[var(--border)]/50">
                      {selectedPlan.features.map((feature, index) => (
                        <li key={`${feature}-${index}`} className="flex gap-2">
                          <BadgeCheck className="w-4 h-4 text-[var(--success)] mt-0.5 shrink-0" aria-hidden="true" />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              <h2 className="text-xl font-semibold mb-4 text-[var(--text-primary)]">Имаш ли промо код?</h2>
              <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto] gap-3 mb-4">
                <div className="relative min-w-0 flex-1">
                  <Tag className="w-5 h-5 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
                  <input
                    value={promoCode}
                    onChange={(event) => {
                      setPromoCode(event.target.value);
                      setPromoStatus(null);
                      setDiscountPercent(0);
                    }}
                    className="input-dark pl-11 pr-4 h-12 text-base"
                    placeholder={settings.subscribe_promo_placeholder || 'Въведи код (по желание)'}
                  />
                </div>
                <button
                  onClick={validatePromo}
                  disabled={!promoCode.trim()}
                  className="btn-outline h-12 px-8 shrink-0 whitespace-nowrap disabled:opacity-60 hover:scale-[1.02] active:scale-[0.98]"
                >
                  Приложи
                </button>
              </div>

              {promoStatus === 'valid' && (
                <div className="mb-6 p-3 rounded-lg bg-[var(--success)]/10 border border-[var(--success)]/30 text-[var(--success)] text-sm font-medium flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  Промо кодът е приложен успешно: {discountPercent}% отстъпка.
                </div>
              )}
              {promoStatus === 'invalid' && (
                <div className="mb-6 p-3 rounded-lg bg-[var(--danger)]/10 border border-[var(--danger)]/30 text-[var(--danger)] text-sm font-medium flex items-center gap-2">
                  <XCircle className="w-4 h-4 shrink-0" />
                  {promoError}
                </div>
              )}

              <h2 className="text-xl font-semibold mb-4 mt-8 text-[var(--text-primary)]">Финална калкулация</h2>
              <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-5 mb-8">
                <div className="flex items-center justify-between text-base mb-3">
                  <span className="text-[var(--text-secondary)]">Оригинална цена</span>
                  <span className="font-semibold">{formatMoney(originalPrice)}</span>
                </div>
                <div className="flex items-center justify-between text-base mb-4">
                  <span className="text-[var(--text-secondary)]">Отстъпка</span>
                  <span className={`font-semibold ${discountPercent > 0 ? 'text-[var(--success)]' : ''}`}>
                    {discountPercent > 0 ? `-${discountPercent}%` : '0%'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xl font-bold border-t border-[var(--border)] pt-4 pb-1">
                  <span>Сума за плащане</span>
                  <span className="text-[var(--accent-gold-light)] text-3xl">{formatMoney(finalPrice)}</span>
                </div>
              </div>

              <button
                onClick={generateReference}
                disabled={!selectedPlan || loading}
                className="btn-gold w-full text-lg py-4 shadow-[0_10px_30px_rgba(212,175,55,0.2)]"
              >
                {loading ? 'Генериране...' : 'Генерирай основание за плащане'}
              </button>
            </div>
          </motion.section>
        )}

        {/* STEP 3: PAYMENT RESULT DETAILS */}
        {currentStep === 3 && paymentResult && (
          <motion.section
            key="step3"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'spring', stiffness: 200, damping: 25 }}
            className="premium-panel p-6 sm:p-10 border border-[var(--accent-gold)]/45 animated-border glow-pulse max-w-4xl mx-auto mb-8"
          >
            <div className="text-center mb-8">
              <div className="w-16 h-16 rounded-full bg-[var(--success)]/10 border border-[var(--success)] text-[var(--success)] flex items-center justify-center mx-auto mb-4 shadow-[0_0_20px_rgba(34,197,94,0.2)]">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h2 className="text-2xl font-bold mb-2 text-[var(--text-primary)]">Успешно генерирано основание</h2>
              <p className="text-[var(--text-secondary)]">
                Моля, преведи посочената сума по следния IBAN със съответното основание.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
              <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4 flex flex-col justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-muted)] mb-2">IBAN</p>
                  <p className="font-mono text-sm break-all font-semibold leading-relaxed">{paymentResult.iban || 'Не е зададен'}</p>
                </div>
                <button onClick={() => copyText(paymentResult.iban)} className="mt-4 btn-outline text-xs inline-flex items-center justify-center gap-1.5 w-full py-2">
                  <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                  Копирай
                </button>
              </div>

              <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4 flex flex-col justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-muted)] mb-2">Сума</p>
                  <p className="text-2xl font-bold text-[var(--accent-gold-light)]">{formatMoney(paymentResult.final_price)}</p>
                </div>
              </div>

              <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4 flex flex-col justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-muted)] mb-2">Основание</p>
                  <p className="font-mono text-xl text-[var(--text-primary)] font-bold">{paymentResult.reference_code}</p>
                </div>
                <button onClick={() => copyText(paymentResult.reference_code)} className="mt-4 btn-outline text-xs inline-flex items-center justify-center gap-1.5 w-full py-2">
                  <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                  Копирай
                </button>
              </div>
            </div>

            <div className="bg-[var(--accent-gold)]/10 border border-[var(--accent-gold)]/30 rounded-xl p-5 text-center">
              <p className="text-sm text-[var(--text-primary)] font-medium mb-1">
                {paymentResult.payment_info || 'Внимание: Основанието е валидно само за един превод.'}
              </p>
              <p className="text-sm text-[var(--accent-gold-light)]">
                Екипът ще активира абонамента след потвърждение на плащането.
              </p>
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      {/* --- RECENT REQUESTS --- */}
      <ScrollReveal variant="fadeUp" className="mt-8">
        <section className="glass-card p-5 sm:p-6 mb-8 max-w-6xl mx-auto">
          <h2 className="text-xl font-semibold mb-8 sm:mb-10 flex items-center gap-2">
            <Clock className="w-5 h-5 text-[var(--accent-gold)]" />
            {settings.subscribe_my_requests_title || 'Моите активни заявки'}
          </h2>
          {myPayments.length === 0 ? (
            <div className="mt-2 text-center py-12 rounded-xl border border-dashed border-[var(--border)]/50 bg-[var(--bg-secondary)]/30">
              <Clock className="w-8 h-8 text-[var(--text-muted)] mx-auto mb-3 opacity-50" />
              <p className="text-sm text-[var(--text-secondary)]">Все още нямаш генерирани заявки за плащане.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {myPayments.map((payment) => {
                const meta = statusMeta(payment.status);
                const Icon = meta.icon;
                const canCancel = payment.status === 'pending';
                return (
                  <article key={payment.id} className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4 flex flex-col h-full hover:border-[var(--accent-gold)]/30 transition-colors">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <p className="text-xs uppercase tracking-[0.1em] text-[var(--text-muted)] mb-1">Основание</p>
                        <p className="font-mono text-base font-bold text-[var(--text-primary)]">{payment.reference_code}</p>
                      </div>
                      <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider px-2 py-1 rounded-full border ${payment.status === 'pending' ? 'bg-[var(--warning)]/10 border-[var(--warning)]/30 text-[var(--warning)]' : ''} ${payment.status === 'confirmed' ? 'bg-[var(--success)]/10 border-[var(--success)]/30 text-[var(--success)]' : ''} ${payment.status === 'rejected' ? 'bg-[var(--danger)]/10 border-[var(--danger)]/30 text-[var(--danger)]' : ''}`}>
                        <Icon className="w-3.5 h-3.5" aria-hidden="true" />
                        {meta.label}
                      </span>
                    </div>

                    <p className="text-sm text-[var(--text-primary)] mb-1 font-medium bg-[var(--bg-tertiary)] inline-block w-fit px-2 py-1 rounded-md">
                      {payment.plan_name}
                    </p>
                    <p className="text-lg font-bold text-[var(--accent-gold-light)] mb-4">{formatMoney(payment.final_price)}</p>

                    <div className="mt-auto pt-4 border-t border-[var(--border)]/50 flex flex-col gap-2">
                      {canCancel && (
                        <button
                          onClick={() => setCancelModal({ open: true, paymentId: payment.id })}
                          disabled={cancellingId === payment.id}
                          className="btn-outline text-xs py-2 w-full hover:bg-[var(--danger)]/10 hover:text-[var(--danger)] hover:border-[var(--danger)]/50"
                        >
                          {cancellingId === payment.id ? 'Изчакване...' : 'Анулирай заявката'}
                        </button>
                      )}
                      {payment.rejection_reason && (
                        <p className="text-xs text-[var(--danger)] bg-[var(--danger)]/10 p-2 rounded-lg">Отказано: {payment.rejection_reason}</p>
                      )}
                      {payment.cancelled_reason && (
                        <p className="text-xs text-[var(--text-muted)] bg-white/5 p-2 rounded-lg">Анулирано: {payment.cancelled_reason}</p>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </ScrollReveal>

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

      {giftModal && (
        <GiftModal
          open
          onClose={() => setGiftModal(null)}
          giftType="subscription"
          planId={giftModal.planId}
          targetTitle={giftModal.targetTitle}
          price={giftModal.price}
        />
      )}
    </div >
  );
}
