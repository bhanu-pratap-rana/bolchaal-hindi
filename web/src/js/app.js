// Boot, hash router and settings sheet.
import { loadCourse, loadLesson } from './data.js';
import { applySettings, settings, setSetting } from './state.js';
import { renderDay, renderHome, renderWords, notFound } from './views.js';
import { leaveScene, renderScene } from './scene.js';
import { initGloss } from './gloss.js';
import { registerSW, storageSummary } from './offline.js';
import { exportCourseCSV, reviewOn, reviewer, setReview, setReviewer } from './review.js';
import { $, $$, h, store, toast, transition } from './util.js';
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
    const chip = h('button.preview-chip', { type: 'button', 'aria-expanded': 'false', 'aria-controls': 'preview-banner', onclick: () => {
      b.hidden = !b.hidden; chip.setAttribute('aria-expanded', String(!b.hidden)); store.set('previewSeen', b.hidden);
    } }, 'Preview');
    $('#top .bar-nav').before(chip);
    b.replaceChildren(
      h('p', {}, h('b', {}, 'Preview. '), 'Lessons drafted with AI help, still being checked by a Hindi teacher. Voices are AI-generated.'),
      h('button.link-btn', { type: 'button', onclick: () => { b.hidden = true; chip.setAttribute('aria-expanded', 'false'); store.set('previewSeen', true); } }, 'Got it'));
    b.hidden = !!store.get('previewSeen', false);
    chip.setAttribute('aria-expanded', String(!b.hidden));
  }
  if (reviewOn()) {
    const b = $('#review-banner');
    const name = h('input', { type: 'text', value: reviewer(), placeholder: 'Your name', 'aria-label': 'Reviewer name', onchange: (e) => setReviewer(e.target.value.trim()) });
    const vbtn = (v, label) => h('button', { type: 'button', 'aria-pressed': String(settings.variant === v), onclick: (e) => {
      setSetting('variant', v); for (const x of e.currentTarget.parentElement.children) x.setAttribute('aria-pressed', String(x === e.currentTarget));
    } }, label);
    const exportAll = h('button.btn.small', { type: 'button', onclick: async () => {
      exportAll.disabled = true;
      try { const all = await Promise.all(course.days.map((d) => loadLesson(d.id))); const n = exportCourseCSV(all); toast(`Exported ${n} rows for ${all.length} days`); }
      catch { toast('Couldn\'t load every day. Check your connection.'); }
      exportAll.disabled = false;
    } }, 'Export all days');
    b.replaceChildren(
      h('p', {}, h('b', {}, 'Reviewer mode. '), 'Mark each line OK or Fix. Lines that are the same for both learners are marked once.'),
      h('div.review-tools', {}, name,
        h('div.seg.mini', { role: 'group', 'aria-label': 'Learner version to review' }, vbtn('m', 'Man learner'), vbtn('f', 'Woman learner')),
        exportAll,
        h('button.link-btn', { type: 'button', onclick: () => { setReview(false); location.href = location.pathname + location.hash; } }, 'Turn off')));
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
