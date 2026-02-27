import { motion } from 'framer-motion';
import { Crown, Star } from 'lucide-react';

export default function SubscriptionBadge({ planName, tierLevel }) {
  if (!planName) {
    return (
      <motion.span
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="badge badge-free"
      >
        Безплатен достъп
      </motion.span>
    );
  }

  const isPremium = tierLevel >= 2;

  return (
    <motion.span
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className={`badge ${isPremium ? 'badge-premium border-glow' : 'badge-gold'}`}
    >
      {isPremium ? <Star className="w-3 h-3" /> : <Crown className="w-3 h-3" />}
      {planName}
    </motion.span>
  );
}
