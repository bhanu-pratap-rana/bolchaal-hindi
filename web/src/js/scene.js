// Scene page: Listen, Speak and Check modes over one stitched audio file, plus reviewer tools.
import { lineText, loadLesson } from './data.js';
import { ScenePlayer, mediaSession } from './player.js';
import { buildQuestions } from './check.js';
import { Recorder, micErrorMessage, recordSupported } from './record.js';
import { mark, marks, reviewOn, reviewer, setReviewer } from './review.js';
import { markScene, onSettings, progress, setLastPlace, setSetting, settings, words } from './state.js';
import { announce, fmtTime, h, initial, roleColors, toast } from './util.js';
import { loadFailed, loading, notFound, playWord } from './views.js';
import { openGloss } from './gloss.js';
import { currentRoute } from './route.js';
import { openReport } from './report.js';

const SPEEDS = [0.6, 0.8, 1, 1.2];
const ICON = {
  play: '<path d="M8 5v14l11-7z"/>', pause: '<path d="M7 5h4v14H7zM13 5h4v14h-4z"/>',
  prev: '<path d="M6 6v12M18 6l-9 6 9 6z"/>', next: '<path d="M18 6v12M6 6l9 6-9 6z"/>',
  replay: '<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v4h4"/>', flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
};
const svg = (name, fill = false) => {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true');
  if (fill) s.style.cssText = 'fill:currentColor;stroke:none';
  s.innerHTML = ICON[name];
  return s;
};

let active = null; // the scene currently on screen, so the router can tear it down

export function leaveScene() {
  active?.destroy();
  active = null;
}

export async function renderScene(main, course, sceneId) {
  leaveScene();
  const dayId = sceneId.replace(/s\d+$/, '');
  const day = course.days.find((d) => d.id === dayId);
  if (!day) return notFound(main);
  const my = currentRoute();
  main.replaceChildren(loading());
  let lesson;
  try { lesson = await loadLesson(dayId); } catch { if (my === currentRoute()) loadFailed(main, () => renderScene(main, course, sceneId)); return; }
  if (my !== currentRoute()) return;
  leaveScene();
  const idx = lesson.scenes.findIndex((s) => s.id === sceneId);
  if (idx < 0) return notFound(main);
  active = new SceneView(main, course, lesson, idx);
}

class SceneView {
  constructor(main, course, lesson, idx) {
    this.main = main; this.course = course; this.lesson = lesson; this.idx = idx;
    this.scene = lesson.scenes[idx];
    const params = new URLSearchParams(location.hash.split('?')[1] || '');
    this.mode = params.get('mode') || 'listen';
    this.startLine = params.has('line') ? Number(params.get('line')) : null;
    this.seen = new Set(); // lines that became active while audio was playing
    this.colors = roleColors(lesson);
    this.learner = Object.keys(lesson.roles).find((r) => lesson.roles[r].learner);
    this.heard = new Set();
    this.review = reviewOn();
    this.player = new ScenePlayer();
    this.player.setRate(settings.speed);
    this.recorder = recordSupported ? new Recorder() : null;
    this.vocab = [...(lesson.vocab || [])].sort((a, b) => b.hi.length - a.hi.length);
    setLastPlace({ day: lesson.id, scene: this.scene.id });
    this.build();
    this.bind();
    this.loadAudio();
    this.offSettings = onSettings((k) => {
      if (k === 'variant') this.loadAudio(true);
      if (['variant', 'listenFirst'].includes(k)) this.renderBody();
      if (k === 'speed') this.player.setRate(settings.speed);
    });
  }

  get v() { return settings.variant; }
  get variant() { return this.scene.variants[this.v] || this.scene.variants.m; }
  roleName(r) { const x = this.lesson.roles[r]; return x.learner ? `You (${x.en})` : x.en; }
  voiceLabel(r) {
    const slot = this.lesson.roles[r].voice[this.v];
    const vc = this.course.voices[slot];
    return vc ? `${vc.label}, AI voice` : 'AI voice';
  }

