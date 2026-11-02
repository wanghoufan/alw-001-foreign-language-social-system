/* 只缓存公开静态资源；不缓存任何 /api、私有数据或用户选择。 */
const CACHE = 'hainan-public-v8';
const ASSETS = [
  './',
  './public-share.html',
  './public-share.js',
  './public-places.js',
  './styles.css',
  './manifest.webmanifest',
  './icon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== location.origin) return;
  // 任何接口路径一律不缓存（不写死私有路由名）
  if (url.pathname.split('/').includes('api')) return;

  event.respondWith(
    caches.match(event.request, {ignoreSearch: false}).then((hit) => {
      if (hit) return hit;
      return fetch(event.request).then((response) => {
        if (!response.ok || response.type !== 'basic') return response;
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(event.request, copy)).catch(() => {});
        return response;
      }).catch(() => {
        if (event.request.mode === 'navigate') return caches.match('./public-share.html');
        return Response.error();
      });
    }),
  );
});
