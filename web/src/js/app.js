// Boot, hash router and settings sheet.
import { loadCourse, loadLesson } from './data.js';
import { applySettings, settings, setSetting } from './state.js';
import { renderDay, renderHome, renderWords, notFound } from './views.js';
import { leaveScene, renderScene } from './scene.js';
import { initGloss } from './gloss.js';
import { registerSW, storageSummary } from './offline.js';
import { reviewOn, setReview } from './review.js';
import { $, $$, h, transition } from './util.js';
import { currentRoute, nextRoute } from './route.js';

const main = document.getElementById('main');
let course;

async function route() {
  const hash = location.hash;
  // In-page anchors such as the skip link (#main) are not routes.
  if (hash && !hash.startsWith('#/')) return;
  const [path] = hash.replace(/^#/, '').split('?');
  const my = nextRoute();
  const parts = path.split('/').filter(Boolean);
  for (const a of $$('[data-nav]')) a.toggleAttribute('aria-current', false);
  const nav = (n) => $(`[data-nav="${n}"]`)?.setAttribute('aria-current', 'page');
  // Fetch the lesson first, outside the view transition, so the animation only wraps a quick DOM swap
  // and a slow network can't hold up the next navigation.
  const lessonId = parts[0] === 'day' ? parts[1] : parts[0] === 'scene' ? parts[1]?.replace(/s\d+$/, '') : null;
  if (lessonId) {
    if (parts[0] === 'scene') leaveScene();
    main.setAttribute('aria-busy', 'true');
    await loadLesson(lessonId).catch(() => {});
    main.removeAttribute('aria-busy');
    if (my !== currentRoute()) return;
  }
  const render = async () => {
    if (parts[0] !== 'scene') leaveScene();
    if (!parts.length) { nav('home'); renderHome(main, course); document.title = 'Bolchaal Hindi: spoken Hindi for travellers'; }
    else if (parts[0] === 'day' && parts[1]) { nav('home'); await renderDay(main, course, parts[1]); document.title = `Day ${parseInt(parts[1].slice(1), 10) || ''}: Bolchaal Hindi`; }
    else if (parts[0] === 'scene' && parts[1]) { nav('home'); await renderScene(main, course, parts[1]); document.title = `${$('#scene-title')?.textContent || 'Scene'}: Bolchaal Hindi`; }
    else if (parts[0] === 'words') { nav('words'); await renderWords(main, course, parts[1]); document.title = 'Words: Bolchaal Hindi'; }
    else notFound(main);
  };
  await transition(render);
  if (my !== currentRoute()) return;
  window.scrollTo(0, 0);
  const t = main.querySelector('h1') || main;
  if (!t.hasAttribute('tabindex')) t.setAttribute('tabindex', '-1');
  t.focus({ preventScroll: true });
}

function initSettings() {
  const dlg = $('#settings');
  const form = $('#settings-form');
  const sync = () => {
    for (const k of ['variant', 'script', 'theme']) {
      const el = form.querySelector(`input[name="${k}"][value="${settings[k]}"]`);
      if (el) el.checked = true;
    }
    form.english.checked = settings.english;
    form.listenFirst.checked = settings.listenFirst;
  };
  form.addEventListener('change', (e) => {
    const t = e.target;
    setSetting(t.name, t.type === 'checkbox' ? t.checked : t.value);
  });
  $('#open-settings').addEventListener('click', async () => {
    sync();
    $('#voice-list').replaceChildren(...Object.values(course.voices).filter((v, i, a) => a.findIndex((x) => x.label === v.label) === i)
      .map((v) => h('li', {}, `${v.label} (${v.gender === 'm' ? 'male' : 'female'} voice): ${v.licence}${v.commercial ? '' : '. Not licensed for commercial use: demo only.'}`)));
    const s = await storageSummary();
    if (s) $('#storage-info').textContent = s;
    dlg.showModal();
  });
}

function banners() {
  if (course.preview) {
    const b = $('#preview-banner');
    b.textContent = 'Preview: these lessons were drafted with AI help and are still being checked by students and a Hindi teacher. Voices are AI-generated. Use the flag on any line to report a problem.';
    b.hidden = false;
  }
  if (reviewOn()) {
    const b = $('#review-banner');
    b.replaceChildren('Reviewer mode is on: mark each line OK or Fix, then export the CSV from the day page. ',
      h('button.link-btn', { type: 'button', onclick: () => { setReview(false); location.href = location.pathname + location.hash; } }, 'Turn off'));
    b.hidden = false;
  }
}

async function boot() {
  applySettings();
  initSettings();
  initGloss();
  try {
    course = await loadCourse();
  } catch {
    main.replaceChildren(h('div.state', { role: 'alert' }, h('h1', {}, 'The course didn\'t load'),
      h('p', {}, 'Check your connection, then reload the page.'), h('button.btn.primary', { type: 'button', onclick: () => location.reload() }, 'Reload')));
    return;
  }
  banners();
  addEventListener('hashchange', route);
  route();
  registerSW();
}

boot();
