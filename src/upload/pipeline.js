// Turns extracted files into a subject: picture pages read, a clean summary per file, checked questions, topics.
// call(task, input) runs one server task and returns its result; onStep(done, total) reports progress.
// Runs in the browser; the tests drive it with a fake call().
// A failed call is tried again; a file that still fails is left out and reported, and the files that
// finished are kept. The server stores every answer by content, so running a failed file again
// only pays for the parts that did not finish.
import { toSections } from "./text.js";
import { questionId } from "../app/subjects.js";

export const NORMOSTRANA = 1800; // characters in a standard page, for "pages after"
const VISION_BATCH = 4;
const PARALLEL = 3;

// Runs fn over items with at most n at a time, keeping the order of the results.
// After a failure no new item starts; the ones running finish (their answers are stored on the server), then it throws.
async function each(items, n, fn) {
  const out = new Array(items.length);
  let next = 0, failed = null;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (next < items.length && !failed) {
      const k = next++;
      try { out[k] = await fn(items[k], k); } catch (e) { failed = failed || e; }
    }
  }));
  if (failed) throw failed;
  return out;
}
// Like Promise.all, but waits for every promise before throwing, so nothing runs on unseen.
async function settled(promises) {
  const r = await Promise.allSettled(promises);
  const bad = r.find((x) => x.status === "rejected");
  if (bad) throw bad.reason;
  return r.map((x) => x.value);
}

// ----- Retries
// Worth another try: the connection, a busy AI, a server error, the per-minute limit, an unreadable reply (once).
// Not worth it: the student's limits, sign-in, a refused or too large part. These codes stop the whole upload.
const RETRY = { network: 4, server_error: 4, server: 4, ai_busy: 4, rate_limit: 5, bad_reply: 2 };
export const STOP = new Set(["auth", "not_allowed", "user_limit", "daily_limit", "no_price", "network"]);
const codeOf = (e) => (e && e.code) || "error";
// Wait in ms before try number n (2, 3, ...): 2, 4, 8 s, or 15, 30, 45 s for the per-minute limit.
export const backoff = (n, code, base = 2000) => (code === "rate_limit" ? base * 7.5 * (n - 1) : base * 2 ** (n - 2));

