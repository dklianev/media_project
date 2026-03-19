/* eslint-disable no-restricted-globals */

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      const cacheKeys = await caches.keys();
      await Promise.all(cacheKeys.map((key) => caches.delete(key)));
    } catch {
      // Ignore cache cleanup failures during legacy SW teardown.
    }

    await self.registration.unregister();

    const clients = await self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true,
    });

    await Promise.all(clients.map(async (client) => {
      try {
        if ('navigate' in client) {
          await client.navigate(client.url);
        }
      } catch {
        // Ignore navigation failures; the client will recover on next load.
      }
    }));
  })());
});

self.addEventListener('fetch', () => {
  // Intentionally empty: this worker exists only to unregister legacy PWA state.
});
