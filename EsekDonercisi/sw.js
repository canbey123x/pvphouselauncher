// EsekDonercisi service worker: oyun bir kez açıldıktan sonra internetsiz de çalışsın.
// Kendi dosyalarımız: önce ağ (güncellemeler hemen gelsin), ağ yoksa önbellek.
// CDN (three.js) ve yazı tipleri: önce önbellek.
const CACHE = 'esekdonercisi-v4';
const CORE = [
  './',
  './index.html',
  './style.css',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/apple-touch-icon.png',
  './src/main.js',
  './src/city.js',
  './src/controls.js',
  './src/customers.js',
  './src/cutting.js',
  './src/daynight.js',
  './src/donkey.js',
  './src/house.js',
  './src/life.js',
  './src/npcs.js',
  './src/shops.js',
];
const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then(async (c) => {
      await c.addAll(CORE);
      try {
        await c.add(THREE_URL);
      } catch {
        /* CDN'e ulaşılamazsa ilk açılışta önbelleğe alınır */
      }
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const put = (req, res) => {
  if (res && (res.ok || res.type === 'opaque')) {
    const copy = res.clone();
    caches.open(CACHE).then((c) => c.put(req, copy));
  }
  return res;
};

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    e.respondWith(fetch(req).then((r) => put(req, r)).catch(() => caches.match(req, { ignoreSearch: true })));
  } else if (/(^|\.)cdn\.jsdelivr\.net$|^fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) {
    e.respondWith(caches.match(req).then((m) => m || fetch(req).then((r) => put(req, r))));
  }
});
