// Check mode: listening questions generated from the scene's own text and audio. No new audio is synthesised.
// Three kinds: meaning (hear a line, pick its English), gap (one word missing, pick it), spot (hear a line, pick a word it contains).
import { lineText } from './data.js';
import { seeded, shuffle } from './util.js';

const WORD = /[ऀ-ॣ०-ॿ]+/g;
const STOP = new Set('है हैं था थी थे हूँ हो का की के को से में पर और भी तो ही क्या यह वह ये वे मैं आप हम तुम जी ना न नहीं एक कि लिए जा कर'.split(' '));

function contentWords(text) {
  return [...new Set((text.match(WORD) || []).filter((w) => w.length > 1 && !STOP.has(w)))];
}

/** Build up to `n` questions for a scene. Deterministic for (scene, variant, attempt). */
export function buildQuestions(lesson, scene, v, attempt = 0, n = 5) {
  const rnd = seeded(`${scene.id}:${v}:${attempt}`);
  const lines = scene.lines.map((ln, i) => ({ i, ...lineText(ln, v) }));
  const lessonWords = [...new Set(lesson.scenes.flatMap((s) => s.lines.flatMap((l) => contentWords(lineText(l, v).hi))))];
  const vocab = new Map((lesson.vocab || []).map((w) => [w.hi, w]));
  // Roman for any word in the lesson, from lines whose Hindi and Roman have the same number of words.
  const romanMap = new Map();
  for (const s of lesson.scenes) for (const l of s.lines) for (const vv of ['m', 'f']) {
    const t = lineText(l, vv);
    for (const w of contentWords(t.hi)) if (!romanMap.has(w)) { const r = romanForWord(w, t); if (r) romanMap.set(w, r); }
  }
  const romanOf = (word, line) => romanForWord(word, line) || romanMap.get(word) || vocab.get(word)?.roman || '';
  const qs = [];
  const order = shuffle(lines.filter((l) => contentWords(l.hi).length), rnd);
  const kinds = ['meaning', 'gap', 'spot'];
  let k = Math.floor(rnd() * 3);
  for (const line of order) {
    if (qs.length >= n) break;
    const kind = kinds[k++ % 3];
    if (kind === 'meaning') {
      const seen = new Set([line.en]);
      const others = shuffle(lines.filter((l) => l.i !== line.i && !seen.has(l.en) && seen.add(l.en)), rnd).slice(0, 3);
      if (others.length < 2) continue;
      qs.push({ kind, line: line.i, answer: line.en, options: shuffle([line.en, ...others.map((o) => o.en)], rnd) });
    } else {
      const words = contentWords(line.hi);
      const pick = words.sort((a, b) => b.length - a.length)[Math.floor(rnd() * Math.min(2, words.length))];
      const pool = lessonWords.filter((w) => !words.includes(w) && Math.abs(w.length - pick.length) <= 3 && romanOf(w, null));
      const distract = shuffle(pool, rnd).slice(0, kind === 'gap' ? 2 : 3);
      if (distract.length < 2) continue;
      const opts = shuffle([pick, ...distract], rnd).map((w) => ({ hi: w, roman: romanOf(w, null) }));
      const answerRoman = romanOf(pick, line);
      if (!answerRoman) continue;
      for (const o of opts) if (o.hi === pick) o.roman = answerRoman;
      let maskedRoman = null;
      if (kind === 'gap') {
        const re = new RegExp(`(^|[^A-Za-z])${answerRoman.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=[^A-Za-z]|$)`, 'i');
        if (!re.test(line.roman)) continue; // can't hide it in the Roman line; skip rather than reveal the answer
        maskedRoman = line.roman.replace(re, '$1___');
      }
      qs.push({ kind, line: line.i, answer: pick, options: opts, maskedRoman,
        masked: kind === 'gap' ? line.hi.replace(pick, '\u0000') : null });
    }
  }
  return qs;
}

/** Best-effort Roman for one Hindi word in a line: same word position in the Roman line. */
function romanForWord(word, line) {
  if (!line) return '';
  const hiWords = line.hi.split(/\s+/).map((w) => w.replace(/[।,?!.;:"'()]/g, ''));
  const roWords = line.roman.split(/\s+/).map((w) => w.replace(/[,?!.;:"'()]/g, ''));
  if (hiWords.length !== roWords.length) return '';
  const idx = hiWords.indexOf(word);
  return idx >= 0 ? roWords[idx] : '';
}
