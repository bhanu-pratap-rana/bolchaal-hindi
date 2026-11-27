// Reviewer mode (?review=1): OK / Fix and a note per line and learner variant, exported as CSV.
import { lineText } from './data.js';
import { store } from './util.js';

export function reviewOn() {
  const q = new URLSearchParams(location.search);
  if (q.get('review') === '1') store.set('review', true);
  if (q.get('review') === '0') store.set('review', false);
  return !!store.get('review', false);
}
export function setReview(on) { store.set('review', on); }

export function reviewer() { return store.get('reviewer', ''); }
export function setReviewer(name) { store.set('reviewer', name); }

const key = (lessonId) => `review:${lessonId}`;
export function marks(lessonId) { return store.get(key(lessonId), {}); }
export function mark(lessonId, sceneId, i, v, patch) {
  const all = marks(lessonId);
  const k = `${sceneId}|${i}|${v}`;
  all[k] = { ...(all[k] || {}), ...patch, by: reviewer(), at: new Date().toISOString().slice(0, 10) };
  store.set(key(lessonId), all);
  return all[k];
}

const esc = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
const HEAD = ['scene', 'line', 'variant', 'role', 'hi', 'roman', 'en', 'spoken_as', 'status', 'note', 'reviewer', 'date'];
function lessonRows(lesson) {
  const all = marks(lesson.id);
  const rows = [];
  for (const s of lesson.scenes) {
    s.lines.forEach((ln, i) => {
      for (const v of ['m', 'f']) {
        const t = lineText(ln, v);
        const m = all[`${s.id}|${i}|${v}`] || {};
        rows.push([s.id, i + 1, v, ln.role, t.hi, t.roman, t.en, s.spoken?.[`${i}:${v}`] || '', m.status || '', m.note || '', m.by || '', m.at || '']);
      }
    });
  }
  return rows;
}
function download(rows, name) {
  const csv = '﻿' + [HEAD, ...rows].map((r) => r.map(esc).join(',')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = name;
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  return rows.length;
}
export function exportCSV(lesson) { return download(lessonRows(lesson), `review-${lesson.id}.csv`); }
export function exportCourseCSV(lessons) { return download(lessons.flatMap(lessonRows), 'review-all-days.csv'); }

export function reviewCounts(lesson) {
  const all = Object.values(marks(lesson.id));
  return { ok: all.filter((m) => m.status === 'OK').length, fix: all.filter((m) => m.status === 'FIX').length,
    total: lesson.scenes.reduce((n, s) => n + s.lines.length * 2, 0) };
}