  build() {
    const { lesson, scene } = this;
    const sceneRoles = [...new Set(scene.lines.map((l) => l.role))];
    sceneRoles.sort((a) => (a === this.learner ? -1 : 1));
    this.castEls = {};
    const cast = h('ul.cast', { 'aria-label': 'Who speaks in this scene', tabindex: '0' }, sceneRoles.map((r) => {
      const el = h('li.who', { class: r === this.learner ? 'who you' : 'who', style: { '--c': this.colors[r] } },
        h('span.av', { 'aria-hidden': 'true' }, initial(lesson.roles[r].en)),
        h('span', {}, this.roleName(r)), h('span.vn', {}, this.voiceLabel(r)));
      this.castEls[r] = el;
      return el;
    }));
    this.modeBtns = ['listen', 'speak', 'check'].map((m) => h('button', { type: 'button', 'data-mode': m, 'aria-pressed': String(this.mode === m),
      onclick: () => this.setMode(m) },
    h('span.hi-ui', { lang: 'hi', 'data-hi-only': '' }, { listen: 'सुनें', speak: 'बोलें', check: 'जाँचें' }[m]),
    { listen: 'Listen', speak: 'Speak', check: 'Check' }[m]));
    this.body = h('div.scene-body');
    this.aside = h('aside.aside', { 'aria-label': 'About this scene' });
    const prev = lesson.scenes[this.idx - 1], next = lesson.scenes[this.idx + 1];
    this.main.classList.add('has-player');
    this.main.replaceChildren(
      h('nav.crumbs', { 'aria-label': 'Breadcrumb' },
        h('a', { href: '#/' }, 'Course'), h('span', { 'aria-hidden': 'true' }, '/'),
        h('a', { href: `#/day/${lesson.id}` }, `Day ${lesson.day}`), h('span', { 'aria-hidden': 'true' }, '/'),
        h('span', {}, `Scene ${this.idx + 1} of ${lesson.scenes.length}`)),
      h('div.scene', {},
        h('div', {},
          h('header.scene-head', {},
            h('p.t-hi', { lang: 'hi', 'data-hi-only': '' }, scene.title_hi),
            h('h1', { tabindex: '-1', id: 'scene-title' }, scene.title_en),
            scene.situation ? h('p.situation', {}, scene.situation) : null,
            h('div.modes', { role: 'group', 'aria-label': 'Practice mode' }, this.modeBtns),
            cast),
          h('div', { style: { marginTop: '20px' } }, this.body),
          h('nav.day-actions', { 'aria-label': 'Other scenes', style: { marginTop: '24px' } },
            prev ? h('a.btn', { href: `#/scene/${prev.id}` }, 'Previous scene') : null,
            next ? h('a.btn', { href: `#/scene/${next.id}` }, 'Next scene') : h('a.btn', { href: `#/day/${lesson.id}` }, `Back to day ${lesson.day}`))),
        this.aside));
    this.buildPlayer();
    this.renderBody();
    this.renderAside();
  }

  buildPlayer() {
    this.playBtn = h('button.play', { type: 'button', 'aria-label': 'Play' }, svg('play', true));
    this.segs = h('div.segs', { 'aria-hidden': 'true' });
    this.head = h('span.playhead', { 'aria-hidden': 'true' });
    this.range = h('input', { type: 'range', min: '0', max: '1000', value: '0', step: '1', 'aria-label': 'Position in the conversation' });
    this.timeEl = h('span.time', {}, '0:00 / 0:00');
    this.nowL = h('div.nl', {}, 'Now speaking');
    this.nowT = h('div.nt', {}, 'Press play to start');
    this.speedBtn = h('button.speed', { type: 'button', 'aria-label': `Speed ${settings.speed} times` }, `${settings.speed}×`);
    this.playerEl = h('section.player', { 'aria-label': 'Player' }, h('div.player-in', {},
      h('div.timeline', {}, this.segs, this.head, this.range),
      h('div.controls', {},
        h('button.icon-btn', { type: 'button', 'aria-label': 'Previous line', 'aria-keyshortcuts': 'J', onclick: () => this.step(-1) }, svg('prev')),
        this.playBtn,
        h('button.icon-btn', { type: 'button', 'aria-label': 'Next line', 'aria-keyshortcuts': 'L', onclick: () => this.step(1) }, svg('next')),
        h('button.icon-btn', { type: 'button', 'aria-label': 'Replay this line', 'aria-keyshortcuts': 'R', onclick: () => this.replay(Math.max(0, this.player.index)) }, svg('replay')),
        h('div.now', {}, this.nowL, this.nowT),
        this.speedBtn, this.timeEl),
      h('p.keys', {}, 'Keyboard: Space plays or pauses, J and L move a line, R replays the line.')));
    document.getElementById('main').before(this.playerEl); // tab order: header, player, then the lines
    this.playerEl.hidden = this.mode === 'check';
    this.playBtn.addEventListener('click', () => this.togglePlay());
    this.speedBtn.addEventListener('click', () => {
      const n = SPEEDS[(SPEEDS.indexOf(settings.speed) + 1) % SPEEDS.length] || 1;
      setSetting('speed', n);
      this.speedBtn.textContent = `${n}×`;
      this.speedBtn.setAttribute('aria-label', `Speed ${n} times`);
      announce(`Speed ${n} times`);
    });
    this.range.addEventListener('input', () => { this.pendingTurn = null; this.player.seek((this.range.value / 1000) * this.player.duration); });
  }

