// sw.js: the service worker. It caches the app shell so the game page can still open
// (and show the Offline screen) when there is no connection. API calls are never cached.
const CACHE = 'brigade-v2';
const SHELL = ['/', '/manifest.webmanifest', '/logo.svg', '/favicon.svg', '/img/gameplay.jpg', '/icons/icon-192.png', '/icons/icon-512.png'];

// install: download the shell files into the cache.
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

// activate: delete caches from older versions.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// save: store a copy of a good same-origin response in the cache.
const save = (request, response) => {
  if (response.ok && response.type === 'basic') {
    const copy = response.clone();
    caches.open(CACHE).then((c) => c.put(request, copy));
  }
  return response;
};

// fetch: decide for each request whether to use the network or the cache.
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== location.origin) return;
  // API, socket and media requests always go straight to the network.
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/socket.io')) return;
  if (url.pathname.startsWith('/media/')) return;

  // Pages: network first, cached page if offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => (url.pathname === '/' ? save(new Request('/'), res) : res))
        .catch(() => caches.match('/')),
    );
    return;
  }
  // Built assets have hashed names, so cache first is safe.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(caches.match(request).then((hit) => hit ?? fetch(request).then((res) => save(request, res))));
    return;
  }
  // Everything else: answer from cache at once and refresh the cache in the background.
  event.respondWith(caches.match(request).then((hit) => {
    const fresh = fetch(request).then((res) => save(request, res)).catch(() => hit);
    return hit ?? fresh;
  }));
});
