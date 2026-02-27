// ── Standardized spring configs ──
export const spring = {
  snappy: { type: 'spring', stiffness: 400, damping: 25 },
  gentle: { type: 'spring', stiffness: 260, damping: 20 },
  bouncy: { type: 'spring', stiffness: 300, damping: 15 },
};

// ── Standard easing ──
export const ease = {
  premium: [0.16, 1, 0.3, 1],
};

// ── Button micro-interaction preset ──
export const buttonMotion = {
  whileHover: { scale: 1.03, y: -1 },
  whileTap: { scale: 0.97 },
  transition: { type: 'spring', stiffness: 400, damping: 25 },
};

// ── Card hover preset ──
export const cardHover = {
  whileHover: { y: -4, boxShadow: '0 8px 24px rgba(212,175,55,0.1)' },
  whileTap: { scale: 0.98 },
  transition: { type: 'spring', stiffness: 260, damping: 20 },
};

// ── Admin button preset (lighter) ──
export const adminButtonMotion = {
  whileHover: { scale: 1.1 },
  whileTap: { scale: 0.9 },
  transition: { type: 'spring', stiffness: 400, damping: 25 },
};

// ── Page transition (for AnimatePresence) ──
export const pageTransition = {
  initial: { opacity: 0, y: 8, scale: 0.995, filter: 'blur(6px)' },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    filter: 'blur(0px)',
    transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] },
  },
  exit: {
    opacity: 0,
    y: -6,
    filter: 'blur(4px)',
    transition: { duration: 0.25, ease: [0.16, 1, 0.3, 1] },
  },
};