  paintSegs() {
    const { cues, duration } = this.variant;
    this.segEls = cues.map(([a], i) => h('i', { style: { '--c': this.colors[this.scene.lines[i].role],
      flex: `${((cues[i + 1]?.[0] ?? duration) - a) / duration} 1 0` } }));
    this.segs.replaceChildren(...this.segEls);
  }

  loadAudio(keepPlace = false) {
    const at = keepPlace && this.player.index >= 0 ? this.variant.cues[this.player.index]?.[0] ?? 0 : 0;
    const wasPlaying = keepPlace && this.player.playing;
    this.playBtn.disabled = true;
    this.nowT.textContent = 'Loading the conversation…';
    this.player.load('media/' + this.variant.audio, this.variant.cues, { at });
    this.paintSegs();
    for (const r of Object.keys(this.castEls)) this.castEls[r].querySelector('.vn').textContent = this.voiceLabel(r);
    if (wasPlaying) this.player.audio.addEventListener('canplay', () => { if (this.mode === 'speak') this.continueSpeak(Math.max(0, this.player.index)); else this.player.play(); }, { once: true });
  }

  bind() {
    const p = this.player;
    p.addEventListener('ready', () => {
      this.playBtn.disabled = false;
      if (!p.playing && p.index <= 0 && this.mode !== 'speak') this.nowT.textContent = 'Press play to start';
      this.errorEl?.remove();
      if (this.startLine != null && this.variant.cues[this.startLine]) {
        const i = this.startLine;
        this.startLine = null;
        p.seek(this.variant.cues[i][0] + 0.001);
        this.lineEls?.[i]?.scrollIntoView({ block: 'center' });
        this.lineEls?.[i]?.classList.add('found');
      }
    });
    p.addEventListener('error', () => this.showError());
    p.addEventListener('blocked', () => toast('Tap play to start the audio'));
    p.addEventListener('state', () => {
      const playing = p.playing;
      this.playBtn.replaceChildren(svg(playing ? 'pause' : 'play', true));
      this.playBtn.setAttribute('aria-label', playing ? 'Pause' : 'Play');
      this.speedBtn.dataset.rate = String(p.audio.playbackRate); // the rate actually applied (checked by tests)
      if (!playing && p.index >= 0 && this.mode !== 'check') this.nowL.textContent = 'Paused';
      if (playing && p.index >= 0) this.onLine(p.index); // refresh the "now speaking" text when playback starts
    });
    p.addEventListener('line', (e) => this.onLine(e.detail));
    p.addEventListener('progress', (e) => this.onProgress(e.detail));
    p.addEventListener('stopped', () => this.onStopped());
    p.addEventListener('ended', () => this.onEnded());
    this.keys = (e) => {
      if (e.target.closest('input, textarea, select, dialog') || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === ' ' && !e.target.closest('button, a')) { e.preventDefault(); this.togglePlay(); }
      else if (e.key === 'j' || e.key === 'J') this.step(-1);
      else if (e.key === 'l' || e.key === 'L') this.step(1);
      else if (e.key === 'r' || e.key === 'R') this.replay(Math.max(0, p.index));
    };
    document.addEventListener('keydown', this.keys);
    this.offMedia = mediaSession(p, { title: this.scene.title_en, artist: 'Bolchaal Hindi (AI voices)', album: `Day ${this.lesson.day}: ${this.lesson.title_en}` },
      { prev: () => this.step(-1), next: () => this.step(1) });
  }

  step(d) { this.pendingTurn = null; this.player.step(d); }
  replay(i) { this.pendingTurn = null; this.player.playLine(i); }

  /** kind 'first' hides everything (listen first); 'turn' hides Hindi and Roman but keeps the English cue */
  setHidden(el, hidden, kind = 'first') {
    el.dataset.hidden = hidden ? kind : 'false';
    for (const t of el.querySelectorAll(kind === 'turn' ? '.t-hi, .t-ro' : '.t-hi, .t-ro, .t-en')) t.toggleAttribute('aria-hidden', hidden);
    if (!hidden) for (const t of el.querySelectorAll('[aria-hidden]:is(.t-hi, .t-ro, .t-en)')) t.removeAttribute('aria-hidden');
  }

