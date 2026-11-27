// Audio engine: one <audio> element plays one stitched scene file; the current line comes from cue times.
// Highlighting reads audio.currentTime on every animation frame, never a timer, so it stays in sync at any speed.

export class ScenePlayer extends EventTarget {
  constructor() {
    super();
    this.audio = new Audio();
    this.audio.preload = 'auto';
    this.cues = [];
    this.index = -1;
    this.stopAt = null;      // seconds: pause here (single-line replay, Speak mode turns)
    this.raf = 0;
    this.token = 0;          // guards against a stale play() promise after a source change
    this.ready = false;
    const a = this.audio;
    a.addEventListener('canplay', () => { if (!this.ready) { this.ready = true; this.emit('ready'); } });
    a.addEventListener('playing', () => { this.emit('state'); this.loop(); });
    a.addEventListener('pause', () => { cancelAnimationFrame(this.raf); this.tick(); this.emit('state'); });
    a.addEventListener('ended', () => { cancelAnimationFrame(this.raf); this.tick(); this.emit('ended'); this.emit('state'); });
    a.addEventListener('error', () => { if (a.getAttribute('src')) this.emit('error'); });
    a.addEventListener('ratechange', () => this.emit('state'));
    // rAF stops in hidden tabs and on a locked screen; timeupdate keeps line stops working there.
    a.addEventListener('timeupdate', () => { if (document.hidden || !this.playing) this.tick(); });
    a.addEventListener('seeked', () => this.tick());
  }

  emit(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail })); }

  load(src, cues, { at = 0 } = {}) {
    this.token++;
    this.ready = false;
    this.cues = cues;
    this.index = -1;
    this.stopAt = null;
    const rate = this.audio.playbackRate;
    this.audio.defaultPlaybackRate = rate; // load() resets playbackRate to defaultPlaybackRate
    this.audio.src = src;
    this.audio.preservesPitch = true;
    if (at > 0) {
      const seekWhenReady = () => { this.audio.currentTime = at; this.tick(); };
      this.audio.addEventListener('loadedmetadata', seekWhenReady, { once: true });
    }
    this.audio.load();
    this.audio.playbackRate = rate;
    this.tick();
  }

  get playing() { return !this.audio.paused && !this.audio.ended; }
  get duration() { return this.audio.duration || (this.cues.at(-1)?.[1] ?? 0); }
  get time() { return this.audio.currentTime || 0; }

  play() {
    const tok = this.token;
    const p = this.audio.play();
    if (p) p.catch((err) => { if (tok === this.token && err.name !== 'AbortError') this.emit('blocked', err); });
    return p;
  }
  pause() { this.audio.pause(); }
  toggle() { if (this.playing) this.pause(); else this.play(); }

  seek(t) {
    this.stopAt = null;
    this.audio.currentTime = Math.max(0, Math.min(t, this.duration - 0.05));
    this.tick();
  }

  /** Play exactly one line, then stop */
  playLine(i) {
    if (!this.cues[i]) return;
    this.audio.currentTime = this.cues[i][0] + 0.001;
    this.stopAt = this.cues[i][1];
    this.tick();
    this.play();
  }

  /** Play from line i onward; optional stop before line `until` */
  playFrom(i, until = null) {
    if (!this.cues[i]) return;
    this.audio.currentTime = this.cues[i][0] + 0.001;
    this.stopAt = until != null && this.cues[until] ? this.cues[until][0] - 0.02 : null;
    this.tick();
    this.play();
  }

  step(delta) {
    const i = Math.max(0, Math.min(this.cues.length - 1, (this.index < 0 ? 0 : this.index) + delta));
    const wasPlaying = this.playing;
    this.stopAt = null;
    this.audio.currentTime = this.cues[i][0] + 0.001;
    this.tick();
    if (wasPlaying) this.play();
  }

  setRate(r) { this.audio.defaultPlaybackRate = r; this.audio.playbackRate = r; this.audio.preservesPitch = true; }

  lineAt(t) {
    const c = this.cues;
    for (let i = 0; i < c.length; i++) {
      if (t < c[i][1] || i === c.length - 1) return t >= c[i][0] - 0.05 || i === 0 ? i : i - 1;
      if (c[i + 1] && t < c[i + 1][0]) return i; // in the pause after line i
    }
    return -1;
  }

  tick() {
    const t = this.time;
    if (this.stopAt != null && t >= this.stopAt) {
      this.stopAt = null;
      this.audio.pause();
      this.emit('stopped');
    }
    const i = this.lineAt(t);
    const c = this.cues[i];
    const p = c ? Math.max(0, Math.min(1, (t - c[0]) / (c[1] - c[0] || 1))) : 0;
    if (i !== this.index) { this.index = i; this.emit('line', i); }
    this.emit('progress', { t, i, p });
  }

  loop() {
    cancelAnimationFrame(this.raf);
    const step = () => {
      if (!this.playing) return;
      this.tick();
      if (this.playing) this.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
  }

  destroy() {
    this.token++;
    cancelAnimationFrame(this.raf);
    this.audio.pause();
    this.audio.removeAttribute('src');
    this.audio.load();
  }
}

/** Lock-screen / notification controls where the browser supports them */
export function mediaSession(player, meta, { prev, next }) {
  if (!('mediaSession' in navigator)) return () => {};
  const ms = navigator.mediaSession;
  try {
    ms.metadata = new MediaMetadata({ title: meta.title, artist: meta.artist, album: meta.album,
      artwork: [{ src: 'icon-512.png', sizes: '512x512', type: 'image/png' }] });
    ms.setActionHandler('play', () => player.play());
    ms.setActionHandler('pause', () => player.pause());
    ms.setActionHandler('previoustrack', prev);
    ms.setActionHandler('nexttrack', next);
    ms.setActionHandler('seekto', (d) => player.seek(d.seekTime));
  } catch { /* some actions unsupported */ }
  return () => { for (const a of ['play', 'pause', 'previoustrack', 'nexttrack', 'seekto']) try { ms.setActionHandler(a, null); } catch {} };
}
