import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from '@/lib/motion';
import { api } from '../utils/api';

const REACTIONS = [
  { type: 'like', emoji: '👍', label: 'Харесвам' },
  { type: 'love', emoji: '❤️', label: 'Обичам' },
  { type: 'haha', emoji: '😂', label: 'Смешно' },
  { type: 'wow', emoji: '😮', label: 'Уау' },
  { type: 'sad', emoji: '😢', label: 'Тъжно' },
  { type: 'angry', emoji: '😡', label: 'Ядосан' },
];

export default function ReactionBar({ episodeId, reactions: initialReactions, userReaction: initialUserReaction }) {
  const [reactions, setReactions] = useState(initialReactions || []);
  const [userReaction, setUserReaction] = useState(initialUserReaction);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setReactions(initialReactions || []);
    setUserReaction(initialUserReaction || null);
  }, [episodeId, initialReactions, initialUserReaction]);

  const handleReact = async (type) => {
    if (loading) return;
    setLoading(true);

    try {
      setError('');
      let result;
      if (userReaction === type) {
        // Remove reaction
        result = await api.delete(`/episodes/${episodeId}/react`);
      } else {
        // Add/change reaction
        result = await api.post(`/episodes/${episodeId}/react`, { reaction_type: type });
      }
      setReactions(result.reactions);
      setUserReaction(result.user_reaction);
    } catch (err) {
      setError(err.message || 'Неуспешна реакция. Опитай отново.');
    } finally {
      setLoading(false);
    }
  };

  const getCount = (type) => {
    const r = reactions.find((r) => r.reaction_type === type);
    return r ? r.count : 0;
  };

  const totalReactions = reactions.reduce((sum, r) => sum + r.count, 0);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {REACTIONS.map(({ type, emoji, label }) => {
        const count = getCount(type);
        const isActive = userReaction === type;

        return (
          <motion.button
            key={type}
            onClick={() => handleReact(type)}
            disabled={loading}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm ${isActive
                ? 'bg-[var(--accent-gold)]/16 border border-[var(--accent-gold)] text-[var(--accent-gold-light)]'
                : 'bg-[var(--bg-tertiary)] border border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--border-light)]'
              }`}
            whileHover={{ scale: 1.08, y: -2 }}
            whileTap={{ scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 400, damping: 15 }}
            title={label}
          >
            <span className="text-base">{emoji}</span>
            {count > 0 && (
              <AnimatePresence mode="wait">
                <motion.span
                  key={count}
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="text-xs font-medium"
                >
                  {count}
                </motion.span>
              </AnimatePresence>
            )}
          </motion.button>
        );
      })}

      {totalReactions > 0 && (
        <span className="text-xs text-[var(--text-muted)] ml-2">
          {totalReactions} реакции
        </span>
      )}

      {error && <span className="text-xs text-[var(--danger)] ml-2">{error}</span>}
    </div>
  );
}