  togglePlay() {
    const p = this.player;
    if (p.playing) { p.pause(); return; }
    if (p.audio.ended || (p.duration && p.time >= p.duration - 0.05)) p.seek(0);
    if (this.mode === 'speak') { this.continueSpeak(Math.max(0, p.index)); return; }
    p.play();
  }

  showError() {
    this.playBtn.disabled = true;
    this.nowT.textContent = 'Audio didn\'t load';
    this.errorEl?.remove();
    this.errorEl = h('div.state', { role: 'alert' },
      h('h2', {}, 'The audio for this scene didn\'t load'),
      h('p', {}, navigator.onLine ? 'Check your connection, then try again.' : 'You\'re offline. Save a day for offline use while you have a connection.'),
      h('button.btn.primary', { type: 'button', onclick: () => this.loadAudio(true) }, 'Try again'));
    this.body.prepend(this.errorEl);
  }

  // ---------- rendering ----------
  renderBody() {
    if (this.mode === 'check') return this.renderCheck();
    const review = this.review ? marks(this.lesson.id) : null;
    this.lineEls = this.scene.lines.map((ln, i) => this.renderLine(ln, i, review));
    this.body.replaceChildren(h('ol.lines', { 'aria-label': 'Conversation' }, this.lineEls));
    this.playerEl && (this.playerEl.hidden = this.mode === 'check');
    if (this.player.index >= 0) this.onLine(this.player.index);
  }

  renderLine(ln, i, review) {
    const t = lineText(ln, this.v);
    const you = ln.role === this.learner;
    const role = this.lesson.roles[ln.role];
    const hideFirst = settings.listenFirst && !this.heard.has(i);
    const hideTurn = this.mode === 'speak' && you && !this.heard.has(i);
    const spoken = this.scene.spoken?.[`${i}:${this.v}`];
    const report = `${this.course.report_url}?title=${encodeURIComponent(`Problem in ${this.scene.id} line ${i + 1}`)}&body=${encodeURIComponent(
      `Scene: ${this.scene.id} (${this.scene.title_en})\nLine: ${i + 1}\nLearner: ${this.v === 'f' ? 'woman' : 'man'}\nHindi: ${t.hi}\nRoman: ${t.roman}\nEnglish: ${t.en}\n\nWhat's wrong (text, translation, or how the voice says it):\n`)}`;
    const li = h('li.ln', { style: { '--c': this.colors[ln.role] }, 'data-you': String(you), 'data-i': String(i),
      'data-hidden': 'false' },
    h('span.av', { 'aria-hidden': 'true' }, initial(role.en)),
    h('div.txt', {},
      h('div.who-l', {}, h('b', {}, this.roleName(ln.role)), h('span', { lang: 'hi', 'data-hi-only': '' }, ` ${role.hi}`),
        t.fem ? h('span.fem', {}, 'woman\'s form') : null),
      h('p.t-hi', { lang: 'hi', 'data-hi-only': '' }, h('span.rekha', { 'aria-hidden': 'true' }), this.linkWords(t.hi.replace(/(\d)।/g, '$1 ।'))),
      h('p.t-ro', { 'data-ro-only': '' }, t.roman),
      h('p.t-en', {}, t.en),
      this.review && spoken ? h('p.spoken', {}, `The voice was given: ${spoken}`) : null),
    h('div.tools', {},
      h('button.icon-btn', { type: 'button', 'aria-label': `Play line ${i + 1}`, onclick: () => this.replay(i) }, svg('replay')),
      h('button.icon-btn', { type: 'button', 'aria-label': `Report a problem with line ${i + 1}`,
        onclick: () => openReport({ scene: this.scene, i, t, v: this.v, githubUrl: report }) }, svg('flag'))),
    review ? this.reviewBox(i, review) : null);
    if (settings.script === 'roman') li.querySelector('.t-ro').prepend(h('span.rekha', { 'aria-hidden': 'true' }));
    if (hideTurn) this.setHidden(li, true, 'turn'); else if (hideFirst) this.setHidden(li, true, 'first');
    return li;
  }

