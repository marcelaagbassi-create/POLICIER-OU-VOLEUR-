// ===================================================
// SERVICE WORKER — Policier ou Voleur (DAVIESLAY)
// Version: 2.3 — Network-First + Auto-update
// ===================================================

const CACHE_NAME = 'pov-v2-3'; // ← Incrémenté = force mise à jour immédiate
const CACHE_STATIC = 'pov-static-v2-3';

// Assets statiques mis en cache (rarement modifiés)
const STATIC_ASSETS = [
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  'https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Crimson+Pro:ital,wght@0,400;0,600;1,400&display=swap',
  'https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/9.23.0/firebase-database-compat.js',
  'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js',
];

// ── INSTALL ──────────────────────────────────────────
self.addEventListener('install', event => {
  // skipWaiting : le nouveau SW prend le contrôle immédiatement
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_STATIC).then(cache =>
      Promise.allSettled(
        STATIC_ASSETS.map(url =>
          cache.add(url).catch(e => console.warn('[SW] Cache miss:', url, e.message))
        )
      )
    )
  );
});

// ── ACTIVATE : supprimer TOUS les anciens caches ─────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME && k !== CACHE_STATIC)
          .map(k => {
            console.log('[SW] Suppression ancien cache:', k);
            return caches.delete(k);
          })
      )
    ).then(() => {
      console.log('[SW] Activé — contrôle de tous les clients');
      return self.clients.claim(); // Prendre le contrôle immédiatement
    })
  );
});

// ── FETCH : stratégie selon le type de ressource ─────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // 1. Ne jamais intercepter Firebase (temps réel)
  if (
    url.hostname.includes('firebasedatabase.app') ||
    url.hostname.includes('firebaseio.com') ||
    url.hostname.includes('googleapis.com/identitytoolkit') ||
    url.hostname.includes('securetoken.google.com') ||
    url.hostname.includes('audiomack.com') // Audiomack toujours depuis le réseau
  ) {
    return;
  }

  // 2. GET uniquement
  if (event.request.method !== 'GET') return;

  // 3. index.html → NETWORK-FIRST (toujours la version fraîche)
  if (
    event.request.mode === 'navigate' ||
    url.pathname.endsWith('index.html') ||
    url.pathname === '/' ||
    url.pathname.endsWith('/POLICIER-OU-VOLEUR-/')
  ) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // Mettre à jour le cache avec la nouvelle version
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => {
          // Hors ligne → servir depuis le cache
          return caches.match(event.request)
            .then(cached => cached || caches.match('./index.html'));
        })
    );
    return;
  }

  // 4. Assets statiques → CACHE-FIRST
  if (STATIC_ASSETS.some(a => event.request.url.includes(a.replace('./', '')))) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_STATIC).then(cache => cache.put(event.request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // 5. Tout le reste → NETWORK-FIRST avec fallback cache
  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

// ── MESSAGE : communication depuis l'app ─────────────
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data === 'CLEAR_CACHE') {
    Promise.all([
      caches.delete(CACHE_NAME),
      caches.delete(CACHE_STATIC)
    ]).then(() => {
      if (event.ports[0]) event.ports[0].postMessage({ cleared: true });
    });
  }
  if (event.data === 'GET_VERSION') {
    if (event.ports[0]) event.ports[0].postMessage({ version: CACHE_NAME });
  }
});
