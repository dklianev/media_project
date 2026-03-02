import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { AlertCircle, Crown, Moon, Sparkles, Sun, TvMinimalPlay, Waves } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { getPublicSettings } from '../utils/settings';
import PageBackground from '../components/PageBackground';

function DiscordEyesIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03z"
      />
      <circle cx="8.95" cy="11.7" r="1.45" fill="#2f3ea7" />
      <circle cx="15.05" cy="11.7" r="1.45" fill="#2f3ea7" />
    </svg>
  );
}

/* ── Floating particles canvas ── */
function FloatingParticles({ theme }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let animId;
    let particles = [];

    const resize = () => {
      const ratio = window.devicePixelRatio || 1;
      canvas.width = canvas.offsetWidth * ratio;
      canvas.height = canvas.offsetHeight * ratio;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(ratio, ratio);
    };
    resize();
    window.addEventListener('resize', resize);

    const TOTAL = 38;
    for (let i = 0; i < TOTAL; i++) {
      particles.push({
        x: Math.random() * canvas.offsetWidth,
        y: Math.random() * canvas.offsetHeight,
        r: Math.random() * 1.8 + 0.4,
        dx: (Math.random() - 0.5) * 0.25,
        dy: (Math.random() - 0.5) * 0.25,
        alpha: Math.random() * 0.35 + 0.08,
        gold: Math.random() > 0.6,
      });
    }

    const draw = () => {
      ctx.clearRect(0, 0, canvas.offsetWidth, canvas.offsetHeight);
      for (const p of particles) {
        p.x += p.dx;
        p.y += p.dy;
        if (p.x < 0) p.x = canvas.offsetWidth;
        if (p.x > canvas.offsetWidth) p.x = 0;
        if (p.y < 0) p.y = canvas.offsetHeight;
        if (p.y > canvas.offsetHeight) p.y = 0;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        const isLight = theme === 'light';
        const alpha = isLight ? Math.min(p.alpha * 1.6, 1) : p.alpha;

        ctx.fillStyle = p.gold
          ? `rgba(212,175,55,${alpha})`
          : `rgba(75,197,255,${alpha * 0.7})`;
        ctx.fill();
      }
      animId = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
    };
  }, [theme]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none z-0"
      aria-hidden="true"
    />
  );
}

/* ── Stagger variants ── */
const containerV = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.09, delayChildren: 0.15 } },
};
const itemV = {
  hidden: { opacity: 0, y: 18 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] } },
};

