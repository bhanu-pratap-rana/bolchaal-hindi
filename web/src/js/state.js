// Settings and progress, kept in this browser only.
import { store } from './util.js';

const DEFAULTS = { variant: 'm', script: 'both', english: true, listenFirst: false, theme: 'system', speed: 1 };

export const settings = { ...DEFAULTS, ...store.get('settings', {}) };
const listeners = new Set();

export function setSetting(key, value) {
  if (settings[key] === value) return;
  settings[key] = value;
  store.set('settings', settings);
  applySettings();
  for (const fn of listeners) fn(key, value);
}
export function onSettings(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export function applySettings() {
  const root = document.documentElement;
  if (settings.theme === 'system') root.removeAttribute('data-theme'); else root.dataset.theme = settings.theme;
  document.body.dataset.script = settings.script;
  document.body.dataset.english = String(settings.english);
}

// progress: { [sceneId]: { heard: true, spoke: true, best: 4, total: 5 } }
export const progress = store.get('progress', {});
export function markScene(sceneId, patch) {
  progress[sceneId] = { ...(progress[sceneId] || {}), ...patch };
  store.set('progress', progress);
}
export function dayProgress(day) {
  const ids = day.scenes.map((s) => s.id);
  const heard = ids.filter((id) => progress[id]?.heard).length;
  return { heard, total: ids.length, state: heard === 0 ? 'new' : heard === ids.length ? 'done' : 'started' };
}

// word status: { [hindiWord]: 'known' | 'learning' }
export const words = store.get('words', {});
export function setWord(hi, status) {
  if (words[hi] === status) delete words[hi]; else words[hi] = status;
  store.set('words', words);
}

export function lastPlace() { return store.get('last', null); }
export function setLastPlace(place) { store.set('last', place); }
