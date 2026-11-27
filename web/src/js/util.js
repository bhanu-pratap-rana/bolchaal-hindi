// Small DOM and storage helpers shared by every view.

/** h('div.cls#id', {attrs}, ...children) */
export function h(tag, attrs = {}, ...kids) {
  const [, name = 'div', rest = ''] = tag.match(/^([a-z0-9-]+)?(.*)$/i) || [];
  const el = document.createElement(name);
  for (const m of rest.matchAll(/([.#])([\w-]+)/g)) {
    if (m[1] === '.') el.classList.add(m[2]); else el.id = m[2];
  }
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'text') el.textContent = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') for (const [sk, sv] of Object.entries(v)) { if (sk.startsWith('--')) el.style.setProperty(sk, sv); else el.style[sk] = sv; }
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// localStorage can be missing or throw (private mode, blocked site data); the app must still work.
const mem = new Map();
export const store = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem('bch:' + key);
      return raw == null ? (mem.has(key) ? mem.get(key) : fallback) : JSON.parse(raw);
    } catch { return mem.has(key) ? mem.get(key) : fallback; }
  },
  set(key, value) {
    mem.set(key, value);
    try { localStorage.setItem('bch:' + key, JSON.stringify(value)); } catch { /* memory only */ }
  },
};

let statusTimer;
/** Announce through the role="status" region (screen readers) */
export function announce(msg) {
  const el = document.getElementById('status');
  if (!el) return;
  el.textContent = '';
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => { el.textContent = msg; }, 30);
}

let toastTimer;
export function toast(msg) {
  let el = document.querySelector('.toast');
  if (!el) { el = h('div.toast', { role: 'status' }); document.body.append(el); }
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
}

export function fmtTime(s) {
  s = Math.max(0, Math.round(s || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Deterministic PRNG so a scene's practice questions are stable for an attempt */
export function seeded(seed) {
  let x = 2166136261;
  for (const c of String(seed)) x = Math.imul(x ^ c.charCodeAt(0), 16777619);
  return () => {
    x = Math.imul(x ^ (x >>> 15), 2246822507);
    x = Math.imul(x ^ (x >>> 13), 3266489909);
    return ((x ^= x >>> 16) >>> 0) / 4294967296;
  };
}
export function shuffle(arr, rnd) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

const SPEAKER_COLORS = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)'];
export function roleColors(lesson) {
  const ids = Object.keys(lesson.roles);
  const learner = ids.find((r) => lesson.roles[r].learner);
  const order = [learner, ...ids.filter((r) => r !== learner)];
  return Object.fromEntries(order.map((r, i) => [r, SPEAKER_COLORS[i % SPEAKER_COLORS.length]]));
}

const segmenter = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter('hi', { granularity: 'grapheme' }) : null;
/** First visible character, safe for Devanagari conjuncts */
export function initial(text) {
  if (!text) return '?';
  if (segmenter) for (const s of segmenter.segment(text)) return s.segment;
  return text[0];
}

/** Run a DOM update inside a view transition when supported and motion is allowed. Resolves after the update. */
export async function transition(update) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!document.startViewTransition || reduce) { await update(); return; }
  const t = document.startViewTransition(update);
  t.ready.catch(() => {}); t.finished.catch(() => {}); // a newer navigation may skip this one
  try { await t.updateCallbackDone; } catch (e) { console.error(e); }
}
