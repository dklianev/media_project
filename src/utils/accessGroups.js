export function getProductionAccessGroup(production) {
  const rawGroup = String(production?.access_group || '').trim().toLowerCase();
  const requiredTier = Number(production?.required_tier || 0);

  if (rawGroup === 'trailer') return 'trailer';
  if (rawGroup === 'free') return 'free';
  if (rawGroup === 'subscription') {
    return requiredTier > 0 ? 'subscription' : 'free';
  }

  return requiredTier > 0 ? 'subscription' : 'free';
}