  linkWords(text) {
    const out = [];
    let rest = text;
    const isLetter = (ch) => !!ch && /[ऀ-ॣ०-ॿ]/.test(ch);
    while (rest) {
      let best = null;
      for (const w of this.vocab) {
        let from = 0, at;
        while ((at = rest.indexOf(w.hi, from)) >= 0) {
          if (!isLetter(rest[at - 1]) && !isLetter(rest[at + w.hi.length])) break;
          from = at + 1;
        }
        if (at >= 0 && (!best || at < best.at)) best = { at, w };
      }
      if (!best) { out.push(rest); break; }
      if (best.at) out.push(rest.slice(0, best.at));
      const w = best.w;
      out.push(h('button.w', { type: 'button', lang: 'hi', 'aria-label': `${w.hi}: ${w.en}`, onclick: () => openGloss(w) }, w.hi));
      rest = rest.slice(best.at + w.hi.length);
    }
    return out;
  }

  reviewBox(i, all) {
    const box = h('div.review-box');
    const paint = () => {
      const m = all[`${this.scene.id}|${i}|${this.v}`] || {};
      const same = !this.scene.lines[i].f; // identical for both learners: one mark covers both
      const save = (patch) => {
        for (const v of same ? ['m', 'f'] : [this.v]) all[`${this.scene.id}|${i}|${v}`] = mark(this.lesson.id, this.scene.id, i, v, patch);
      };
      box.replaceChildren(
        h('span.hint', {}, same ? 'Both learners:' : this.v === 'f' ? 'Woman learner:' : 'Man learner:'),
        h('div.seg.mini', { role: 'group', 'aria-label': `Review line ${i + 1}` },
          ['OK', 'FIX'].map((st) => h('button', { type: 'button', 'data-st': st, 'aria-pressed': String(m.status === st),
            onclick: () => { save({ status: m.status === st ? '' : st }); paint(); } }, st === 'OK' ? 'OK' : 'Fix'))),
        h('input', { type: 'text', value: m.note || '', placeholder: 'What should change?', 'aria-label': `Note for line ${i + 1}`,
          onchange: (e) => save({ note: e.target.value }) }));
    };
    paint();
    return box;
  }

  renderAside() {
    const inScene = (this.lesson.vocab || []).filter((w) => this.scene.lines.some((l) => lineText(l, this.v).hi.includes(w.hi)));
    const pr = progress[this.scene.id] || {};
    const next = this.lesson.scenes[this.idx + 1];
    const reviewPanel = this.review ? h('section.panel', {},
      h('h2', {}, 'Review this scene'),
      h('p', {}, `Reviewing as ${reviewer() || 'an unnamed reviewer'}, ${this.v === 'f' ? 'woman' : 'man'} learner version. Set your name and the version in the green bar at the top.`),
      h('button.btn', { type: 'button', onclick: () => {
        const all = marks(this.lesson.id);
        this.scene.lines.forEach((ln, i) => {
          for (const v of ln.f ? [this.v] : ['m', 'f']) if (!all[`${this.scene.id}|${i}|${v}`]?.status) mark(this.lesson.id, this.scene.id, i, v, { status: 'OK' });
        });
        this.renderBody(); toast('Unmarked lines set to OK');
      } }, 'Mark the rest OK')) : null;
    this.aside.replaceChildren(...[
      reviewPanel,
      pr.heard ? h('section.panel.done-card', {},
        h('h2', {}, 'You\'ve heard this scene'),
        h('p', {}, pr.best != null ? `Best check score: ${pr.best} of ${pr.total}.` : 'Try Speak mode to say your lines, or Check to test your listening.'),
        h('div.day-actions', {},
          this.mode !== 'speak' ? h('button.btn', { type: 'button', onclick: () => this.setMode('speak') }, 'Practise speaking') : null,
          next ? h('a.btn.primary', { href: `#/scene/${next.id}` }, 'Next scene') : h('a.btn.primary', { href: `#/day/${this.lesson.id}` }, 'Finish the day'))) : null,
      inScene.length ? h('section.panel', {},
        h('h2', {}, 'Words in this scene'),
        h('div.vocab-strip', {}, inScene.map((w) => h('button.chip', { type: 'button', 'data-know': words[w.hi] || '', onclick: () => openGloss(w) },
          h('span', { lang: 'hi', 'data-hi-only': '' }, w.hi), h('small', { 'data-ro-only': '' }, w.roman))))) : null,
      h('section.panel', {},
        h('h2', {}, 'About these voices'),
        h('p', {}, 'Each role has its own AI-generated voice. They are not recordings of people, so a word may sound slightly off. Use the flag on a line to report it.'))].filter(Boolean));
  }

