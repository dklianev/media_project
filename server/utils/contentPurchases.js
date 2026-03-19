import db from '../db.js';
import {
  hasGroupAccess,
  isUserAdmin,
  normalizeEpisodeGroup,
  resolveEffectiveGroup,
  resolveProductionGroup,
} from './access.js';

const PURCHASE_TARGET_TYPES = ['production', 'episode'];
const PRODUCTION_PURCHASE_MODES = ['none', 'production', 'episodes', 'both'];

export function normalizePurchaseTargetType(value, fallback = '') {
  const normalized = String(value || '').trim().toLowerCase();
  return PURCHASE_TARGET_TYPES.includes(normalized) ? normalized : fallback;
}

export function normalizePurchaseMode(value, fallback = 'none') {
  const normalized = String(value || '').trim().toLowerCase();
  return PRODUCTION_PURCHASE_MODES.includes(normalized) ? normalized : fallback;
}

export function normalizePurchasePrice(value, fallback = null) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return fallback;
  }

  const parsed = Math.round(Number.parseFloat(String(value).trim()) * 100) / 100;
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

export function createEmptyPurchaseState() {
  return {
    ownedProductionIds: new Set(),
    ownedEpisodeIds: new Set(),
    pendingProductionIds: new Set(),
    pendingEpisodeIds: new Set(),
  };
}

function addTargetToState(targetType, targetId, state, keyPrefix) {
  const numericId = Number(targetId);
  if (!Number.isFinite(numericId) || numericId <= 0) {
    return;
  }

  if (targetType === 'production') {
    state[`${keyPrefix}ProductionIds`].add(numericId);
  } else if (targetType === 'episode') {
    state[`${keyPrefix}EpisodeIds`].add(numericId);
  }
}

export function getUserPurchaseState(userId) {
  if (!Number.isFinite(Number(userId)) || Number(userId) <= 0) {
    return createEmptyPurchaseState();
  }

  const state = createEmptyPurchaseState();
  const ownedRows = db.prepare(`
    SELECT target_type, target_id
    FROM content_entitlements
    WHERE user_id = ?
  `).all(userId);
  const pendingRows = db.prepare(`
    SELECT target_type, target_id
    FROM content_purchase_requests
    WHERE user_id = ?
      AND status = 'pending'
  `).all(userId);

  for (const row of ownedRows) {
    addTargetToState(row.target_type, row.target_id, state, 'owned');
  }

  for (const row of pendingRows) {
    addTargetToState(row.target_type, row.target_id, state, 'pending');
  }

  return state;
}

export function getProductionPurchaseConfig(production) {
  const purchaseMode = normalizePurchaseMode(production?.purchase_mode);
  const purchasePrice = normalizePurchasePrice(production?.purchase_price, null);
  const isEnabled = (purchaseMode === 'production' || purchaseMode === 'both') && purchasePrice !== null;

  return {
    purchaseMode,
    purchasePrice,
    isEnabled,
  };
}

export function getEpisodePurchaseConfig(episode, production) {
  const purchaseMode = normalizePurchaseMode(
    production?.purchase_mode ?? episode?.production_purchase_mode
  );
  const purchasePrice = normalizePurchasePrice(episode?.purchase_price, null);
  const purchaseEnabled = Number(episode?.purchase_enabled || 0) === 1;
  const isEnabled =
    purchaseEnabled
    && (purchaseMode === 'episodes' || purchaseMode === 'both')
    && purchasePrice !== null;

  return {
    purchaseEnabled,
    purchasePrice,
    isEnabled,
  };
}

export function hasProductionEntitlement(purchaseState, productionId) {
  const numericId = Number(productionId);
  return Number.isFinite(numericId) && purchaseState?.ownedProductionIds?.has(numericId);
}

export function hasEpisodeEntitlement(purchaseState, episodeId) {
  const numericId = Number(episodeId);
  return Number.isFinite(numericId) && purchaseState?.ownedEpisodeIds?.has(numericId);
}

export function hasPendingProductionPurchase(purchaseState, productionId) {
  const numericId = Number(productionId);
  return Number.isFinite(numericId) && purchaseState?.pendingProductionIds?.has(numericId);
}

export function hasPendingEpisodePurchase(purchaseState, episodeId) {
  const numericId = Number(episodeId);
  return Number.isFinite(numericId) && purchaseState?.pendingEpisodeIds?.has(numericId);
}

