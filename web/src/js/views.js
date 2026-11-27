// Course map (home), day page and the Words page.
import { loadLesson } from './data.js';
import { dayProgress, lastPlace, progress, settings, words } from './state.js';
import { h, announce, toast } from './util.js';
import { offlineSupported, removeDay, saveDay, savedDays } from './offline.js';
import { exportCSV, reviewCounts, reviewOn } from './review.js';
import { currentRoute } from './route.js';

/** Hindi text node that respects the script setting: Roman-only shows the Roman instead */
export function bi(hi, roman, cls = '') {
  return [
    h(`span${cls ? '.' + cls : ''}`, { lang: 'hi', 'data-hi-only': '' }, hi),
    roman ? h(`span${cls ? '.' + cls : ''}.ro`, { 'data-ro-only': '', 'data-hi-hidden': '' }, roman) : null,
  ];
}

export function renderHome(main, course) {
  if (!course.days.length) {
    main.replaceChildren(h('div.state', {}, h('h1', {}, 'No lessons are published yet'),
      h('p', {}, 'The lessons are still being reviewed by students and a Hindi teacher. Please check back soon.')));
    return;
  }
  const last = lastPlace();
  const lastDay = last && course.days.find((d) => d.id === last.day);
  const next = lastDay || course.days.find((d) => dayProgress(d).state !== 'done') || course.days[0];
  const totalScenes = course.days.reduce((n, d) => n + d.scenes.length, 0);
  const heard = Object.values(progress).filter((p) => p.heard).length;

  const route = h('ol.route', { 'aria-label': 'The 20 days of the course' }, course.days.map((d) => {
    const pr = dayProgress(d);
    return h('li.stop', { 'data-state': pr.state },
      h('span.stop-dot', { 'aria-hidden': 'true' }, pr.state === 'done' ? '✓' : d.day),
      h('a.stop-link', { href: `#/day/${d.id}` },
        h('div.stop-hi', { lang: 'hi', 'data-hi-only': '' }, d.title_hi),
        h('div.stop-en', {}, `Day ${d.day}. ${d.title_en}`),
        h('div.stop-meta', {}, `${d.scenes.length} scenes, about ${Math.max(1, Math.round(d.minutes))} min of listening`,
          pr.heard ? `. ${pr.heard} of ${pr.total} heard` : ''),
        pr.heard ? h('span.meter', { style: { '--v': `${(pr.heard / pr.total) * 100}%` } }, h('i')) : null));
  }));

  main.replaceChildren(h('div.home', {},
    h('section.course', { 'aria-labelledby': 'home-title' },
      h('div.intro', {},
        h('h1#home-title', {}, h('span', { lang: 'hi' }, 'बोलचाल की हिंदी'), 'Hindi for the conversations you will actually have'),
        h('p', {}, 'Twenty days of everyday situations in India, from the airport to a festival at a friend\'s home. Listen to each conversation, follow it line by line, then practise your side.')),
      route),
    h('aside.side', { 'aria-label': 'Your progress' },
      h('section.panel', {},
        h('h2', {}, heard ? 'Pick up where you left off' : `Start with day ${next.day}`),
        h('p', {}, `Day ${next.day}: ${next.title_en}`),
        h('p', {}, `${heard} of ${totalScenes} scenes heard so far.`),
        h('a.btn.primary', { href: last?.scene ? `#/scene/${last.scene}` : `#/day/${next.id}` }, heard ? 'Continue' : 'Start listening')),
      h('section.panel', {},
        h('h2', {}, 'How each scene works'),
        h('ol.how', {},
          h('li', {}, 'Listen: hear the conversation with each line lit as it is spoken.'),
          h('li', {}, 'Speak: the player pauses on your lines so you can say them, and record yourself if you like.'),
          h('li', {}, 'Check: a few quick listening questions.'))),
      h('section.panel', {},
        h('h2', {}, 'Learning as a woman?'),
        h('p', {}, 'Hindi verbs change with the speaker. Choose "A woman" in Settings and your lines and voice change to match.'),
        h('button.btn', { type: 'button', onclick: () => document.getElementById('open-settings').click() }, 'Open settings')))));
}

