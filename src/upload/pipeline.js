// Turns extracted files into a subject: picture pages read, a clean summary per file, checked questions, topics.
// call(task, input) runs one server task and returns its result; onStep(done, total) reports progress.
// Runs in the browser; the tests drive it with a fake call().
import { toSections } from "./text.js";
import { hid } from "../app/subjects.js";

export const NORMOSTRANA = 1800; // characters in a standard page, for "pages after"
const VISION_BATCH = 4;
const PARALLEL = 3;

// Runs fn over items with at most n at a time, keeping the order of the results.
async function each(items, n, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (next < items.length) { const k = next++; out[k] = await fn(items[k], k); }
  }));
  return out;
}
const chunks = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, k) => a.slice(k * n, k * n + n));
const questionCount = (text) => Math.max(3, Math.min(12, Math.round(text.length / 3000)));

// The pages a section's questions quote, so the check reads a few pages instead of the whole section.
function citedText(sec, pages, qs) {
  const nums = [...new Set(qs.map((x) => x.page))];
  if (nums.some((n) => !Number.isInteger(n) || n < sec.from || n > sec.to)) return sec.text;
  return nums.sort((a, b) => a - b).map((n) => `[${n}]\n${pages[n - 1]}`).join("\n\n");
}

export function stepsFor(docs) {
  return docs.reduce((s, d) => s + Math.ceil(d.images.length / VISION_BATCH) + toSections(d.pages).length * 3, 0) + 1;
}

// docs: [{ name, pages, images }] from extractFile(). Returns the subject to save.
export async function buildSubject({ name, docs, call, onStep = () => {}, otherTopic = "Ostatné" }) {
  const total = stepsFor(docs);
  let done = 0;
  const step = () => onStep(++done, total);
  const files = [], all = [];
  let checkedOut = 0;

  for (const [fi, d] of docs.entries()) {
    const pages = d.pages.slice();
    await each(chunks(d.images, VISION_BATCH), PARALLEL, async (batch) => {
      const read = await call("vision", { images: batch });
      for (const p of read) if (p.page >= 1 && p.page <= pages.length && p.text.trim()) pages[p.page - 1] = p.text;
      step();
    });

    const sections = toSections(pages);
    const parts = await each(sections, PARALLEL, async (sec) => {
      const label = sections.length > 1 ? `${d.name} (${sec.from}–${sec.to})` : d.name;
      const [sum, quiz] = await Promise.all([
        call("summary", { title: label, text: sec.text }).finally(step),
        call("quiz", { title: label, text: sec.text, count: questionCount(sec.text) }).finally(step),
      ]);
      let qs = quiz.questions;
      if (qs.length) {
        const checks = await call("check", { text: citedText(sec, pages, qs), questions: qs });
        const bad = new Set(checks.filter((c) => c.verdict !== "ok").map((c) => c.i));
        checkedOut += qs.filter((_, i) => bad.has(i)).length;
        qs = qs.filter((_, i) => !bad.has(i));
      }
      step();
      return { sum, qs };
    });

    const summary = parts.map((p) => p.sum.summary.trim()).filter(Boolean).join("\n\n");
    files.push({
      name: d.name,
      title: parts[0]?.sum.title || d.name,
      pagesBefore: d.pages.length,
      pagesAfter: Math.max(0.1, +(summary.length / NORMOSTRANA).toFixed(1)),
      picturePages: d.images.length,
      skippedPictures: d.skipped || 0,
      summary,
      keyTerms: parts.flatMap((p) => p.sum.keyTerms),
    });
    parts.forEach((p) => p.qs.forEach((x) => {
      all.push({ ...x, ref: `f${fi + 1}#${all.length + 1}`, file: d.name, s: x.s + (x.page ? ` (${d.name}, s. ${x.page})` : ` (${d.name})`) });
    }));
  }

  let topics = [];
  if (all.length) {
    const r = await call("topics", {
      files: files.map((f) => ({ name: f.name, summary: f.summary.slice(0, 8000) })),
      questions: all.map((x) => ({ id: x.ref, q: x.q })),
    });
    topics = r.topics;
  }
  step();
  // Without topics from the model, each file is its own topic.
  if (!topics.length) topics = files.map((f) => ({ name: f.title || f.name, files: [f.name], summary: "", questions: all.filter((x) => x.file === f.name).map((x) => x.ref), weakSpots: [] }));

  const topicNames = {}, topicInfo = {}, of = new Map();
  topics.forEach((tp, k) => {
    const key = "t" + (k + 1);
    topicNames[key] = tp.name;
    topicInfo[key] = { summary: tp.summary, weakSpots: tp.weakSpots, files: tp.files };
    tp.questions.forEach((ref) => { if (!of.has(ref)) of.set(ref, key); });
  });
  if (all.some((x) => !of.has(x.ref))) { topicNames.t0 = otherTopic; topicInfo.t0 = { summary: "", weakSpots: [], files: [] }; }

  const questions = all.map(({ q, o, a, e, x, s, ref }) => {
    const t = of.get(ref) || "t0";
    return { t, q, o, a, e, x, s, id: hid(t + "|" + q) };
  });
  return {
    id: "u" + Date.now().toString(36),
    code: name.replace(/[^\p{L}\p{N}]/gu, "").slice(0, 3).toUpperCase() || "NEW",
    name, term: "", createdAt: new Date().toISOString(),
    topics: topicNames, topicInfo, files, questions, checkedOut,
  };
}