  // ---------- playback events ----------
  onLine(i) {
    if (!this.lineEls) return;
    this.lineEls.forEach((el, j) => {
      el.dataset.active = String(j === i);
      if (j < i) { el.dataset.heard = 'true'; this.reveal(j); }
    });
    const ln = this.scene.lines[i];
    for (const [r, el] of Object.entries(this.castEls)) el.dataset.speaking = String(ln && r === ln.role && this.player.playing);
    if (!ln) return;
    const t = lineText(ln, this.v);
    const turnPending = this.mode === 'speak' && ln.role === this.learner && !this.heard.has(i);
    this.nowL.textContent = `Line ${i + 1} of ${this.scene.lines.length}: ${this.roleName(ln.role)}`;
    this.nowT.textContent = this.mode === 'check' ? 'Listening…' : turnPending ? `Your line: “${t.en}”`
      : settings.script === 'hindi' ? t.hi : t.roman;
    if (this.player.playing) {
      if (this.mode === 'listen' && !this.player.stopAt) this.seen.add(i);
      if (!turnPending) this.reveal(i);
      if (this.mode !== 'check') announce(`${this.roleName(ln.role)}: ${t.en}`);
      const el = this.lineEls[i];
      const r = el.getBoundingClientRect();
      if (r.bottom > innerHeight - this.playerEl.offsetHeight - 16 || r.top < 80)
        el.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    }
  }

  reveal(i) {
    this.heard.add(i);
    const el = this.lineEls?.[i];
    if (el && el.dataset.hidden !== 'false' && !el.querySelector('.turn')) this.setHidden(el, false);
  }

  onProgress({ t, i, p }) {
    const d = this.player.duration || this.variant.duration;
    if (document.activeElement !== this.range) this.range.value = String(Math.round((t / d) * 1000));
    this.range.setAttribute('aria-valuetext', `Line ${Math.max(1, i + 1)} of ${this.scene.lines.length}, ${fmtTime(t)}`);
    this.head.style.setProperty('--x', `${(t / d) * 100}%`);
    this.timeEl.textContent = `${fmtTime(t)} / ${fmtTime(d)}`;
    this.segEls?.forEach((s, j) => s.classList.toggle('past', j <= i));
    const el = this.lineEls?.[i];
    if (el) for (const r of el.querySelectorAll('.rekha')) r.style.setProperty('--p', p.toFixed(3));
  }

  onEnded() {
    this.lineEls?.forEach((el, j) => { el.dataset.heard = 'true'; this.reveal(j); });
    if (this.mode === 'listen' || this.mode === 'speak') {
      const enough = this.mode === 'speak' || this.seen.size >= Math.ceil(this.scene.lines.length * 0.8);
      const first = enough && !progress[this.scene.id]?.heard;
      if (enough) markScene(this.scene.id, this.mode === 'speak' ? { heard: true, spoke: true } : { heard: true });
      this.nowL.textContent = 'Finished';
      this.nowT.textContent = 'Play again, or try Speak or Check';
      announce(first ? 'Scene finished. Marked as heard.' : 'Scene finished.');
      this.renderAside();
      this.showEndCard(enough);
    }
  }

  showEndCard(done) {
    this.body.querySelector('.end-card')?.remove();
    const next = this.lesson.scenes[this.idx + 1];
    const dayDone = this.lesson.scenes.every((s) => progress[s.id]?.heard);
    const card = h('section.end-card', { 'aria-labelledby': 'end-title' },
      h('h2#end-title', { tabindex: '-1' }, dayDone ? `Day ${this.lesson.day} complete` : done ? 'Scene done' : 'End of the conversation'),
      h('p', {}, dayDone ? 'You\'ve heard every scene of this day. Practise your lines, or move on to the next day.'
        : this.mode === 'speak' ? 'You said every one of your lines. Try Check, or go on to the next scene.'
          : 'Now say your side in Speak mode, or test your listening in Check.'),
      h('div.day-actions', {},
        this.mode !== 'speak' ? h('button.btn', { type: 'button', onclick: () => this.setMode('speak') }, 'Practise my lines') : null,
        h('button.btn', { type: 'button', onclick: () => this.setMode('check') }, 'Check my listening'),
        next ? h('a.btn.primary', { href: `#/scene/${next.id}` }, 'Next scene')
          : h('a.btn.primary', { href: dayDone ? `#/day/${nextDayId(this.course, this.lesson.id) || this.lesson.id}` : `#/day/${this.lesson.id}` }, dayDone && nextDayId(this.course, this.lesson.id) ? 'Start the next day' : 'Back to the day')));
    this.body.append(card);
    card.scrollIntoView({ block: 'nearest' });
  }

