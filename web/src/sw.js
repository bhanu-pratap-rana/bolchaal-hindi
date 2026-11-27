// Service worker. The build replaces __VERSION__ and __SHELL__.
// - App shell: precached per version (bypassing the HTTP cache), served cache-first.
// - Lesson JSON and course.json: network first, so a redeploy is picked up at once; cached copy when offline.
// - Audio: from any cache (offline day packs) first, else network. File names carry a content hash, so they never go stale.
// Old shell and runtime caches are deleted when a new version activates.
const VERSION = '__VERSION__';
const SHELL = `bch-shell-${VERSION}`;
const RUNTIME = `bch-runtime-${VERSION}`;
const SHELL_FILES = __SHELL__;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL)
    .then((c) => c.addAll(['./', ...SHELL_FILES].map((u) => new Request(u, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) {
      if ((k.startsWith('bch-shell-') && k !== SHELL) || (k.startsWith('bch-runtime') && k !== RUNTIME)) await caches.delete(k);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  const path = url.pathname;
  if (path.includes('/media/')) { e.respondWith(media(req)); return; }
  if (path.includes('/data/')) { e.respondWith(networkFirst(req)); return; }
  if (req.mode === 'navigate') { e.respondWith(caches.match('./', { cacheName: SHELL }).then((r) => r || fetch(req))); return; }
  e.respondWith(caches.match(req, { ignoreSearch: true }).then((r) => r || fetch(req)));
});

async function networkFirst(req) {
  try {
    const res = await fetch(req, { cache: 'no-cache' });
    if (res.ok) (await caches.open(RUNTIME)).put(req, res.clone());
    return res;
  } catch {
    return (await caches.match(req, { ignoreSearch: true })) || Response.error();
  }
}

async function media(req) {
  const hit = await caches.match(req.url, { ignoreSearch: true });
  if (!hit) return fetch(req);
  const range = req.headers.get('range');
  if (!range) return hit;
  const buf = await hit.arrayBuffer();
  const size = buf.byteLength;
  const m = /bytes=(\d*)-(\d*)/.exec(range);
  let start, end;
  if (!m) { start = 0; end = size - 1; }
  else if (m[1] === '') { start = Math.max(0, size - Number(m[2] || 0)); end = size - 1; } // suffix range: last N bytes
  else { start = Number(m[1]); end = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1; }
  if (start >= size || start > end) {
    return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  }
  return new Response(buf.slice(start, end + 1), {
    status: 206,
    headers: { 'Content-Type': 'audio/mpeg', 'Content-Range': `bytes ${start}-${end}/${size}`,
      'Content-Length': String(end - start + 1), 'Accept-Ranges': 'bytes' },
  });
}