export async function renderDay(main, course, dayId) {
  const day = course.days.find((d) => d.id === dayId);
  if (!day) return notFound(main);
  const my = currentRoute();
  main.replaceChildren(loading());
  let lesson;
  try { lesson = await loadLesson(dayId); } catch { if (my === currentRoute()) loadFailed(main, () => renderDay(main, course, dayId)); return; }
  if (my !== currentRoute()) return;
  const pr = dayProgress(day);
  const review = reviewOn();
  const packs = savedDays();
  const pack = packs[dayId];
  const stale = pack && pack.version !== course.version;
  const saveBtn = offlineSupported ? h('button.btn', { type: 'button', 'aria-describedby': 'save-hint' }, stale ? 'Update offline copy' : pack ? 'Remove offline copy' : 'Save for offline') : null;
  const saveHint = h('span.hint#save-hint', {}, stale ? 'The lessons have changed since you saved this day.' : pack ? 'Saved on this device.' : '');
  saveBtn?.addEventListener('click', async () => {
    saveBtn.disabled = true;
    try {
      if (savedDays()[dayId] && savedDays()[dayId].version === course.version) {
        await removeDay(dayId);
        saveBtn.textContent = 'Save for offline'; saveHint.textContent = ''; toast('Offline copy removed');
      } else {
        await saveDay(lesson, course.version, (f) => { saveHint.textContent = `Saving… ${Math.round(f * 100)}%`; });
        saveBtn.textContent = 'Remove offline copy'; saveHint.textContent = 'Saved on this device.';
        toast(`Day ${day.day} saved for offline`); announce(`Day ${day.day} saved for offline use`);
      }
    } catch { saveHint.textContent = 'Couldn\'t save. Check your connection and try again.'; }
    saveBtn.disabled = false;
  });

  const known = (lesson.vocab || []).filter((w) => words[w.hi] === 'known').length;
  main.replaceChildren(
    h('nav.crumbs', { 'aria-label': 'Breadcrumb' }, h('a', { href: '#/' }, 'Course'), h('span', { 'aria-hidden': 'true' }, '/'), h('span', {}, `Day ${day.day}`)),
    h('header.day-head', {},
      h('p.day-hi', { lang: 'hi', 'data-hi-only': '' }, lesson.title_hi),
      h('h1', {}, `Day ${day.day}. ${lesson.title_en}`),
      h('p.hint', {}, `${pr.heard} of ${pr.total} scenes heard. ${known} of ${(lesson.vocab || []).length} words marked as known.`),
      h('div.day-actions', {},
        h('a.btn.primary', { href: `#/scene/${(day.scenes.find((s) => !progress[s.id]?.heard) || day.scenes[0]).id}` }, pr.heard ? 'Next scene' : 'Start day ' + day.day),
        h('a.btn', { href: `#/words/${dayId}` }, 'Words for this day'),
        saveBtn, saveHint),
      review ? reviewPanel(lesson) : null),
    h('h2.section-title', {}, 'Scenes'),
    h('ol.scene-list', {}, lesson.scenes.map((s, i) => h('li', {},
      h('a.scene-card', { href: `#/scene/${s.id}`, 'data-done': String(!!progress[s.id]?.heard) },
        h('span.scene-n', { 'aria-hidden': 'true' }, progress[s.id]?.heard ? '✓' : i + 1),
        h('span.t-hi', { lang: 'hi', 'data-hi-only': '' }, s.title_hi),
        h('span.t-en', {}, s.title_en),
        h('span.t-meta', {}, `${s.lines.length} lines${progress[s.id]?.best != null ? `, best check ${progress[s.id].best} of ${progress[s.id].total}` : ''}`))))),
  );
}

function reviewPanel(lesson) {
  const c = reviewCounts(lesson);
  const status = h('p', {}, `Reviewed in this browser: ${c.ok} OK, ${c.fix} to fix, of ${c.total} line versions (each line is checked for a man and a woman learner).`);
  return h('section.panel', { 'aria-label': 'Reviewer tools' },
    h('h2', {}, 'Reviewer tools'), status,
    h('button.btn', { type: 'button', onclick: () => { const n = exportCSV(lesson); toast(`Exported ${n} rows`); } }, 'Export review CSV'));
}

