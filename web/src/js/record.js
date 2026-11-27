// Record and compare. The recording lives in memory on this device and is never uploaded.
export const recordSupported = !!(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);

export class Recorder {
  constructor() { this.url = null; this.rec = null; this.stream = null; this.active = false; this.gen = 0; }

  async start() {
    this.discard();
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    const type = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', ''].find((t) => !t || MediaRecorder.isTypeSupported(t));
    this.rec = new MediaRecorder(this.stream, type ? { mimeType: type } : undefined);
    const chunks = [];
    const gen = ++this.gen;
    this.rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    this.done = new Promise((resolve) => {
      const rec = this.rec, stream = this.stream;
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        if (gen !== this.gen) { resolve(null); return; } // discarded while recording
        this.url = URL.createObjectURL(new Blob(chunks, { type: rec.mimeType || 'audio/webm' }));
        this.active = false;
        resolve(this.url);
      };
    });
    this.rec.start();
    this.active = true;
    this.timer = setTimeout(() => this.stop(), 15000); // keep takes short
  }

  stop() {
    clearTimeout(this.timer);
    if (this.rec?.state === 'recording') this.rec.stop();
    return this.done || Promise.resolve(null);
  }

  play() {
    if (!this.url) return Promise.resolve();
    const a = new Audio(this.url);
    return new Promise((resolve) => { a.onended = resolve; a.onerror = resolve; a.play().catch(resolve); });
  }

  discard() {
    this.gen++;
    clearTimeout(this.timer);
    if (this.rec?.state === 'recording') { try { this.rec.stop(); } catch { /* already stopped */ } }
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = null;
    this.active = false;
    this.stream?.getTracks().forEach((t) => t.stop());
  }
}

export function micErrorMessage(err) {
  if (err?.name === 'NotAllowedError') return 'Microphone access is blocked. Allow it in your browser settings to record yourself.';
  if (err?.name === 'NotFoundError') return 'No microphone was found on this device.';
  return 'Recording isn\'t available in this browser. You can still practise aloud.';
}
