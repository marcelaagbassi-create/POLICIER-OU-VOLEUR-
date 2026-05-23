// ===================================================
// SERVICE WORKER — Policier ou Voleur (DAVIESLAY)
// Cache complet + stratégie offline-first
// ===================================================

const CACHE_NAME = 'pov-v2-2';
const OFFLINE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  // Fonts Google
  'https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Crimson+Pro:ital,wght@0,400;0,600;1,400&display=swap',
  // Firebase (en cache pour accès rapide)
  'https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/9.23.0/firebase-database-compat.js',
];

// ── INSTALL : mettre en cache tous les assets ──
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return Promise.allSettled(
        OFFLINE_ASSETS.map(url =>
          cache.add(url).catch(e => console.warn('[SW] Cache miss:', url, e.message))
        )
      );
    })
  );
});

// ── ACTIVATE : supprimer les anciens caches ──
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME)
          .map(k => { console.log('[SW] Suppression ancien cache:', k); return caches.delete(k); })
      )
    ).then(() => self.clients.claim())
  );
});

// ── FETCH : stratégie Cache-First puis Network-Fallback ──
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Ne pas intercepter Firebase Realtime Database (temps réel obligatoire)
  if (
    url.hostname.includes('firebasedatabase.app') ||
    url.hostname.includes('firebaseio.com') ||
    url.hostname.includes('googleapis.com/identitytoolkit') ||
    url.hostname.includes('securetoken.google.com')
  ) {
    return; // Laisser passer sans interception
  }

  // Pour les requêtes GET uniquement
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;

      // Pas en cache → réseau avec mise en cache dynamique
      return fetch(event.request).then(response => {
        // Ne cacher que les réponses valides
        if (!response || response.status !== 200 || response.type === 'error') {
          return response;
        }
        // Mettre en cache dynamiquement (fonts, images, scripts externes)
        const toCache = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, toCache));
        return response;
      }).catch(() => {
        // Hors ligne : retourner index.html pour la navigation
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
        // Placeholder image si hors ligne
        if (event.request.destination === 'image') {
          return new Response(
            '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="#15171f"/><text x="50" y="55" text-anchor="middle" fill="#666" font-size="12">📵</text></svg>',
            { headers: { 'Content-Type': 'image/svg+xml' } }
          );
        }
      });
    })
  );
});

// ── MESSAGE : forcer mise à jour depuis l'app ──
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
  if (event.data === 'CLEAR_CACHE') {
    caches.delete(CACHE_NAME).then(() => {
      event.ports[0].postMessage({ cleared: true });
    });
  }
});
