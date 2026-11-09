// Kanka service worker: uygulama kabuğu çevrimdışı açılsın (veriler sunucudan gelir).
const CACHE = 'kanka-v5';
const CORE = ['./', './vendor/supabase.js', './index.html', './style.css', './manifest.webmanifest', './icons/icon-192.png', './js/app.js', './js/api.js', './js/ui.js', './js/admin.js', './js/config.js', './js/db-local.js', './js/db-supabase.js'];
self.addEventListener('install', (e) => e.waitUntil(caches.open(CACHE).then((c) => Promise.all(CORE.map((u) => c.add(u).catch(() => {})))).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then((r) => { const c = r.clone(); caches.open(CACHE).then((x) => x.put(e.request, c)); return r; }).catch(() => caches.match(e.request)));
});
