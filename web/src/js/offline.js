// Offline day packs: the service worker caches the app shell; this module saves a day's lessons and audio on request.
import { lessonAssets } from './data.js';
import { store } from './util.js';

const PACKS = 'bch-packs';
export const offlineSupported = 'caches' in window && 'serviceWorker' in navigator;

export async function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  try { await navigator.serviceWorker.register('sw.js', { scope: './' }); } catch (e) { console.warn('service worker', e); }
}

export function savedDays() { return store.get('packs', {}); }

export async function saveDay(lesson, version, onProgress) {
  if (savedDays()[lesson.id]) await removeDay(lesson.id);
  const cache = await caches.open(PACKS);
  const urls = lessonAssets(lesson);
  let done = 0, bytes = 0;
  for (const url of urls) {
    const res = await fetch(url, { cache: 'reload' });
    if (!res.ok) throw new Error(`${url}: ${res.status}`);
    bytes += Number(res.headers.get('content-length')) || 0;
    await cache.put(url, res);
    onProgress?.(++done / urls.length);
  }
  const packs = savedDays();
  packs[lesson.id] = { urls, bytes, version, at: Date.now() };
  store.set('packs', packs);
  try { await navigator.storage?.persist?.(); } catch { /* best effort */ }
  return packs[lesson.id];
}

export async function removeDay(id) {
  const packs = savedDays();
  const pack = packs[id];
  if (pack) {
    const cache = await caches.open(PACKS);
    await Promise.all(pack.urls.map((u) => cache.delete(u)));
  }
  delete packs[id];
  store.set('packs', packs);
}

export async function storageSummary() {
  const packs = savedDays();
  const n = Object.keys(packs).length;
  let est = '';
  try {
    const e = await navigator.storage?.estimate?.();
    if (e?.usage) est = ` About ${(e.usage / 1e6).toFixed(1)} MB is stored for this site.`;
  } catch { /* unsupported */ }
  return n ? `${n} day${n > 1 ? 's' : ''} saved for offline use.${est} Browsers can clear saved data for sites you haven't opened in a while.` : '';
}
