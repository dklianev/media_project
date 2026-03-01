const EP_ACCESS_GROUPS = ['inherit', 'free', 'trailer', 'subscription'];
const PROD_ACCESS_GROUPS = ['free', 'trailer', 'subscription'];

export function normalizeEpisodeGroup(value, fallback = 'inherit') {
    if (!value) return fallback;
    const normalized = String(value).trim().toLowerCase();
    return EP_ACCESS_GROUPS.includes(normalized) ? normalized : fallback;
}

export function normalizeProductionGroup(value, fallback = 'subscription') {
    if (!value) return fallback;
    const normalized = String(value).trim().toLowerCase();
    return PROD_ACCESS_GROUPS.includes(normalized) ? normalized : fallback;
}

export function resolveProductionGroup(value, requiredTier, fallback = 'subscription') {
    const normalized = normalizeProductionGroup(value, fallback);
    return normalized === 'subscription' && Number(requiredTier || 0) <= 0 ? 'free' : normalized;
}

export function hasGroupAccess(group, userTier, isAdmin, requiredTier) {
    if (isAdmin) return true;
    if (group === 'free' || group === 'trailer') return true;
    return userTier >= requiredTier;
}

export function resolveEffectiveGroup(episodeGroup, productionGroup) {
    return episodeGroup === 'inherit' ? productionGroup : episodeGroup;
}

export function isUserAdmin(user) {
    return user?.role === 'admin' || user?.role === 'superadmin';
}

export { EP_ACCESS_GROUPS, PROD_ACCESS_GROUPS };
