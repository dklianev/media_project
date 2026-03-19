import { LazyMotion, domMax, AnimatePresence, m, useScroll, useTransform } from 'framer-motion';

export function MotionProvider({ children }) {
  return (
    <LazyMotion strict features={domMax}>
      {children}
    </LazyMotion>
  );
}

export const motion = m;

export {
  AnimatePresence,
  useScroll,
  useTransform,
};