  // ---------- modes ----------
  setMode(m) {
    this.playerEl.hidden = m === 'check';
    if (m === this.mode) return;
    this.mode = m;
    this.player.pause();
    this.player.stopAt = null;
    this.pendingTurn = null;
    this.recorder?.discard();
    this.modeBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === m)));
    history.replaceState(null, '', `#/scene/${this.scene.id}${m === 'listen' ? '' : `?mode=${m}`}`);
    if (m === 'speak') this.heard = new Set([...this.heard].filter((i) => this.scene.lines[i].role !== this.learner));
    this.renderBody();
    this.renderAside();
    announce({ listen: 'Listen mode', speak: 'Speak mode: the player stops before each of your lines', check: 'Check mode' }[m]);
  }

  nextLearnerLine(from) {
    for (let j = from; j < this.scene.lines.length; j++) if (this.scene.lines[j].role === this.learner) return j;
    return null;
  }

  /** Speak mode: play up to the learner's next line, then hand over */
  continueSpeak(from) {
    const j = this.nextLearnerLine(from);
    this.pendingTurn = j;
    if (j === from) { this.showTurn(j); return; }
    this.player.playFrom(from, j);
  }

  onStopped() {
    if (this.mode === 'speak' && this.pendingTurn != null) {
      const j = this.pendingTurn;
      this.pendingTurn = null;
      this.player.seek(this.variant.cues[j][0] + 0.001);
      this.showTurn(j);
    }
  }

  showTurn(j) {
    const el = this.lineEls[j];
    el.querySelector('.turn')?.remove();
    const t = lineText(this.scene.lines[j], this.v);
    const status = h('p', {}, `Your turn. Say “${t.en}” in Hindi, then hear how it sounds.`);
    const recBtn = this.recorder ? h('button.btn', { type: 'button' }, 'Record myself') : null;
    const compareBtn = h('button.btn', { type: 'button', hidden: true }, 'Play mine, then the model');
    const turn = h('div.turn', { role: 'group', 'aria-label': 'Your turn' }, status,
      h('button.btn.small', { type: 'button', onclick: (e) => { this.setHidden(el, false); e.currentTarget.hidden = true; } }, 'Show the words'),
      recBtn, compareBtn,
      h('button.btn.accent', { type: 'button', onclick: () => { this.setHidden(el, false); this.heard.add(j); this.replay(j); } }, 'Hear it'),
      h('button.btn.primary', { type: 'button', onclick: () => { this.playBtn.focus({ preventScroll: true }); turn.remove(); this.setHidden(el, false); this.heard.add(j); this.recorder?.discard();
        const k = j + 1;
        if (k < this.scene.lines.length) this.continueSpeak(k); else this.onEnded(); } }, 'Next line'));
    recBtn?.addEventListener('click', async () => {
      if (this.recorder.active) {
        await this.recorder.stop();
        recBtn.textContent = 'Record again';
        compareBtn.hidden = false;
        status.textContent = 'Recorded. Compare your version with the model.';
        return;
      }
      try {
        await this.recorder.start();
        recBtn.replaceChildren(h('span.rec-dot', { 'aria-hidden': 'true' }), 'Stop recording');
        status.textContent = 'Recording… say the line, then press Stop.';
      } catch (err) {
        status.textContent = micErrorMessage(err);
        recBtn.hidden = true;
      }
    });
    compareBtn.addEventListener('click', async () => {
      status.textContent = 'Your version…';
      await this.recorder.play();
      status.textContent = 'The model…';
      this.setHidden(el, false);
      this.replay(j);
    });
    el.append(turn);
    this.nowL.textContent = 'Your turn';
    this.nowT.textContent = `Say it in Hindi: “${t.en}”`;
    announce('Your turn. Say the line, then press Hear it or Next line.');
    turn.querySelector('.btn.accent').focus({ preventScroll: true });
    // keep the whole turn card, including Next line, clear of the player bar
    turn.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }

  renderCheck(attempt = 0) {
    const qs = buildQuestions(this.lesson, this.scene, this.v, attempt);
    if (!qs.length) {
      this.body.replaceChildren(h('div.quiz', {}, h('h2', {}, 'No questions for this scene'), h('p', {}, 'It is too short for a listening check.')));
      return;
    }
    let n = 0, score = 0;
    const results = [];
    const card = h('section.quiz', { 'aria-labelledby': 'q-title' });
    const ask = () => {
      const q = qs[n];
      const t = lineText(this.scene.lines[q.line], this.v);
      const dots = h('span.qdots', { 'aria-hidden': 'true' }, qs.map((_, j) => h('i', { class: j < n ? (results[j] ? 'ok' : 'no') : j === n ? 'now' : '' })));
      const hear = h('button.btn.accent', { type: 'button', onclick: () => this.replay(q.line) }, svg('replay'), 'Hear the line');
      const prompt = {
        meaning: () => [h('h2#q-title', { tabindex: '-1' }, 'Listen. What does this line mean?')],
        spot: () => [h('h2#q-title', { tabindex: '-1' }, 'Listen. Which word do you hear?')],
        gap: () => [h('h2#q-title', { tabindex: '-1' }, 'Listen. Which word fills the gap?'),
          h('p.prompt-hi', { lang: 'hi', 'data-hi-only': '' }, ...q.masked.split('\u0000').flatMap((part, k) => k ? [h('span.gap', { 'aria-label': 'missing word' }, '?'), part] : [part])),
          h('p', { 'data-ro-only': '' }, h('span.hint', {}, 'Roman: '), q.maskedRoman),
          h('p.hint', {}, t.en)],
      }[q.kind]();
      const feedback = h('p.feedback', { role: 'status' });
      const nextBtn = h('button.btn.primary', { type: 'button', hidden: true }, n + 1 < qs.length ? 'Next question' : 'See my score');
      const opts = h('div.opts', {}, q.options.map((o) => {
        const isObj = typeof o === 'object';
        const val = isObj ? o.hi : o;
        return h('button.opt', { type: 'button', 'data-val': val },
          isObj ? [h('span', { lang: 'hi', 'data-hi-only': '' }, o.hi), o.roman ? h('span', { 'data-ro-only': '' }, settings.script === 'both' ? ` (${o.roman})` : o.roman) : null] : o);
      }));
      opts.addEventListener('click', (e) => {
        const b = e.target.closest('.opt');
        if (!b || opts.dataset.done) return;
        opts.dataset.done = '1';
        const ok = b.dataset.val === q.answer;
        results[n] = ok; if (ok) score++;
        for (const x of opts.children) { x.disabled = true; if (x.dataset.val === q.answer) x.dataset.r = 'ok'; }
        if (!ok) b.dataset.r = 'no';
        feedback.className = `feedback ${ok ? 'ok' : 'no'}`;
        feedback.textContent = ok ? 'Right.' : `Not quite. The line was: ${settings.script === 'roman' ? t.roman : t.hi} (${t.en})`;
        if (!ok) this.player.playLine(q.line);
        nextBtn.hidden = false;
        nextBtn.focus();
      });
      nextBtn.addEventListener('click', () => { n++; if (n < qs.length) ask(); else finish(); });
      card.replaceChildren(h('div.quiz-top', {}, h('span', {}, `Question ${n + 1} of ${qs.length}`), dots), ...prompt, hear, opts, feedback, nextBtn);
      card.querySelector('#q-title').focus({ preventScroll: true });
    };
    const finish = () => {
      const best = Math.max(score, progress[this.scene.id]?.best ?? 0);
      markScene(this.scene.id, { best, total: qs.length });
      card.replaceChildren(h('h2#q-title', { tabindex: '-1' }, `You got ${score} of ${qs.length}`),
        h('p', {}, score === qs.length ? 'Every one right.' : 'Replay the scene in Listen mode and try again with new questions.'),
        h('div.day-actions', {},
          h('button.btn.primary', { type: 'button', onclick: () => this.renderCheck(attempt + 1) }, 'Try new questions'),
          h('button.btn', { type: 'button', onclick: () => this.setMode('listen') }, 'Listen again')));
      card.querySelector('#q-title').focus({ preventScroll: true });
      this.renderAside();
      announce(`You got ${score} of ${qs.length}`);
    };
    this.body.replaceChildren(card);
    ask();
  }

  destroy() {
    this.player.destroy();
    this.recorder?.discard();
    this.playerEl.remove();
    this.main.classList.remove('has-player');
    document.removeEventListener('keydown', this.keys);
    this.offMedia?.();
    this.offSettings?.();
  }
}

function nextDayId(course, id) {
  const i = course.days.findIndex((d) => d.id === id);
  return course.days[i + 1]?.id;
}

export { playWord };
