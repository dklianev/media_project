export default function PageBackground({ variant = 'default' }) {
  return (
    <>
      <div className="aurora-bg" />
      <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-[var(--accent-gold)]/12 blur-3xl" />
      <div className="pointer-events-none absolute -left-20 bottom-1/4 h-60 w-60 rounded-full bg-[var(--accent-cyan)]/10 blur-3xl" />
      {variant === 'hero' && (
        <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-0 h-48 w-96 rounded-full bg-[var(--accent-crimson)]/8 blur-3xl" />
      )}
    </>
  );
}
