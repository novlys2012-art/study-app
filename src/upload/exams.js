// Past exam mode: old exams become lists of questions, each tagged with a topic of the subject.
// call(task, input) runs one server task (see src/upload/pipeline.js); runs in the browser and in the tests.
// Each exam is read in one "exam" call: its text, plus up to EXAM_IMAGES pictures of pages that have no text.
// An exam with more pictures has them transcribed first ("vision", as for course files) and is then read as text.
// Exams are read one after another, so the topic names found in one are offered to the next. Then one "group"
// call sorts the questions of all the subject's exams into one set of topics, so a topic the exams word
// differently counts as one. A question whose topic the student chose (manual) keeps it.
import { questionId, newId } from "../app/subjects.js";
import { retrying, STOP } from "./pipeline.js";

export const EXAM_IMAGES = 6;   // the server's limit of pictures per request
const VISION_BATCH = 4;
const MAX_TEXT = 60_000;        // the server's limit of characters per request

const codeOf = (e) => (e && e.code) || "error";
const chunks = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, k) => a.slice(k * n, k * n + n));

// The year of an exam guessed from its file name ("skuska_2023.pdf", "MAT 2019-01-15", "ZS 2022-2023").
// The latest plausible year wins; none gives null and the student types it in.
export function guessYear(name, now = new Date().getFullYear()) {
  const years = [...String(name).matchAll(/(?<!\d)(?:19|20)\d{2}(?!\d)/g)].map((m) => +m[0]).filter((y) => y >= 1990 && y <= now + 1);
  return years.length ? Math.max(...years) : null;
}

const needsVision = (d) => d.images.length > EXAM_IMAGES;
export const examSteps = (items) => items.reduce((s, it) => s + (needsVision(it.doc) ? Math.ceil(it.doc.images.length / VISION_BATCH) : 0) + 1, 0);

// All exams of a subject sorted into one set of topics. Returns new exams; on a failed call, the same ones.
export async function groupExams({ exams, knownTopics = [], call }) {
  const refs = new Map();
  const input = exams.map((ex, e) => ({
    name: ex.name, year: ex.year || null,
    questions: ex.questions.filter((q) => !q.manual).map((q, k) => {
      const ref = `e${e + 1}#${k + 1}`; refs.set(ref, q.id);
      return { ref, topic: q.topic, text: q.text };
    }),
  })).filter((e) => e.questions.length);
  if (!input.length) return exams;
  let groups;
  try { groups = await call("group", { topics: knownTopics, exams: input }); } catch (e) { if (STOP.has(codeOf(e))) throw e; return exams; }
  const to = new Map();
  groups.forEach((g) => g.questions.forEach((ref) => { const id = refs.get(ref); if (id && !to.has(id)) to.set(id, g.name); }));
  return exams.map((ex) => ({ ...ex, questions: ex.questions.map((q) => (to.has(q.id) ? { ...q, topic: to.get(q.id) } : q)) }));
}

// items: [{ doc (from extractFile or extractPhotos), name, year }]. knownTopics: the subject's topic names.
// earlier: the subject's exams so far, sorted again together with the new ones.
// Returns { exams: earlier and new exams, sorted into topics, added: how many are new, failed: [{ index, name, code, error }] };
// throws when no exam could be read. An exam in which no question was found counts as failed ("no_questions").
export async function readExams({ items, knownTopics = [], earlier = [], call, onStep = () => {}, onFile = () => {}, onRetry = () => {}, retry = {} }) {
  call = retrying(call, { onRetry, ...retry });
  const total = examSteps(items) + 1;
  let done = 0;
  const step = () => onStep(++done, total);
  const known = [...knownTopics];
  earlier.forEach((ex) => ex.questions.forEach((q) => { if (!known.some((t) => t.toLowerCase() === q.topic.toLowerCase())) known.push(q.topic); }));
  const exams = [], failed = [];
  let stopped = null, firstError = null;

  for (const [k, it] of items.entries()) {
    if (stopped) { failed.push({ index: k, name: it.name, code: codeOf(stopped), error: stopped }); onFile(k, "failed"); continue; }
    onFile(k, "ai");
    const until = done + examSteps([it]);
    try {
      const d = it.doc, pages = d.pages.slice();
      let images = d.images;
      if (needsVision(d)) {
        for (const batch of chunks(d.images, VISION_BATCH)) {
          const read = await call("vision", { images: batch });
          for (const p of read) if (p.page >= 1 && p.page <= pages.length && p.text.trim()) pages[p.page - 1] = p.text;
          step();
        }
        images = [];
      }
      const pictured = new Set(images.map((im) => im.page));
      const text = pages.map((p, n) => (pictured.has(n + 1) || !p.trim() ? "" : `[${n + 1}]\n${p.trim()}`)).filter(Boolean).join("\n\n").slice(0, MAX_TEXT);
      const r = await call("exam", { title: it.name, text, knownTopics: known.slice(), images });
      step();
      if (!r.questions.length) throw Object.assign(new Error("No questions found."), { code: "no_questions" });
      r.questions.forEach((q) => { if (!known.some((t) => t.toLowerCase() === q.topic.toLowerCase())) known.push(q.topic); });
      exams.push({
        id: "x" + newId(5), name: it.name, year: it.year || null, at: new Date().toISOString(), pictures: d.images.length,
        unreadable: r.unreadable || "",
        questions: r.questions.map((q) => ({ id: questionId(), n: q.n, text: q.text, topic: q.topic, points: q.points })),
      });
      onFile(k, "done");
    } catch (e) {
      firstError = firstError || e;
      failed.push({ index: k, name: it.name, code: codeOf(e), error: e });
      onFile(k, "failed");
      if (STOP.has(codeOf(e))) stopped = e;
    }
    if (done < until) { done = until; onStep(done, total); }
  }
  if (!exams.length) throw firstError;
  let all = earlier.concat(exams);
  if (!stopped) all = await groupExams({ exams: all, knownTopics, call });
  onStep(total, total);
  return { exams: all, added: exams.length, failed };
}