export async function renderWords(main, course, dayId) {
  const days = dayId ? course.days.filter((d) => d.id === dayId) : course.days;
  const my = currentRoute();
  main.replaceChildren(loading());
  let lessons;
  try { lessons = await Promise.all(days.map((d) => loadLesson(d.id))); } catch { if (my === currentRoute()) loadFailed(main, () => renderWords(main, course, dayId)); return; }
  if (my !== currentRoute()) return;
  let filter = 'all';
  const list = h('ul.word-list');
  const count = h('p.hint', { role: 'status' });
  const paint = () => {
    const items = lessons.flatMap((L) => (L.vocab || []).map((w) => ({ ...w, day: L.day })))
      .filter((w) => filter === 'all' || (filter === 'known' ? words[w.hi] === 'known' : words[w.hi] !== 'known'));
    count.textContent = `${items.length} words`;
    list.replaceChildren(...items.map((w) => h('li.word', { 'data-know': words[w.hi] || '' },
      w.audio ? h('button.icon-btn', { type: 'button', 'aria-label': `Hear ${w.roman}`, onclick: () => playWord(w.audio) }, speakerIcon()) : h('span'),
      h('div', {},
        h('div.wh', { lang: 'hi', 'data-hi-only': '' }, w.hi),
        h('div.wr', { 'data-ro-only': '' }, w.roman),
        h('div.we', {}, w.en)),
      h('button.btn.small', { type: 'button', 'aria-pressed': String(words[w.hi] === 'known'),
        onclick: async (e) => { (await import('./state.js')).setWord(w.hi, 'known'); paint(); e.target.focus?.(); } },
      words[w.hi] === 'known' ? 'Known' : 'Mark known'))));
  };
  const sel = h('select', { 'aria-label': 'Show', onchange: (e) => { filter = e.target.value; paint(); } },
    h('option', { value: 'all' }, 'All words'), h('option', { value: 'learning' }, 'Still learning'), h('option', { value: 'known' }, 'Known'));
  const daySel = h('select', { 'aria-label': 'Day', onchange: (e) => { location.hash = e.target.value ? `#/words/${e.target.value}` : '#/words'; } },
    h('option', { value: '' }, 'Every day'), course.days.map((d) => h('option', { value: d.id, selected: d.id === dayId }, `Day ${d.day}: ${d.title_en}`)));
  main.replaceChildren(
    h('nav.crumbs', { 'aria-label': 'Breadcrumb' }, h('a', { href: '#/' }, 'Course'), h('span', { 'aria-hidden': 'true' }, '/'), h('span', {}, 'Words')),
    h('header.day-head', {}, h('h1', {}, dayId ? `Words for day ${days[0].day}` : 'Words'),
      h('p.hint', {}, 'Every word from the course glossary, with an AI-generated voice. Mark the ones you know.')),
    h('div.words-tools', {}, daySel, sel, count), list);
  paint();
}

let wordAudio;
export function playWord(src) {
  wordAudio ||= new Audio();
  wordAudio.src = 'media/' + src;
  wordAudio.play().catch(() => toast('Couldn\'t play this word. Check your connection.'));
}
export function speakerIcon() {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true');
  s.innerHTML = '<path d="M4 10v4h4l5 4V6L8 10H4z"/><path d="M16 9a4 4 0 0 1 0 6"/>';
  return s;
}

export function loading() { return h('div.state', { 'aria-busy': 'true' }, h('p', {}, 'Loading…')); }
export function notFound(main) {
  main.replaceChildren(h('div.state', {}, h('h1', {}, 'This page doesn\'t exist'), h('a.btn', { href: '#/' }, 'Go to the course')));
}
export function loadFailed(main, retry) {
  main.replaceChildren(h('div.state', { role: 'alert' }, h('h1', {}, 'The lesson didn\'t load'),
    h('p', {}, navigator.onLine ? 'Something went wrong fetching it. Try again.' : 'You\'re offline and this day isn\'t saved on this device.'),
    h('button.btn.primary', { type: 'button', onclick: retry }, 'Try again')));
}
export { settings };
