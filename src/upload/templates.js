// Worked-example templates: extract reusable templates from uploaded workbooks or handwritten workings,
// and generate up to MAX_PROBLEMS_PER_TEMPLATE (2) fresh similar problems per template on demand.
import { questionId, newId } from "../app/subjects.js";
import { retrying, STOP } from "./pipeline.js";

export const TEMPLATE_IMAGES = 6;            // matches the server's limit of pictures per request
export const MAX_PROBLEMS_PER_TEMPLATE = 2;  // hard cap to keep generation fast and affordable
const VISION_BATCH = 4;
const MAX_TEXT = 60_000;
const MAX_TEMPLATE_CONTEXT = 6_000;
const MAX_AVOID = 800;

const codeOf = (e) => (e && e.code) || "error";
const chunks = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, k) => a.slice(k * n, k * n + n));
const needsVision = (d) => d.images.length > TEMPLATE_IMAGES;

export const templateSteps = (items) => items.reduce((s, it) => s + (needsVision(it.doc) ? Math.ceil(it.doc.images.length / VISION_BATCH) : 0) + 1, 0);

// items: [{ doc (from extractFile or extractPhotos), name }].
// Returns { templates: earlier and newly extracted templates, added: file count succeeded, addedTemplates: template count, failed }.
export async function readTemplates({ items, knownTopics = [], earlier = [], context = "", call, onStep = () => {}, onFile = () => {}, onRetry = () => {}, retry = {} }) {
  call = retrying(call, { onRetry, ...retry });
  const total = Math.max(1, templateSteps(items));
  let done = 0;
  const step = () => onStep(++done, total);
  const known = [...knownTopics];
  earlier.forEach((tpl) => {
    if (tpl.topic && !known.some((k) => k.toLowerCase() === tpl.topic.toLowerCase())) known.push(tpl.topic);
  });
  const created = [], failed = [];
  let added = 0, stopped = null, firstError = null;

  for (const [k, it] of items.entries()) {
    if (stopped) { failed.push({ index: k, name: it.name, code: codeOf(stopped), error: stopped }); onFile(k, "failed"); continue; }
    onFile(k, "ai");
    const until = done + templateSteps([it]);
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
      const r = await call("template", { title: it.name, text, knownTopics: known.slice(), images, ...(context ? { context } : {}) });
      step();
      if (!r.templates.length) throw Object.assign(new Error("No templates found."), { code: "no_templates" });
      const at = new Date().toISOString();
      r.templates.forEach((tpl) => {
        if (tpl.topic && !known.some((t) => t.toLowerCase() === tpl.topic.toLowerCase())) known.push(tpl.topic);
        created.push({
          id: "tp" + newId(4),
          title: tpl.title,
          topic: tpl.topic || "",
          source: it.name,
          prompt: tpl.prompt,
          method: tpl.method || [],
          varies: tpl.varies || "",
          example: tpl.example || "",
          unreadable: r.unreadable || "",
          at,
          problems: [],
        });
      });
      added++;
      onFile(k, "done");
    } catch (e) {
      firstError = firstError || e;
      failed.push({ index: k, name: it.name, code: codeOf(e), error: e });
      onFile(k, "failed");
      if (STOP.has(codeOf(e))) stopped = e;
    }
    if (done < until) { done = until; onStep(done, total); }
  }
  if (!added) throw firstError;
  onStep(total, total);
  return { templates: earlier.concat(created), added, addedTemplates: created.length, failed };
}

// Generates the next fresh similar problem (variant 1 or 2) for one extracted template.
export async function generateSimilarProblem({ tpl, context = "", call, retry = {} }) {
  const existing = Array.isArray(tpl?.problems) ? tpl.problems : [];
  if (existing.length >= MAX_PROBLEMS_PER_TEMPLATE) {
    throw Object.assign(new Error("Maximum variants reached."), { code: "max_variants" });
  }
  const variant = existing.length + 1;
  const avoid = variant === 2 ? String(existing[0]?.q || "").slice(0, MAX_AVOID) : "";
  const run = retrying(call, retry);
  const res = await run("template_problem", {
    template: {
      title: tpl.title,
      topic: tpl.topic || "",
      prompt: tpl.prompt,
      method: tpl.method || [],
      varies: tpl.varies || "",
      example: tpl.example || "",
    },
    variant,
    ...(avoid ? { avoid } : {}),
    ...(context ? { context: context.slice(0, MAX_TEMPLATE_CONTEXT) } : {}),
  });
  return {
    id: questionId(),
    variant,
    q: res.q,
    hints: res.hints || [],
    steps: res.steps || [],
    ans: res.ans,
    check: res.check ?? null,
    e: res.e || "",
    at: new Date().toISOString(),
  };
}
