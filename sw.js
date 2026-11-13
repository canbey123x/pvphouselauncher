// Kanka service worker: uygulama kabuğu çevrimdışı açılsın (veriler sunucudan gelir).
// Yayın sırasında 463118f39f0d-13 her yeni sürümde değişir; tarayıcı bunu görünce yeni dosyaları alır
// ve açık sayfaları kendiliğinden yeniler (eski sürüm takılı kalmaz).
const CACHE = 'kanka-463118f39f0d-13';
const CORE = ['./', './vendor/supabase.js', './index.html', './style.css', './manifest.webmanifest', './icons/icon-192.png', './js/app.js', './js/api.js', './js/ui.js', './js/admin.js', './js/editor.js', './js/config.js', './js/db-local.js', './js/db-supabase.js', './js/social.js', './js/calls.js', './js/groupcall.js', './js/live.js'];
self.addEventListener('install', (e) =>
  e.waitUntil(caches.open(CACHE).then((c) => Promise.all(CORE.map((u) => c.add(new Request(u, { cache: 'reload' })).catch(() => {})))).then(() => self.skipWaiting()))
);
self.addEventListener('activate', (e) =>
  e.waitUntil(
    caches.keys().then(async (ks) => {
      const old = ks.filter((k) => k !== CACHE);
      await Promise.all(old.map((k) => caches.delete(k)));
      await self.clients.claim();
      // eski sürüm açıksa yeni sürümle yeniden aç
      if (old.length) for (const c of await self.clients.matchAll({ type: 'window' })) c.navigate(c.url).catch(() => {});
    })
  )
);
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  // her zaman sunucuya sor (tarayıcı önbelleğindeki eski dosyayı kullanma); internet yoksa kayıtlı kopya
  const req = new Request(e.request.url, { cache: 'no-cache', credentials: 'same-origin' });
  e.respondWith(
    fetch(req)
      .then((r) => {
        if (r.ok) {
          const c = r.clone();
          caches.open(CACHE).then((x) => x.put(e.request.url, c));
        }
        return r;
      })
      .catch(() => caches.match(e.request.url, { ignoreSearch: true }))
  );
});
