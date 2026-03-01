import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Clapperboard, Crown, Heart, Lock, Play } from 'lucide-react';
import { getAccessLabelSync } from '../utils/accessLabels';
import { getProductionAccessGroup } from '../utils/accessGroups';
import Tooltip from './Tooltip';

const BADGE_CLS = {
  free: 'badge-free',
  trailer: 'badge-premium',
  subscription: 'badge-gold',
};

/* Spring config for hover — fast response, slight overshoot, smooth settle */
const hoverSpring = { type: 'spring', stiffness: 260, damping: 20 };
const tapSpring = { type: 'spring', stiffness: 400, damping: 25 };

export default function ProductionCard({ production, isInWatchlist, onToggleWatchlist }) {
  const { title, slug, description, thumbnail_url, required_tier, has_access } = production;
  const group = getProductionAccessGroup(production);
  const accessLabel = getAccessLabelSync(group);
  const accessCls = BADGE_CLS[group] || BADGE_CLS.subscription;

  return (
    <Link to={`/productions/${slug}`} className="no-underline block">
      <motion.article
        className="group/card glass-card relative isolate rounded-2xl border border-[var(--border)] shadow-premium-sm transition-all duration-300 hover:border-[var(--accent-gold)]/40 hover:shadow-[0_12px_40px_rgba(212,175,55,0.15),0_0_0_1px_rgba(212,175,55,0.08)] hover:z-[60] focus-within:z-[60]"
        whileHover={{ y: -6 }}
        whileTap={{ scale: 0.97 }}
        transition={hoverSpring}
      >
        {/* Top gold accent line */}
        <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-[var(--accent-gold)] to-transparent opacity-0 group-hover/card:opacity-80 transition-opacity duration-500 z-10" />

        {/* Bottom glow */}
        <div className="absolute inset-x-4 -bottom-2 h-8 bg-[var(--accent-gold)]/10 blur-xl rounded-full opacity-0 group-hover/card:opacity-100 transition-opacity duration-700 z-0" />

        {/* Thumbnail */}
        <div className="relative aspect-[16/10] overflow-hidden rounded-t-[15px]">
          {thumbnail_url ? (
            <img
              src={thumbnail_url}
              alt={title}
              loading="lazy"
              decoding="async"
              className="w-full h-full object-cover transition-transform duration-700 ease-out group-hover/card:scale-110"
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-[var(--bg-secondary)] via-[var(--bg-tertiary)] to-[var(--bg-secondary)]">
              <Clapperboard aria-hidden="true" className="w-10 h-10 text-[var(--text-muted)] opacity-60 mb-3" />
              <p className="text-sm text-[var(--text-primary)] font-medium px-4 text-center line-clamp-2 drop-shadow-sm">{title}</p>
            </div>
          )}

          {/* Gradient overlays */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-t from-[var(--accent-gold)]/8 via-transparent to-transparent opacity-0 group-hover/card:opacity-100 transition-opacity duration-500" />

          {/* Cinematic light-sweep shine */}
          <div className="absolute inset-0 pointer-events-none opacity-0 group-hover/card:opacity-100 transition-opacity duration-500 overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/8 to-transparent translate-x-[-100%] group-hover/card:translate-x-[100%] transition-transform duration-1000 ease-in-out" />
          </div>

          {/* Access badges */}
          <div className="absolute top-3 right-3 flex flex-col items-end gap-1.5">
            <span className={`badge ${accessCls}`}>
              {group === 'subscription' && <Crown aria-hidden="true" className="w-3 h-3" />}
              {accessLabel}
            </span>
            {group === 'subscription' && (
              <span className="rounded-full border border-white/20 bg-black/40 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/90">
                Ниво {required_tier}
              </span>
            )}
          </div>

          {/* Lock badge */}
          {!has_access && (
            <div className="absolute top-3 left-3">
              <span className="inline-flex items-center gap-1 rounded-full border border-white/20 bg-black/45 px-2 py-1 text-[11px] font-semibold text-white/85">
                <Lock aria-hidden="true" className="w-3 h-3" />
                Заключено
              </span>
            </div>
          )}

          {/* Centered play button — springs in on hover */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <motion.div
              className={`w-14 h-14 rounded-full flex items-center justify-center border backdrop-blur-sm opacity-0 scale-75 transition-all duration-500 group-hover/card:opacity-100 group-hover/card:scale-100 ${has_access
                ? 'border-[var(--accent-gold)]/50 bg-[var(--accent-gold)]/20 shadow-[0_0_40px_rgba(212,175,55,0.4)]'
                : 'border-white/25 bg-black/45'
                }`}
              initial={false}
              animate={{}}
              transition={{ type: 'spring', stiffness: 400, damping: 15 }}
              style={{ pointerEvents: 'none' }}
            >
              {has_access ? (
                <Play aria-hidden="true" className="w-6 h-6 text-[var(--accent-gold-light)] ml-0.5" />
              ) : (
                <Lock aria-hidden="true" className="w-5 h-5 text-white/70" />
              )}
            </motion.div>
          </div>

          {/* Corner play/lock indicator */}
          <div
            className={`absolute bottom-3 right-3 w-10 h-10 rounded-full flex items-center justify-center border border-white/25 bg-black/45 transition-all duration-500 group-hover/card:opacity-0 group-hover/card:translate-y-2 ${has_access ? 'opacity-100' : 'opacity-65'}`}
          >
            {has_access ? <Play aria-hidden="true" className="w-4 h-4 text-[var(--accent-gold-light)] ml-0.5" /> : <Lock aria-hidden="true" className="w-4 h-4 text-white/70" />}
          </div>
        </div>

        {/* Info */}
        <div className="relative p-4">
          <div className="flex items-start justify-between gap-2 mb-2">
            <h3 className="text-[15px] font-semibold leading-snug line-clamp-2">{title}</h3>
            {onToggleWatchlist && (
              <Tooltip text={isInWatchlist ? 'Премахни от любими' : 'Добави в любими'} align="right">
                <motion.button
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleWatchlist(production.id); }}
                  className={`relative shrink-0 mt-0.5 p-2 rounded-full z-20 transition-all duration-300 ${isInWatchlist
                    ? 'bg-[var(--danger)]/15 ring-1 ring-[var(--danger)]/30 shadow-[0_0_12px_rgba(239,68,68,0.2)]'
                    : 'hover:bg-white/10'
                    }`}
                  aria-label={isInWatchlist ? 'Премахни от любими' : 'Добави в любими'}
                  whileHover={{ scale: 1.2 }}
                  whileTap={{ scale: 0.7 }}
                  transition={tapSpring}
                >
                  <Heart aria-hidden="true" className={`w-5 h-5 transition-all duration-300 ${isInWatchlist ? 'fill-[var(--danger)] text-[var(--danger)] drop-shadow-[0_0_4px_rgba(239,68,68,0.5)]' : 'text-[var(--text-muted)]'}`} />
                </motion.button>
              </Tooltip>
            )}
          </div>
          <p className="text-sm text-[var(--text-secondary)] line-clamp-2 min-h-10">
            {description || 'Без описание'}
          </p>
          <div className="mt-3">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all duration-300 ${has_access
                ? 'bg-[var(--accent-gold)]/18 text-[var(--accent-gold-light)] border border-[var(--accent-gold)]/35 group-hover/card:bg-[var(--accent-gold)]/30 group-hover/card:border-[var(--accent-gold)]/60 group-hover/card:shadow-[0_0_12px_rgba(212,175,55,0.15)]'
                : 'bg-white/5 text-[var(--text-muted)] border border-white/10'
                }`}
            >
              {has_access ? <Play aria-hidden="true" className="w-3.5 h-3.5" /> : <Lock aria-hidden="true" className="w-3.5 h-3.5" />}
              {has_access ? 'Гледай сега' : 'Изисква абонамент'}
            </span>
          </div>
        </div>
      </motion.article>
    </Link>
  );
}
