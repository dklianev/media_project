import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Gift, Send, Inbox, Copy, Check } from 'lucide-react';
import { api } from '../utils/api';
import { formatDate } from '../utils/formatters';
import { useToastContext } from '../context/ToastContext';
import PageBackground from '../components/PageBackground';
import ScrollReveal from '../components/ScrollReveal';

const GIFT_TYPE_LABELS = {
  episode: 'Епизод',
  production: 'Продукция',
  subscription: 'Абонамент',
};

const STATUS_CONFIG = {
  pending: { label: 'Очакващ', className: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
  redeemed: { label: 'Използван', className: 'bg-green-500/20 text-green-400 border-green-500/30' },
  expired: { label: 'Изтекъл', className: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30' },
};

function StatusBadge({ status }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.expired;
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${config.className}`}>
      {config.label}
    </span>
  );
}

function GiftCardSkeleton() {
  return (
    <div className="glass-card p-5 space-y-3">
      <div className="flex items-center justify-between">
        <div className="h-4 w-24 rounded-full bg-[var(--bg-tertiary)] animate-pulse" />
        <div className="h-5 w-20 rounded-full bg-[var(--bg-tertiary)] animate-pulse" />
      </div>
      <div className="h-4 w-48 rounded-full bg-[var(--bg-tertiary)] animate-pulse" />
      <div className="h-3 w-32 rounded-full bg-[var(--bg-tertiary)] animate-pulse" />
    </div>
  );
}

function CopyCodeButton({ code }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-[var(--bg-tertiary)] hover:bg-[var(--bg-tertiary)]/80 text-xs font-mono text-[var(--text-secondary)] transition-colors cursor-pointer"
      title="Копирай код"
    >
      {code}
      {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
    </button>
  );
}

function SentGiftCard({ gift }) {
  const recipientName = gift.recipient_display_name || gift.recipient_username || null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card p-5 space-y-3"
    >
      <div className="flex items-center justify-between flex-wrap gap-2">
        <span className="text-sm font-semibold text-[var(--accent-gold)]">
          {GIFT_TYPE_LABELS[gift.gift_type] || gift.gift_type}
        </span>
        <StatusBadge status={gift.status} />
      </div>

      {gift.target_title && (
        <p className="text-sm text-[var(--text-primary)]">{gift.target_title}</p>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <CopyCodeButton code={gift.code} />
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-[var(--text-secondary)]">
        {recipientName && (
          <span>Получател: <span className="text-[var(--text-primary)]">{recipientName}</span></span>
        )}
        {gift.created_at && (
          <span>Създаден: {formatDate(gift.created_at)}</span>
        )}
        {gift.expires_at && gift.status === 'pending' && (
          <span>Изтича: {formatDate(gift.expires_at)}</span>
        )}
        {gift.redeemed_at && (
          <span>Използван на: {formatDate(gift.redeemed_at)}</span>
        )}
      </div>
    </motion.div>
  );
}

function ReceivedGiftCard({ gift }) {
  const senderName = gift.sender_display_name || gift.sender_username || 'Неизвестен';

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card p-5 space-y-3"
    >
      <div className="flex items-center justify-between flex-wrap gap-2">
        <span className="text-sm font-semibold text-[var(--accent-gold)]">
          {GIFT_TYPE_LABELS[gift.gift_type] || gift.gift_type}
        </span>
        <StatusBadge status={gift.status} />
      </div>

      {gift.target_title && (
        <p className="text-sm text-[var(--text-primary)]">{gift.target_title}</p>
      )}

      <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-[var(--text-secondary)]">
        <span>От: <span className="text-[var(--text-primary)]">{senderName}</span></span>
        {gift.redeemed_at && (
          <span>Използван на: {formatDate(gift.redeemed_at)}</span>
        )}
        {gift.created_at && (
          <span>Изпратен на: {formatDate(gift.created_at)}</span>
        )}
      </div>

      {gift.message && (
        <p className="text-sm text-[var(--text-secondary)] italic border-l-2 border-[var(--accent-gold)]/40 pl-3">
          {gift.message}
        </p>
      )}
    </motion.div>
  );
}

export default function GiftsPage() {
  const { showToast } = useToastContext();
  const [activeTab, setActiveTab] = useState('sent');
  const [sentGifts, setSentGifts] = useState([]);
  const [receivedGifts, setReceivedGifts] = useState([]);
  const [loadingSent, setLoadingSent] = useState(true);
  const [loadingReceived, setLoadingReceived] = useState(true);
  const [redeemCode, setRedeemCode] = useState('');
  const [redeeming, setRedeeming] = useState(false);

  useEffect(() => {
    let cancelled = false;

    api.get('/gifts/sent')
      .then((data) => {
        if (!cancelled) setSentGifts(Array.isArray(data) ? data : []);
      })
      .catch((err) => {
        console.error('Failed to load sent gifts:', err);
        if (!cancelled) showToast('Грешка при зареждане на изпратени подаръци.', 'error');
      })
      .finally(() => { if (!cancelled) setLoadingSent(false); });

    api.get('/gifts/received')
      .then((data) => {
        if (!cancelled) setReceivedGifts(Array.isArray(data) ? data : []);
      })
      .catch((err) => {
        console.error('Failed to load received gifts:', err);
        if (!cancelled) showToast('Грешка при зареждане на получени подаръци.', 'error');
      })
      .finally(() => { if (!cancelled) setLoadingReceived(false); });

    return () => { cancelled = true; };
  }, []);

  const handleRedeem = async (e) => {
    e.preventDefault();
    const code = redeemCode.trim();
    if (!code) return;

    setRedeeming(true);
    try {
      await api.post('/gifts/redeem', { code });
      showToast('Подаръкът беше използван успешно!', 'success');
      setRedeemCode('');

      // Refresh both lists
      const [sent, received] = await Promise.all([
        api.get('/gifts/sent').catch(() => sentGifts),
        api.get('/gifts/received').catch(() => receivedGifts),
      ]);
      setSentGifts(Array.isArray(sent) ? sent : []);
      setReceivedGifts(Array.isArray(received) ? received : []);
    } catch (err) {
      const message = err?.response?.data?.error || err?.message || 'Грешка при използване на кода.';
      showToast(message, 'error');
    } finally {
      setRedeeming(false);
    }
  };

  const tabs = [
    { key: 'sent', label: 'Изпратени', icon: Send },
    { key: 'received', label: 'Получени', icon: Inbox },
  ];

  const isLoading = activeTab === 'sent' ? loadingSent : loadingReceived;
  const gifts = activeTab === 'sent' ? sentGifts : receivedGifts;

  return (
    <div className="relative max-w-4xl mx-auto px-4 py-8 overflow-hidden min-h-screen flex flex-col gap-6">
      <PageBackground />

      {/* Page Title */}
      <ScrollReveal variant="fadeUp" className="mb-2">
        <div className="flex items-center gap-3">
          <Gift className="w-8 h-8 text-[var(--accent-gold)]" />
          <h1 className="text-3xl font-bold">Подаръци</h1>
        </div>
        <p className="text-[var(--text-secondary)] mt-1 ml-11">
          Използвай код за подарък или прегледай изпратените и получените подаръци.
        </p>
      </ScrollReveal>

      {/* Redeem Section */}
      <ScrollReveal variant="fadeUp" delay={0.1}>
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="glass-card p-6"
        >
          <h2 className="text-lg font-semibold mb-4">Използвай код за подарък</h2>
          <form onSubmit={handleRedeem} className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              value={redeemCode}
              onChange={(e) => setRedeemCode(e.target.value)}
              placeholder="Въведи код (напр. GIFT-XXXXXXXX)"
              className="flex-1 px-4 py-2.5 rounded-xl bg-[var(--bg-tertiary)] border border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]/50 focus:outline-none focus:ring-2 focus:ring-[var(--accent-cyan)]/40 transition-all font-mono text-sm"
              disabled={redeeming}
            />
            <button
              type="submit"
              disabled={redeeming || !redeemCode.trim()}
              className="px-6 py-2.5 rounded-xl bg-[var(--accent-gold)] text-black font-semibold text-sm hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
            >
              {redeeming ? 'Обработка...' : 'Използвай код'}
            </button>
          </form>
        </motion.div>
      </ScrollReveal>

      {/* Tabs */}
      <ScrollReveal variant="fadeUp" delay={0.15}>
        <div className="flex gap-2">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer ${
                  isActive
                    ? 'bg-[var(--accent-gold)]/15 text-[var(--accent-gold)] border border-[var(--accent-gold)]/30'
                    : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] border border-[var(--border)] hover:text-[var(--text-primary)]'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </ScrollReveal>

      {/* Gift List */}
      <div className="flex flex-col gap-4">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => <GiftCardSkeleton key={i} />)
        ) : gifts.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="glass-card p-8 text-center"
          >
            <p className="text-[var(--text-secondary)] text-sm">
              {activeTab === 'sent'
                ? 'Все още нямаш изпратени подаръци.'
                : 'Все още нямаш получени подаръци.'}
            </p>
          </motion.div>
        ) : (
          gifts.map((gift) =>
            activeTab === 'sent'
              ? <SentGiftCard key={gift.id} gift={gift} />
              : <ReceivedGiftCard key={gift.id} gift={gift} />
          )
        )}
      </div>
    </div>
  );
}
