import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Heart, Trash2 } from 'lucide-react';
import { api } from '../utils/api.js';

const TYPE_LABELS = {
  episode: 'Епизод',
  production: 'Продукция',
};

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('bg-BG', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function formatPrice(price) {
  if (price == null) return 'Безплатно';
  const n = Number(price);
  if (!Number.isFinite(n) || n <= 0) return 'Безплатно';
  return `${n.toFixed(2)} лв.`;
}

export default function WishlistPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [removingIds, setRemovingIds] = useState(new Set());

  useEffect(() => {
    let active = true;

    api.get('/wishlist')
      .then((data) => {
        if (!active) return;
        setItems(Array.isArray(data) ? data : []);
        setError('');
      })
      .catch((err) => {
        if (!active) return;
        console.error('Failed to load wishlist:', err);
        setError('Неуспешно зареждане на списъка с желания.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, []);

  async function handleRemove(targetType, targetId) {
    const key = `${targetType}-${targetId}`;
    setRemovingIds((prev) => new Set(prev).add(key));

    try {
      await api.delete(`/wishlist/${targetType}/${targetId}`);
      setItems((prev) => prev.filter(
        (item) => !(item.target_type === targetType && item.target_id === targetId),
      ));
    } catch (err) {
      console.error('Failed to remove wishlist item:', err);
    } finally {
      setRemovingIds((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
        <motion.h1
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="mb-8 text-3xl font-bold tracking-tight sm:text-4xl"
        >
          Списък с желания
        </motion.h1>

        {loading && (
          <div className="flex items-center justify-center py-24">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white" />
          </div>
        )}

        {!loading && error && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="rounded-lg bg-red-900/40 px-4 py-3 text-red-300"
          >
            {error}
          </motion.p>
        )}

        {!loading && !error && items.length === 0 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4 }}
            className="flex flex-col items-center justify-center py-24 text-zinc-400"
          >
            <Heart className="mb-4 h-12 w-12 opacity-40" />
            <p className="text-lg">Списъкът ти с желания е празен</p>
          </motion.div>
        )}

        {!loading && !error && items.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
          >
            <AnimatePresence mode="popLayout">
              {items.map((item) => {
                const key = `${item.target_type}-${item.target_id}`;
                const isRemoving = removingIds.has(key);

                return (
                  <motion.div
                    key={key}
                    layout
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ duration: 0.25 }}
                    className="flex flex-col justify-between rounded-xl border border-zinc-800 bg-zinc-900 p-5"
                  >
                    <div>
                      <div className="mb-3 flex items-start justify-between gap-2">
                        <h2 className="text-lg font-semibold leading-snug">
                          {item.title || 'Без заглавие'}
                        </h2>
                        <span
                          className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            item.target_type === 'production'
                              ? 'bg-purple-900/60 text-purple-300'
                              : 'bg-blue-900/60 text-blue-300'
                          }`}
                        >
                          {TYPE_LABELS[item.target_type] || item.target_type}
                        </span>
                      </div>

                      {item.target_type === 'episode' && item.production_title && (
                        <p className="mb-2 text-sm text-zinc-400">
                          {item.production_title}
                        </p>
                      )}

                      <div className="mb-4 flex items-center gap-4 text-sm text-zinc-400">
                        <span className="font-medium text-white">
                          {formatPrice(item.current_price)}
                        </span>
                        <span>
                          {formatDate(item.created_at)}
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={isRemoving}
                      onClick={() => handleRemove(item.target_type, item.target_id)}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-300 transition-colors hover:border-red-800 hover:bg-red-900/40 hover:text-red-300 disabled:opacity-50"
                    >
                      <Trash2 className="h-4 w-4" />
                      {isRemoving ? 'Премахване...' : 'Премахни'}
                    </button>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </motion.div>
        )}
      </div>
    </div>
  );
}