export default function LoginPage() {
  const { theme, toggleTheme } = useTheme();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [settings, setSettings] = useState({});
  const authError = searchParams.get('error');

  useEffect(() => {
    if (!loading && user) {
      if (!user.character_name) navigate('/character-name');
      else navigate('/');
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    getPublicSettings().then(setSettings).catch(() => setSettings({}));
  }, []);

  const handleDiscordLogin = () => {
    window.location.href = '/api/auth/discord';
  };

  return (
    <div className="relative min-h-screen overflow-hidden px-4 py-10 flex items-center justify-center">
      <div className="absolute inset-0" style={{ background: 'var(--gradient-hero)' }} />
      <PageBackground variant="hero" />
      <FloatingParticles theme={theme} />

      {/* Theme Toggle Button */}
      <motion.button
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        whileHover={{ scale: 1.1, backgroundColor: 'rgba(255, 255, 255, 0.15)' }}
        whileTap={{ scale: 0.9 }}
        onClick={toggleTheme}
        className="fixed top-6 right-6 z-50 p-3 rounded-full border border-[var(--border)] bg-[var(--bg-secondary)]/40 backdrop-blur-md shadow-premium-sm text-[var(--accent-gold-light)]"
        title={theme === 'dark' ? 'Превключи към Светла тема' : 'Превключи към Тъмна тема'}
      >
        {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5 text-[#5865F2]" />}
      </motion.button>

      {/* Content Teaser Marquee (Background) */}
      <div className="login-marquee-container absolute inset-x-0 top-[60%] -translate-y-1/2 overflow-hidden pointer-events-none select-none flex items-center z-0">
        <motion.div
          animate={{ x: [0, -2000] }}
          transition={{ repeat: Infinity, duration: 60, ease: 'linear' }}
          className="flex gap-12 whitespace-nowrap text-[8rem] sm:text-[12rem] font-black uppercase tracking-tighter"
        >
          <span>{settings.login_marquee_text || 'ЕКСКЛУЗИВЕН КАТАЛОГ СЪДЪРЖАНИЕ ПРЕМИУМ ЕПИЗОДИ'}</span>
          <span>{settings.login_marquee_text || 'ЕКСКЛУЗИВЕН КАТАЛОГ СЪДЪРЖАНИЕ ПРЕМИУМ ЕПИЗОДИ'}</span>
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16, filter: 'blur(8px)' }}
        animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
        transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 w-full max-w-6xl"
      >
        <div className="premium-panel animated-border p-3 sm:p-4">
          <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-4">

            {/* Left — Main Auth Section */}
            <motion.section
              className="glass-card p-8 sm:p-10 flex flex-col"
              variants={containerV}
              initial="hidden"
              animate="visible"
            >
              <motion.div variants={itemV} className="mb-5 inline-flex w-fit items-center gap-2 rounded-full border border-[var(--accent-gold)]/35 bg-[var(--accent-gold)]/12 px-3 py-1 text-xs uppercase tracking-[0.2em] text-[var(--accent-gold-light)]">
                <Sparkles className="w-3.5 h-3.5" />
                {settings.landing_badge_text || 'Премиум стрийминг'}
              </motion.div>

              <motion.div variants={itemV} className="flex items-center gap-4 mb-6">
                <motion.div
                  className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#f6e4b2] to-[var(--accent-gold)] text-[#0a0b11] flex items-center justify-center glow-ring"
                  whileHover={{ scale: 1.1, rotate: 4 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 15 }}
                >
                  <Crown className="w-7 h-7" />
                </motion.div>
                <div>
                  <h1 className="font-display text-5xl text-gradient-premium">
                    {settings.landing_title || settings.site_name || 'Elite Capital'}
                  </h1>
                  <p className="text-sm text-[var(--text-secondary)] mt-1">
                    {settings.landing_subtitle || 'Премиум стрийминг платформа за ексклузивно съдържание'}
                  </p>
                </div>
              </motion.div>

              <motion.p variants={itemV} className="text-[var(--text-primary)]/90 text-lg mb-10 max-w-xl leading-relaxed">
                {settings.landing_description || 'Влез с Discord и получи персонализиран достъп до съдържанието.'}
              </motion.p>

              {authError && (
                <motion.div
                  variants={itemV}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="mb-8 rounded-xl border border-[var(--danger)]/35 bg-[var(--danger)]/8 p-4 text-sm text-[#ffcccc] flex items-start gap-3 backdrop-blur-sm"
                >
                  <div className="p-1.5 rounded-lg bg-[var(--danger)]/20 text-[var(--danger)] mt-0.5">
                    <AlertCircle className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="font-bold text-[#ffb3b3] tracking-wide mb-1 uppercase text-[10px]">Грешка при вход</p>
                    <p className="opacity-95 leading-relaxed">
                      {authError === 'rate_limited'
                        ? 'Твърде много опити за вход. Моля, изчакайте малко и опитайте отново.'
                        : authError === 'invalid_exchange'
                          ? 'Сесията не можа да бъде установена. Моля, опитайте отново.'
                          : `Възникна системна грешка: ${authError}`}
                    </p>
                  </div>
                </motion.div>
              )}

              <motion.div variants={itemV} className="mt-6">
                <motion.button
                  onClick={handleDiscordLogin}
                  className={`group relative flex items-center justify-center gap-3 rounded-xl px-10 py-4 text-base font-bold transition-all w-full sm:w-auto overflow-hidden ${theme === 'light'
                    ? 'bg-[#5865F2] hover:bg-[#4752C4] border border-[#4752C4] text-white shadow-premium-md'
                    : 'bg-gradient-to-br from-[#5865F2] to-[#404EED] border border-[var(--accent-gold)]/50 text-white shadow-premium-md'
                    }`}
                  whileHover={{
                    y: -4,
                    scale: 1.02,
                    boxShadow: theme === 'light'
                      ? '0 15px 30px -10px rgba(88,101,242,0.2), 0 0 15px rgba(88,101,242,0.1)'
                      : '0 20px 40px -10px rgba(88, 101, 242, 0.5), inset 0 0 20px rgba(212, 175, 55, 0.3)'
                  }}
                  whileTap={{ scale: 0.97 }}
                >
                  {/* Subtle Shimmer for Dark Mode */}
                  {theme === 'dark' && (
                    <div className="absolute inset-0 pointer-events-none overflow-hidden">
                      <div className="absolute top-[-20%] left-[-40%] w-[35%] h-[160%] rotate-[22deg] bg-gradient-to-b from-transparent via-white/10 to-transparent animate-[shimmer-sweep_4s_infinite]" />
                    </div>
                  )}

                  <div className="flex items-center justify-center h-6 w-6 relative z-10 transition-transform group-hover:scale-110">
                    <svg className="w-full h-full" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M20.317 4.36981C18.799 3.66981 17.158 3.14481 15.441 2.82581C15.409 2.81981 15.378 2.83481 15.361 2.86481C15.15 3.24281 14.916 3.73481 14.752 4.12281C12.893 3.84481 11.05 3.84481 9.213 4.12281C9.049 3.73481 8.809 3.24281 8.598 2.86481C8.581 2.83481 8.55 2.81981 8.518 2.82581C6.801 3.14481 5.16 3.66981 3.642 4.36981C3.628 4.37581 3.618 4.38681 3.612 4.40081C0.551 8.98181 -0.285 13.4538 0.117 17.8738C0.119 17.8968 0.133 17.9178 0.153 17.9328C2.174 19.4218 4.093 20.3248 5.981 20.9138C6.012 20.9238 6.046 20.9128 6.066 20.8858C6.516 20.2698 6.918 19.6108 7.261 18.9148C7.283 18.8718 7.262 18.8198 7.218 18.8028C6.568 18.5568 5.946 18.2538 5.352 17.9018C5.302 17.8728 5.299 17.8018 5.346 17.7688C5.474 17.6728 5.602 17.5738 5.725 17.4728C5.751 17.4528 5.787 17.4478 5.817 17.4618C9.648 19.2128 13.784 19.2128 17.567 17.4618C17.597 17.4468 17.633 17.4518 17.659 17.4718C17.781 17.5718 17.909 17.6718 18.038 17.7678C18.085 17.8018 18.083 17.8728 18.033 17.9018C17.439 18.2538 16.816 18.5568 16.167 18.8018C16.123 18.8188 16.102 18.8708 16.124 18.9138C16.468 19.6098 16.869 20.2688 17.318 20.8838C17.338 20.9108 17.371 20.9228 17.403 20.9128C19.301 20.3238 21.23 19.4198 23.239 17.9318C23.259 17.9168 23.273 17.8968 23.275 17.8728C23.755 12.7938 22.464 8.35681 20.347 4.39981C20.341 4.38681 20.331 4.37581 20.317 4.36981ZM8.02 15.3318C6.832 15.3318 5.854 14.2418 5.854 12.9038C5.854 11.5658 6.81 10.4758 8.02 10.4758C9.231 10.4758 10.207 11.5658 10.187 12.9038C10.187 14.2418 9.221 15.3318 8.02 15.3318ZM15.993 15.3318C14.805 15.3318 13.827 14.2418 13.827 12.9038C13.827 11.5658 14.782 10.4758 15.993 10.4758C17.204 10.4758 18.18 11.5658 18.16 12.9038C18.16 14.2418 17.194 15.3318 15.993 15.3318Z" fill="white" />
                    </svg>
                  </div>
                  <span className="relative z-10 tracking-wide">{settings.landing_button_text || 'Влез с Discord'}</span>
                </motion.button>
              </motion.div>

              <motion.p variants={itemV} className="text-xs text-[var(--text-muted)] mt-auto pt-8 opacity-80">
                {settings.landing_disclaimer || 'Достъпът до съдържанието зависи от активния план.'}
              </motion.p>
            </motion.section>

            {/* Right — Features Section */}
            <motion.section
              className="glass-card p-6 pt-8 sm:p-8 sm:pt-10 lg:p-9 lg:pt-12 relative overflow-hidden flex flex-col gap-7"
              variants={containerV}
              initial="hidden"
              animate="visible"
            >
              <div className="absolute -right-16 -top-10 h-40 w-40 rounded-full bg-[var(--accent-gold)]/16 blur-2xl float-slow" />
              <div className="absolute -left-12 bottom-4 h-40 w-40 rounded-full bg-[var(--accent-cyan)]/16 blur-2xl float-medium" />

              <motion.h2 variants={itemV} className="text-2xl font-semibold">
                {settings.landing_reason_title || `Защо ${settings.site_name || 'Elite Capital'}`}
              </motion.h2>
              <div className="space-y-4">
                {[
                  { label: 'Съдържание', text: settings.landing_feature_1 || 'Премиум каталози и оригинални формати' },
                  { label: 'Планове', text: settings.landing_feature_2 || 'Гъвкави абонаменти и промо кодове' },
                  { label: 'Активация', text: settings.landing_feature_3 || 'Бърза обработка на заявки от екипа' },
                ].map((feat, i) => (
                  <motion.div key={feat.label} variants={itemV}
                    className="metric-card group/feature"
                    whileHover={{
                      y: -5,
                      scale: 1.02,
                      boxShadow: '0 12px 30px -10px rgba(212,175,55,0.15)',
                      borderColor: 'rgba(212,175,55,0.3)'
                    }}
                    whileTap={{ scale: 0.98 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                  >
                    <p className="text-xs uppercase tracking-[0.15em] text-[var(--text-muted)] mb-1">{feat.label}</p>
                    <p className="font-semibold">{feat.text}</p>
                  </motion.div>
                ))}
              </div>

              <motion.div
                variants={itemV}
                className="mt-8 sm:mt-10 flex justify-center lg:justify-start"
              >
                <motion.div
                  initial={{ opacity: 0.8, y: 0 }}
                  animate={{ y: [0, -6, 0] }}
                  transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }}
                  whileHover={{
                    scale: 1.05,
                    backgroundColor: 'var(--bg-secondary)',
                    borderColor: 'rgba(212,175,55,0.4)',
                    boxShadow: '0 0 20px rgba(212,175,55,0.1)'
                  }}
                  whileTap={{ scale: 0.95 }}
                  className="cursor-default rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] p-3.5 px-5 inline-flex items-center gap-3 transition-colors shadow-sm"
                >
                  <div className="relative">
                    <TvMinimalPlay className="w-4 h-4 text-[var(--accent-gold-light)] relative z-10" />
                    <div className="absolute inset-0 bg-[var(--accent-gold)]/20 blur-md rounded-full animate-pulse" />
                  </div>
                  <span className="text-sm font-medium tracking-wide">{settings.login_floating_badge || 'Нови епизоди всяка седмица'}</span>
                </motion.div>
              </motion.div>

              <motion.div variants={itemV} className="mt-7 sm:mt-8 inline-flex items-center gap-2 text-xs text-[var(--text-muted)] uppercase tracking-[0.15em]">
                <Waves className="w-3.5 h-3.5 text-[var(--accent-gold-light)]" />
                {settings.login_bottom_text || 'Кино изживяване на ново ниво'}
              </motion.div>
            </motion.section>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
