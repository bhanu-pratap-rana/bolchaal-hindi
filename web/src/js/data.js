// Course data: a small index (course.json) plus one file per lesson, loaded on demand.
let coursePromise;
const lessons = new Map();

export function loadCourse() {
  coursePromise ||= fetch('data/course.json', { cache: 'no-cache' }).then((r) => {
    if (!r.ok) throw new Error(`course.json ${r.status}`);
    return r.json();
  });
  return coursePromise;
}

export function loadLesson(id) {
  if (!lessons.has(id)) {
    lessons.set(id, fetch(`data/lessons/${id}.json`).then((r) => {
      if (!r.ok) throw new Error(`${id}.json ${r.status}`);
      return r.json();
    }).catch((e) => { lessons.delete(id); throw e; }));
  }
  return lessons.get(id);
}

/** Text of a line for the chosen learner variant ('m' | 'f') */
export function lineText(line, v) {
  if (v === 'f' && line.f) return { hi: line.f.hi, roman: line.f.roman, en: line.en, fem: true };
  return { hi: line.hi, roman: line.roman, en: line.en, fem: false };
}

/** Every audio URL a lesson needs (both variants + vocabulary), for offline packs */
export function lessonAssets(lesson) {
  const urls = new Set([`data/lessons/${lesson.id}.json`]);
  for (const s of lesson.scenes) for (const v of Object.values(s.variants)) urls.add('media/' + v.audio);
  for (const w of lesson.vocab || []) if (w.audio) urls.add('media/' + w.audio);
  return [...urls];
}
