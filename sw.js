// Service worker: l'app si apre anche senza rete con i dati già visti
const V = 'catalogo-te-v3';
const CORE = ['./', 'index.html', 'shim.js', 'config.js', 'manifest.webmanifest', 'data.json', 'covers.json', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(V).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === location.origin;
  const isPage = req.mode === 'navigate' || /\/(index\.html|config\.js|shim\.js)?$/.test(url.pathname) && sameOrigin;
  if (isPage) {
    // prima la rete (per avere sempre l'ultima versione), poi la copia salvata
    e.respondWith(fetch(req).then(r => { const cp = r.clone(); caches.open(V).then(c => c.put(req, cp)); return r; })
      .catch(() => caches.match(req).then(r => r || caches.match('index.html'))));
    return;
  }
  if (sameOrigin || /fonts\.(googleapis|gstatic)\.com|cdnjs\.cloudflare\.com/.test(url.host)) {
    // dati, disegni, caratteri: prima la copia salvata, poi la rete
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => {
      if (r.ok || r.type === 'opaque') { const cp = r.clone(); caches.open(V).then(c => c.put(req, cp)); }
      return r;
    })));
  }
});
