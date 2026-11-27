// "Report a problem" sheet: pick what's wrong, add a note, then share, copy, or (for reviewers) open a GitHub issue.
// No backend: nothing is sent unless the learner chooses to share it.
import { h, toast } from './util.js';
import { reviewOn } from './review.js';

let dlg;

export function openReport({ scene, i, t, v, githubUrl }) {
  dlg?.remove();
  const reasons = ['The Hindi or Roman looks wrong', 'The English doesn\'t match', 'The voice says it wrong', 'Something else'];
  const note = h('textarea', { id: 'rep-note', rows: '3', placeholder: 'What did you notice?' });
  const summary = () => {
    const reason = dlg.querySelector('input[name="reason"]:checked')?.value || reasons[3];
    return `Bolchaal Hindi: problem in ${scene.id} line ${i + 1} (${v === 'f' ? 'woman' : 'man'} learner)\n${reason}\nHindi: ${t.hi}\nRoman: ${t.roman}\nEnglish: ${t.en}\nNote: ${note.value.trim() || '-'}`;
  };
  const share = navigator.share ? h('button.btn.primary', { type: 'button', onclick: async () => {
    try { await navigator.share({ title: 'Bolchaal Hindi problem report', text: summary() }); dlg.close(); } catch { /* cancelled */ }
  } }, 'Share the report') : null;
  const copy = h('button.btn' + (share ? '' : '.primary'), { type: 'button', onclick: async () => {
    try { await navigator.clipboard.writeText(summary()); toast('Report copied. Paste it into a message to your teacher.'); dlg.close(); }
    catch { toast('Couldn\'t copy. Select the text in the note and copy it yourself.'); }
  } }, 'Copy the report');
  const gh = h('a.btn', { href: '#', target: '_blank', rel: 'noopener', onclick: (e) => {
    const body = encodeURIComponent(summary());
    e.currentTarget.href = `${githubUrl.split('?')[0]}?title=${encodeURIComponent(`Problem in ${scene.id} line ${i + 1}`)}&body=${body}`;
  } }, 'Open a GitHub issue');
  dlg = h('dialog.sheet', { 'aria-labelledby': 'rep-title', closedby: 'any' },
    h('form.sheet-body', { method: 'dialog' },
      h('div.sheet-head', {}, h('h2#rep-title', {}, `Report a problem with line ${i + 1}`),
        h('button.icon-btn', { value: 'close', 'aria-label': 'Close' }, '✕')),
      h('p.rep-line', {}, h('span', { lang: 'hi' }, t.hi), h('br'), h('span.hint', {}, t.roman)),
      h('fieldset', {}, h('legend', {}, 'What\'s wrong?'),
        reasons.map((r, k) => h('label.switch', {}, h('input', { type: 'radio', name: 'reason', value: r, checked: k === 0 }), h('span', {}, r)))),
      h('label', { for: 'rep-note' }, h('b', {}, 'Note (optional)')), note,
      h('div.day-actions', {}, share, copy, reviewOn() ? gh : null),
      h('p.hint', {}, 'Nothing is sent automatically. Share or copy the report to your teacher or the course team.')));
  document.body.append(dlg);
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  dlg.showModal();
}
