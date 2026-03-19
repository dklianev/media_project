import { useRef, useState, useCallback, useEffect } from 'react';
import { motion } from '@/lib/motion';

export default function TiltCard({
  intensity = 1,
  glare = true,
  className = '',
  children,
  ...props
}) {
  const ref = useRef(null);
  const [tilt, setTilt] = useState({ rotateX: 0, rotateY: 0 });
  const [glarePos, setGlarePos] = useState({ x: 50, y: 50 });
  const [isHovered, setIsHovered] = useState(false);
  const rafRef = useRef(null);

  const handleMouseMove = useCallback((e) => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;
      const maxDeg = 8 * intensity;
      setTilt({
        rotateX: (0.5 - y) * maxDeg,
        rotateY: (x - 0.5) * maxDeg,
      });
      setGlarePos({ x: x * 100, y: y * 100 });
    });
  }, [intensity]);

  const handleMouseLeave = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    setTilt({ rotateX: 0, rotateY: 0 });
    setIsHovered(false);
  }, []);

  // Cleanup pending rAF on unmount to prevent setState on unmounted component
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <div style={{ perspective: '800px' }}>
      <motion.div
        ref={ref}
        className={`relative ${className}`}
        animate={tilt}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        onMouseMove={handleMouseMove}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={handleMouseLeave}
        style={{ transformStyle: 'preserve-3d' }}
        {...props}
      >
        {children}

        {/* Glare overlay */}
        {glare && (
          <div
            className="absolute inset-0 z-10 rounded-[inherit] pointer-events-none transition-opacity duration-300"
            style={{
              opacity: isHovered ? 1 : 0,
              background: `radial-gradient(circle at ${glarePos.x}% ${glarePos.y}%, rgba(255,255,255,0.07) 0%, transparent 60%)`,
            }}
          />
        )}
      </motion.div>
    </div>
  );
}
