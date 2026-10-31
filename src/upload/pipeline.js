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

// What the student chose to make. Questions are checked whenever they are made.
export const DEFAULT_MAKE = { summary: true, quiz: true, topics: true, amount: 1 };
const AMOUNT = { 0.5: 0.5, 1: 1, 1.5: 1.5 };

export function stepsFor(docs, make = DEFAULT_MAKE) {
  const perSection = (make.summary ? 1 : 0) + (make.quiz ? 2 : 0);
  return docs.reduce((s, d) => s + Math.ceil(d.images.length / VISION_BATCH) + toSections(d.pages).length * perSection, 0) + (make.topics ? 1 : 0);
}

// docs: [{ name, pages, images }] from extractFile(). Returns the subject to save.
// existing: a subject to add the files to. Its topics are then sorted again with the new material,
// and the result's "renamed" maps old question ids to new ones so the progress can move with them.
// onFile(index, phase) reports "ai" when a file starts and "done" when it is finished.
export async function buildSubject({ name, docs, call, onStep = () => {}, onFile = () => {}, otherTopic = "Ostatné", make = DEFAULT_MAKE, existing = null }) {
  make = { ...DEFAULT_MAKE, ...make };
  const total = stepsFor(docs, make);
  let done = 0;
  const step = () => onStep(++done, total);
  const files = [], all = [];
  let checkedOut = 0;
  const factor = AMOUNT[make.amount] || 1;

  for (const [fi, d] of docs.entries()) {
    onFile(fi, "ai");
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
        make.summary ? call("summary", { title: label, text: sec.text }).finally(step) : null,
        make.quiz ? call("quiz", { title: label, text: sec.text, count: Math.max(2, Math.round(questionCount(sec.text) * factor)) }).finally(step) : { questions: [] },
      ]);
      let qs = quiz.questions;
      if (qs.length) {
        const checks = await call("check", { text: citedText(sec, pages, qs), questions: qs });
        const bad = new Set(checks.filter((c) => c.verdict !== "ok").map((c) => c.i));
        checkedOut += qs.filter((_, i) => bad.has(i)).length;
        qs = qs.filter((_, i) => !bad.has(i));
      }
      if (make.quiz) step();
      return { sum: sum || { title: "", summary: "", keyTerms: [] }, qs };
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
    const tag = existing ? "n" : "f";
    parts.forEach((p) => p.qs.forEach((x) => {
      all.push({ ...x, ref: `${tag}${fi + 1}#${all.length + 1}`, file: d.name, s: x.s + (x.page ? ` (${d.name}, s. ${x.page})` : ` (${d.name})`) });
    }));
    onFile(fi, "done");
  }

  // Questions already in the subject take part in the new topic sort under their own refs.
  const prev = (existing?.questions || []).map((x, k) => ({ ...x, ref: "p" + (k + 1) }));
  const allFiles = [...(existing?.files || []), ...files];
  const both = [...prev, ...all];
  let topics = [];
  if (make.topics && (both.length || allFiles.some((f) => f.summary))) {
    const r = await call("topics", {
      files: allFiles.map((f) => ({ name: f.name, summary: f.summary.slice(0, 8000) })),
      questions: both.map((x) => ({ id: x.ref, q: x.q })),
    });
    topics = r.topics;
  }
  if (make.topics) step();
  if (!topics.length) {
    // Without topics from the model, old questions keep their topics and each new file is its own topic.
    const kept = existing ? Object.keys(existing.topics).map((k) => ({
      name: existing.topics[k], ...(existing.topicInfo?.[k] || { summary: "", weakSpots: [], files: [] }),
      questions: prev.filter((x) => x.t === k).map((x) => x.ref),
    })) : [];
    topics = kept.concat(files.map((f) => ({ name: f.title || f.name, files: [f.name], summary: "", questions: all.filter((x) => x.file === f.name).map((x) => x.ref), weakSpots: [] })));
  }

  const topicNames = {}, topicInfo = {}, of = new Map();
  topics.forEach((tp, k) => {
    const key = "t" + (k + 1);
    topicNames[key] = tp.name;
    topicInfo[key] = { summary: tp.summary || "", weakSpots: tp.weakSpots || [], files: tp.files || [] };
    tp.questions.forEach((ref) => { if (!of.has(ref)) of.set(ref, key); });
  });
  if (both.some((x) => !of.has(x.ref))) { topicNames.t0 = otherTopic; topicInfo.t0 = { summary: "", weakSpots: [], files: [] }; }

  const renamed = {};
  const questions = both.map(({ q, o, a, e, x, s, ref, id: old }) => {
    const t = of.get(ref) || "t0";
    const id = hid(t + "|" + q);
    if (old && old !== id) renamed[old] = id;
    return { t, q, o, a, e, x, s, id };
  });
  if (existing) {
    return {
      ...existing, topics: topicNames, topicInfo, files: allFiles, questions,
      checkedOut: (existing.checkedOut || 0) + checkedOut, updatedAt: new Date().toISOString(), renamed,
    };
  }
  return {
    id: "u" + Date.now().toString(36),
    code: name.replace(/[^\p{L}\p{N}]/gu, "").slice(0, 3).toUpperCase() || "NEW",
    name, term: "", createdAt: new Date().toISOString(),
    topics: topicNames, topicInfo, files, questions, checkedOut,
  };
}