export function evaluateProductionAccess(production, user, purchaseState = createEmptyPurchaseState()) {
  const isAdmin = isUserAdmin(user);
  const productionId = Number(production?.id || 0);
  const requiredTier = Number(production?.required_tier || 0);
  const accessGroup = resolveProductionGroup(production?.access_group, requiredTier);
  const productionPurchase = getProductionPurchaseConfig(production);
  const productionOwned = hasProductionEntitlement(purchaseState, productionId);
  const productionPending = hasPendingProductionPurchase(purchaseState, productionId);

  return {
    accessGroup,
    hasAccess:
      isAdmin
      || productionOwned
      || hasGroupAccess(accessGroup, user?.tier_level || 0, isAdmin, requiredTier),
    isPurchased: productionOwned,
    hasPendingPurchase: productionPending,
    canPurchase: productionPurchase.isEnabled && !isAdmin && !productionOwned && !productionPending,
    purchaseMode: productionPurchase.purchaseMode,
    purchasePrice: productionPurchase.purchasePrice,
  };
}

export function evaluateEpisodeAccess(episode, user, purchaseState = createEmptyPurchaseState()) {
  const isAdmin = isUserAdmin(user);
  const productionId = Number(episode?.production_id || 0);
  const episodeId = Number(episode?.id || 0);
  const requiredTier = Number(episode?.required_tier || 0);
  const productionGroup = resolveProductionGroup(
    episode?.production_access_group,
    requiredTier
  );
  const episodeGroup = normalizeEpisodeGroup(episode?.access_group);
  const effectiveGroup = resolveEffectiveGroup(episodeGroup, productionGroup);
  const productionPurchase = getProductionPurchaseConfig({
    id: productionId,
    purchase_mode: episode?.production_purchase_mode,
    purchase_price: episode?.production_purchase_price,
  });
  const episodePurchase = getEpisodePurchaseConfig(episode, {
    purchase_mode: episode?.production_purchase_mode,
  });
  const productionOwned = hasProductionEntitlement(purchaseState, productionId);
  const episodeOwned = hasEpisodeEntitlement(purchaseState, episodeId);
  const productionPending = hasPendingProductionPurchase(purchaseState, productionId);
  const episodePending = hasPendingEpisodePurchase(purchaseState, episodeId);
  const isPurchased = productionOwned || episodeOwned;

  return {
    productionGroup,
    episodeGroup,
    effectiveGroup,
    hasAccess:
      isAdmin
      || isPurchased
      || hasGroupAccess(effectiveGroup, user?.tier_level || 0, isAdmin, requiredTier),
    isPurchased,
    purchaseSource: productionOwned ? 'production' : (episodeOwned ? 'episode' : null),
    isProductionPurchased: productionOwned,
    isEpisodePurchased: episodeOwned,
    hasPendingProductionPurchase: productionPending,
    hasPendingEpisodePurchase: episodePending,
    canPurchaseProduction:
      productionPurchase.isEnabled && !isAdmin && !productionOwned && !productionPending,
    canPurchaseEpisode:
      episodePurchase.isEnabled
      && !isAdmin
      && !productionOwned
      && !episodeOwned
      && !episodePending,
    productionPurchaseMode: productionPurchase.purchaseMode,
    productionPurchasePrice: productionPurchase.purchasePrice,
    episodePurchaseEnabled: episodePurchase.purchaseEnabled,
    episodePurchasePrice: episodePurchase.purchasePrice,
  };
}

export function enrichProductionForUser(production, user, purchaseState = createEmptyPurchaseState()) {
  const access = evaluateProductionAccess(production, user, purchaseState);
  return {
    ...production,
    access_group: access.accessGroup,
    has_access: access.hasAccess,
    purchase_mode: access.purchaseMode,
    purchase_price: access.purchasePrice,
    can_purchase: access.canPurchase,
    is_purchased: access.isPurchased,
    has_pending_purchase: access.hasPendingPurchase,
  };
}

export function enrichEpisodeForUser(episode, user, purchaseState = createEmptyPurchaseState()) {
  const access = evaluateEpisodeAccess(episode, user, purchaseState);
  return {
    ...episode,
    access_group: access.episodeGroup,
    effective_access_group: access.effectiveGroup,
    has_access: access.hasAccess,
    purchase_enabled: access.episodePurchaseEnabled,
    purchase_price: access.episodePurchasePrice,
    can_purchase_episode: access.canPurchaseEpisode,
    is_purchased: access.isPurchased,
    purchase_source: access.purchaseSource,
    is_purchased_episode: access.isEpisodePurchased,
    has_pending_purchase: access.hasPendingEpisodePurchase,
    production_purchase_mode: access.productionPurchaseMode,
    production_purchase_price: access.productionPurchasePrice,
    can_purchase_production: access.canPurchaseProduction,
    production_is_purchased: access.isProductionPurchased,
    production_has_pending_purchase: access.hasPendingProductionPurchase,
  };
}

export {
  PRODUCTION_PURCHASE_MODES,
  PURCHASE_TARGET_TYPES,
};
