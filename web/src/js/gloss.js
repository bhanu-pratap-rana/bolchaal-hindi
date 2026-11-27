// Word popover: meaning, Roman, AI-voiced audio, and "still learning / I know it".
import { setWord, words } from './state.js';
import { toast } from './util.js';

let current = null;
let audio;

export function openGloss(w) {
  const dlg = document.getElementById('gloss');
  current = w;
  dlg.querySelector('#gloss-word').textContent = w.hi;
  dlg.querySelector('#gloss-roman').textContent = w.roman;
  dlg.querySelector('#gloss-en').textContent = w.en;
  dlg.querySelector('#gloss-play').hidden = !w.audio;
  paint(dlg);
  if (!dlg.open) dlg.showModal();
}

function paint(dlg) {
  for (const b of dlg.querySelectorAll('[data-know]')) b.setAttribute('aria-pressed', String(words[current.hi] === b.dataset.know));
}

export function initGloss() {
  const dlg = document.getElementById('gloss');
  dlg.querySelector('#gloss-play').addEventListener('click', () => {
    if (!current?.audio) return;
    audio ||= new Audio();
    audio.src = 'media/' + current.audio;
    audio.play().catch(() => toast('Couldn\'t play this word. Check your connection.'));
  });
  for (const b of dlg.querySelectorAll('[data-know]')) {
    b.addEventListener('click', () => {
      setWord(current.hi, b.dataset.know);
      paint(dlg);
      for (const chip of document.querySelectorAll('.chip')) {
        if (chip.textContent.startsWith(current.hi)) chip.dataset.know = words[current.hi] || '';
      }
    });
  }
  // light dismiss where closedby isn't supported
  if (!('closedBy' in HTMLDialogElement.prototype)) {
    for (const d of document.querySelectorAll('dialog[closedby="any"]')) {
      d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
    }
  }
}
