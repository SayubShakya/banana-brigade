// Service worker: lets Banana Brigade be installed (phone home screen, desktop app)
// and open without a connection. It keeps a copy of the app itself (the page,
// scripts, styles, pictures); the game's data never comes from here.
//
//   /api/... and /socket.io/...  always the network (logins, puzzles and scores must be live)
//   page loads                    network first, the saved copy when offline (the app then
//                                 shows its "offline" screen, because the server cannot be reached)
//   /assets/... (hashed files)    saved copy first: a new build has new file names
//   other files (logo, icons)     saved copy, refreshed in the background
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

const CACHE = 'brigade-v1';
const SHELL = ['/', '/manifest.webmanifest', '/logo.svg', '/favicon.svg', '/img/gameplay.jpg', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

// Old caches from earlier versions are deleted.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const save = (request, response) => {
  if (response.ok && response.type === 'basic') {
    const copy = response.clone();
    caches.open(CACHE).then((c) => c.put(request, copy));
  }
  return response;
};

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/socket.io')) return;   // never cached

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => (url.pathname === '/' ? save(new Request('/'), res) : res))
        .catch(() => caches.match('/')),
    );
    return;
  }
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(caches.match(request).then((hit) => hit ?? fetch(request).then((res) => save(request, res))));
    return;
  }
  event.respondWith(caches.match(request).then((hit) => {
    const fresh = fetch(request).then((res) => save(request, res)).catch(() => hit);
    return hit ?? fresh;
  }));
});