export function retrying(call, { base = 2000, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), onRetry = () => {} } = {}) {
  return async (task, input) => {
    for (let n = 1; ; n++) {
      try { return await call(task, input); } catch (e) {
        const code = codeOf(e);
        if (n >= (RETRY[code] || 1)) throw e;
        const wait = backoff(n + 1, code, base);
        onRetry(code, wait);
        await sleep(wait);
      }
    }
  };
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

// docs: [{ name, pages, images }] from extractFile(). Returns the subject to save, plus "failed":
// [{ index, name, code, error }] for files that could not be made (the subject holds the others).
// Throws when no file could be made. existing: a subject to add the files to. Its topics are then sorted
// again with the new material; every question keeps its id, so the answers given so far stay with it.
// onFile(index, phase) reports "ai" when a file starts, then "done" or "failed".
// retry: options for retrying() (tests pass { base: 0 }); onRetry(code, waitMs) reports a retry.
export async function buildSubject({ name, docs, call, onStep = () => {}, onFile = () => {}, onRetry = () => {}, otherTopic = "Ostatné", make = DEFAULT_MAKE, existing = null, retry = {} }) {
  make = { ...DEFAULT_MAKE, ...make };
  call = retrying(call, { onRetry, ...retry });
  const total = stepsFor(docs, make);
  let done = 0;
  const step = () => onStep(++done, total);
  const files = [], all = [], failed = [];
  let checkedOut = 0, stopped = null, firstError = null;
  const factor = AMOUNT[make.amount] || 1;

  // One file: picture pages, then per section a summary and checked questions.
  async function makeFile(fi, d) {
    const pages = d.pages.slice();
    await each(chunks(d.images, VISION_BATCH), PARALLEL, async (batch) => {
      const read = await call("vision", { images: batch });
      for (const p of read) if (p.page >= 1 && p.page <= pages.length && p.text.trim()) pages[p.page - 1] = p.text;
      step();
    });

    const sections = toSections(pages);
    const parts = await each(sections, PARALLEL, async (sec) => {
      const label = sections.length > 1 ? `${d.name} (${sec.from}–${sec.to})` : d.name;
      const [sum, quiz] = await settled([
        make.summary ? call("summary", { title: label, text: sec.text }).finally(step) : null,
        make.quiz ? call("quiz", { title: label, text: sec.text, count: Math.max(2, Math.round(questionCount(sec.text) * factor)) }).finally(step) : { questions: [] },
      ]);
      let qs = quiz.questions, out = 0;
      if (qs.length) {
        const checks = await call("check", { text: citedText(sec, pages, qs), questions: qs });
        const bad = new Set(checks.filter((c) => c.verdict !== "ok").map((c) => c.i));
        out = qs.filter((_, i) => bad.has(i)).length;
        qs = qs.filter((_, i) => !bad.has(i));
      }
      if (make.quiz) step();
      return { sum: sum || { title: "", summary: "", keyTerms: [] }, qs, out };
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
    checkedOut += parts.reduce((n, p) => n + p.out, 0);
    const tag = existing ? "n" : "f";
    parts.forEach((p) => p.qs.forEach((x) => {
      all.push({ ...x, ref: `${tag}${fi + 1}#${all.length + 1}`, file: d.name, s: x.s + (x.page ? ` (${d.name}, s. ${x.page})` : ` (${d.name})`) });
    }));
  }

  for (const [fi, d] of docs.entries()) {
    if (stopped) { failed.push({ index: fi, name: d.name, code: codeOf(stopped), error: stopped }); onFile(fi, "failed"); continue; }
    onFile(fi, "ai");
    const until = done + stepsFor([d], { ...make, topics: false });
    try {
      await makeFile(fi, d);
      onFile(fi, "done");
    } catch (e) {
      firstError = firstError || e;
      failed.push({ index: fi, name: d.name, code: codeOf(e), error: e });
      onFile(fi, "failed");
      if (STOP.has(codeOf(e))) stopped = e;
    }
    // A failed file's steps count as done, so the bar keeps moving.
    if (done < until) { done = until; onStep(done, total); }
  }
  if (!files.length) throw firstError;

  // Questions already in the subject take part in the new topic sort under their own refs.
  const prev = (existing?.questions || []).map((x, k) => ({ ...x, ref: "p" + (k + 1) }));
  const allFiles = [...(existing?.files || []), ...files];
  const both = [...prev, ...all];
  let topics = [];
  if (make.topics && !stopped && (both.length || allFiles.some((f) => f.summary))) {
    // Without the topic sort the subject is still usable (below), so a failure here does not lose the files.
    try {
      const r = await call("topics", {
        files: allFiles.map((f) => ({ name: f.name, summary: f.summary.slice(0, 8000) })),
        questions: both.map((x) => ({ id: x.ref, q: x.q })),
      });
      topics = r.topics;
    } catch (e) { topics = []; }
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

  // A question keeps the id it was made with; only new questions get one.
  const used = new Set(prev.map((x) => x.id).filter(Boolean));
  const fresh = () => { let id; do id = questionId(); while (used.has(id)); used.add(id); return id; };
  const questions = both.map(({ q, o, a, e, x, s, ref, id }) => ({ t: of.get(ref) || "t0", q, o, a, e, x, s, id: id || fresh() }));
  if (existing) {
    return {
      ...existing, topics: topicNames, topicInfo, files: allFiles, questions,
      checkedOut: (existing.checkedOut || 0) + checkedOut, updatedAt: new Date().toISOString(), failed,
    };
  }
  return {
    id: "u" + Date.now().toString(36),
    code: name.replace(/[^\p{L}\p{N}]/gu, "").slice(0, 3).toUpperCase() || "NEW",
    name, term: "", createdAt: new Date().toISOString(),
    topics: topicNames, topicInfo, files, questions, checkedOut, failed,
  };
}
