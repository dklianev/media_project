function isLegacySwRegistration(registration) {
  const scriptUrl =
    registration?.active?.scriptURL
    || registration?.waiting?.scriptURL
    || registration?.installing?.scriptURL
    || '';

  try {
    return new URL(scriptUrl).pathname === '/sw.js';
  } catch {
    return false;
  }
}

export async function cleanupLegacyPwaState() {
  if (typeof window === 'undefined') return;

  if ('serviceWorker' in navigator) {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      const legacyRegistrations = registrations.filter(isLegacySwRegistration);

      if (legacyRegistrations.length > 0) {
        await Promise.all(legacyRegistrations.map((registration) => registration.unregister()));
      }
    } catch {
      // Ignore SW cleanup failures; the app should still bootstrap normally.
    }
  }

  if ('caches' in window) {
    try {
      const cacheKeys = await caches.keys();
      const legacyKeys = cacheKeys.filter((key) => key.startsWith('workbox-precache-'));
      await Promise.all(legacyKeys.map((key) => caches.delete(key)));
    } catch {
      // Ignore cache cleanup failures; stale cache will be retried on next load.
    }
  }
}
