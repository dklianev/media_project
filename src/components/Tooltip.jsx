import { useId } from 'react';

/**
 * Lightweight, CSS-only tooltip component.
 * Uses the group-hover pattern so it works even inside
 * containers that toggle opacity on hover.
 *
 * @param {string} text - The tooltip text
 * @param {'top'|'bottom'} position - Position (default: 'top')
 * @param {React.ReactNode} children
 */
export default function Tooltip({ text, position = 'top', align = 'center', children }) {
    if (!text) return children;

    const isTop = position === 'top';
    const tipId = useId();
    const alignClass = align === 'right'
        ? 'right-0 left-auto translate-x-0'
        : align === 'left'
            ? 'left-0 translate-x-0'
            : 'left-1/2 -translate-x-1/2';
    const arrowClass = align === 'right'
        ? 'right-3 translate-x-0'
        : align === 'left'
            ? 'left-3 translate-x-0'
            : 'left-1/2 -translate-x-1/2';
    const originClass = isTop
        ? align === 'right'
            ? 'origin-bottom-right'
            : align === 'left'
                ? 'origin-bottom-left'
                : 'origin-bottom'
        : align === 'right'
            ? 'origin-top-right'
            : align === 'left'
                ? 'origin-top-left'
                : 'origin-top';

    return (
        <span
            className="group/tip relative inline-flex z-30 group-hover/tip:z-[90] group-focus-within/tip:z-[90]"
            aria-describedby={tipId}
        >
            {children}
            <span
                id={tipId}
                role="tooltip"
                className={`
          absolute ${isTop ? 'bottom-full mb-2' : 'top-full mt-2'} ${alignClass} ${originClass} z-[90]
          pointer-events-none
          opacity-0 scale-90 group-hover/tip:opacity-100 group-hover/tip:scale-100
          group-focus-within/tip:opacity-100 group-focus-within/tip:scale-100
          transition-all duration-200 ease-out
        `}
            >
                <div className="whitespace-nowrap rounded-lg bg-[#0c1020]/95 backdrop-blur-md border border-[var(--accent-gold)]/20 px-3 py-1.5 text-xs font-medium text-white/90 shadow-[0_4px_16px_rgba(0,0,0,0.4)]">
                    {text}
                    {/* Arrow */}
                    <div
                        className={`absolute ${arrowClass} w-2 h-2 rotate-45 bg-[#0c1020]/95 border-[var(--accent-gold)]/20 ${isTop
                                ? 'top-full -mt-1 border-r border-b'
                                : 'bottom-full -mb-1 border-l border-t'
                            }`}
                    />
                </div>
            </span>
        </span>
    );
}
