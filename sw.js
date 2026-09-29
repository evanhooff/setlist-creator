const CACHE_PREFIX = 'setlist-creator-shell-';
const CACHE_NAME = CACHE_PREFIX + 'v2';
const SHELL_FILES = [
  '/index.html',
  '/play.html',
  '/manifest.webmanifest',
  '/styles/style.css',
  '/scripts/script.js',
  '/scripts/auth.js',
  '/scripts/songs.js',
  '/scripts/setlists.js',
  '/scripts/play.js',
  '/scripts/play-window.js',
  '/scripts/pwa.js',
  '/icons/setlist.svg',
  '/icons/setlist-maskable.svg'
];
const SHELL_URLS = new Set(SHELL_FILES);

self.addEventListener('install', event=>{
  event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(SHELL_FILES)).then(()=>self.skipWaiting()));
});

self.addEventListener('activate', event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(
    keys.filter(key=>key.startsWith(CACHE_PREFIX)&&key!==CACHE_NAME).map(key=>caches.delete(key))
  )).then(()=>self.clients.claim()));
});

self.addEventListener('fetch', event=>{
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname === '/api' || url.pathname.startsWith('/api/') || url.hostname.endsWith('.supabase.co')) return;

  if (request.mode === 'navigate') {
    event.respondWith((async()=>{
      const cache = await caches.open(CACHE_NAME);
      const cacheKey = new Request(url.origin + url.pathname);
      try {
        const response = await fetch(request);
        if (response.ok) event.waitUntil(cache.put(cacheKey, response.clone()));
        return response;
      } catch (error) {
        const cached = await cache.match(cacheKey) || (url.pathname === '/' ? await cache.match('/index.html') : null);
        return cached || Response.error();
      }
    })());
    return;
  }

  if (!SHELL_URLS.has(url.pathname)) return;
  event.respondWith((async()=>{
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok) event.waitUntil(cache.put(request, response.clone()));
    return response;
  })());
});
