// Service Worker — Screening Room
// Enables "Add to Home Screen" on iOS/Android (PWA baseline)
// Strategy: network-first for API calls, cache-first for static assets

const CACHE = 'screening-room-v1';
const STATIC = ['/'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(STATIC))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  // Don't intercept Supabase or TMDB API calls
  if (e.request.url.includes('supabase.co') || e.request.url.includes('themoviedb.org')) return;

  e.respondWith(
    fetch(e.request)
      .then(res => {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
