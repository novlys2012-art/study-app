// Server side of the upload pipeline: checks the caller and the spending caps, runs one AI task, records its cost.
// The Supabase Edge Function (supabase/functions/generate) wires it to Deno, Supabase and Claude;
// the tests wire it to fakes. Nothing here touches the network itself.
import * as T from "../ai/tasks.js";

// Defaults when the secrets are not set. USD, because that is what Anthropic bills.
// perMinute: AI tasks one account may run in a minute (answers from the cache count too).
export const DEFAULT_LIMITS = { userMonthUsd: 1, dailyUsd: 5, perMinute: 60 };

// Part of every cache key. Raise it when a change outside the prompts (a parser, a model setting
// the key does not cover) should stop old cached answers from being reused.
export const CACHE_VERSION = 1;

const MAX_TEXT = 60_000;          // characters per request, about 15k tokens
const MAX_IMAGES = 6;             // pages per vision request
const MAX_IMAGE_CHARS = 1_500_000; // base64 per page, about 1.1 MB
const MAX_QUESTIONS = 40;
const MAX_PROBLEMS = 20;
const MAX_CONTEXT = 30_000;
const MAX_TEMPLATE_CONTEXT = 6_000;
const MAX_AVOID = 800;

export class HttpError extends Error {
  constructor(status, code, message) { super(message || code); this.status = status; this.code = code; }
}

export function limitsFrom(env = {}) {
  const num = (v, d) => (v != null && v !== "" && Number.isFinite(+v) ? +v : d);
  const allowed = String(env.ALLOWED_EMAILS || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  return {
    userMonthUsd: num(env.USER_MONTHLY_LIMIT_USD, DEFAULT_LIMITS.userMonthUsd),
    dailyUsd: num(env.DAILY_LIMIT_USD, DEFAULT_LIMITS.dailyUsd),
    perMinute: num(env.USER_RATE_PER_MINUTE, DEFAULT_LIMITS.perMinute),
    allowed: allowed.length ? allowed : null,
  };
}

const text = (v, max = MAX_TEXT) => {
  if (typeof v !== "string" || !v.trim()) throw new HttpError(400, "bad_input", "Missing text.");
  if (v.length > max) throw new HttpError(413, "too_large", `Text over ${max} characters.`);
  return v;
};
const ctxText = (v) => {
  if (v == null || v === "") return "";
  if (typeof v !== "string") throw new HttpError(400, "bad_input", "Bad context.");
  if (v.length > MAX_CONTEXT) throw new HttpError(413, "too_large", `Context over ${MAX_CONTEXT} characters.`);
  return v.trim();
};
const title = (v) => String(v || "").slice(0, 200);

// Page pictures: [{ page, mediaType, data (base64) }], at most MAX_IMAGES.
function pictures(images) {
  if (!Array.isArray(images)) throw new HttpError(400, "bad_input", "Bad images.");
  if (images.length > MAX_IMAGES) throw new HttpError(413, "too_large", `At most ${MAX_IMAGES} pages per request.`);
  for (const im of images) {
    if (!im || !Number.isInteger(im.page) || !/^image\/(png|jpeg|webp)$/.test(im.mediaType) || typeof im.data !== "string") throw new HttpError(400, "bad_input", "Bad image.");
    if (im.data.length > MAX_IMAGE_CHARS) throw new HttpError(413, "too_large", "Image too large.");
  }
  return images;
}
const names = (v) => (Array.isArray(v) ? [...new Set(v.filter((s) => typeof s === "string").map((s) => s.trim().slice(0, 80)).filter(Boolean))].slice(0, 80) : []);

// shortcut: regex heuristic for escalating check to Sonnet on math/formulas/vision; upgrade when paid tiers exist.
const MATH_SYM = /[∑∏∫∂√∞±≠≤≥≈≡∝∈∉⊂⊃∪∩∀∃⇒⇔÷×²³⁴⁵⁶⁷⁸⁹⁰⁻¹]|\\(?:frac|sqrt|sum|int|lim|prod|cdot|times|pm|leq|geq|neq|approx|alpha|beta|gamma|delta|sigma|mu|lambda|pi|theta)\b/;
const MATH_EQ = /(?:^|[\s([,;])[A-Za-zΑ-Ωα-ω0-9)\]_'′]+\s*=\s*[-+±]?[A-Za-zΑ-Ωα-ω0-9(\[]/;
const MATH_OP = /\^|\s[<>]=?\s|[A-Za-z0-9)\]]\s*(?:(?<!\*)\*(?!\*)|\+)\s*[-+]?[A-Za-z0-9(\[]|\d\s+[-\/]\s+\d|\b(?:lim|sin|cos|tan|tg|cotg|arcsin|arccos|log|ln|exp|det|Var|Cov|SD|SE)\s*[([_]/;
const CALC_VERB = /\b(?:vypočít|spočítej|vyrieš|vyřeš|derivuj|integruj|zintegruj|zderivuj|umocni|odmocni)/i;
const NUM_OPT = /^\s*[-+±]?\d+(?:[.,]\d+)?(?:\s*(?:%|‰|°|[A-Za-zµμ\/²³^-]{1,6}))?\s*$/;
const YEAR_OPT = /^\s*(?:1\d{3}|20\d{2})\s*$/;

// Escalate question verification to Sonnet for picture/slide sources or math/formulas; plain prose uses Haiku.
export function needsStrongCheck({ text: src = "", questions = [], fromVision = false } = {}) {
  if (fromVision) return true;
  for (const x of questions) {
    const opts = Array.isArray(x?.o) ? x.o : [];
    const joined = `${x?.q || ""}\n${opts.join("\n")}`;
    if (MATH_SYM.test(joined) || MATH_EQ.test(joined) || MATH_OP.test(joined) || CALC_VERB.test(joined)) return true;
    if (opts.filter((o) => typeof o === "string" && NUM_OPT.test(o) && !YEAR_OPT.test(o)).length >= 2) return true;
  }
  return MATH_SYM.test(src) || MATH_EQ.test(src);
}

const TASKS = {
  vision: {
    tier: "strong", effort: "low", maxTokens: 16000, parse: T.parseVision,
    build({ images }) {
      if (!Array.isArray(images) || !images.length) throw new HttpError(400, "bad_input", "No images.");
      pictures(images);
      return {
        system: T.visionSystem(),
        prompt: T.visionPrompt({ pages: images.map((im) => im.page) }),
        images: images.map((im) => ({ mediaType: im.mediaType, data: im.data })),
      };
    },
  },
  // Past exam mode: one old exam (its text, or pictures of its pages, or both) becomes a list of questions,
  // each tagged with a topic, reusing the subject's topic names where they fit.
  exam: {
    tier: "strong", effort: "medium", maxTokens: 16000, parse: T.parsePastExam,
    build(input, lang) {
      const images = pictures(input.images ?? []);
      const body = typeof input.text === "string" ? input.text : "";
      if (body.length > MAX_TEXT) throw new HttpError(413, "too_large", `Text over ${MAX_TEXT} characters.`);
      if (!body.trim() && !images.length) throw new HttpError(400, "bad_input", "No exam text or pages.");
      return {
        system: T.pastExamSystem(lang),
        prompt: T.pastExamPrompt({ title: title(input.title), text: body, knownTopics: names(input.knownTopics), pages: images.length && body.trim() ? images.map((im) => im.page) : [], context: ctxText(input.context) }),
        images: images.map((im) => ({ mediaType: im.mediaType, data: im.data })),
      };
    },
  },
  summary: {
    tier: "fast", maxTokens: 8000, parse: T.parseDebloat,
    build: (input, lang) => ({ system: T.debloatSystem(lang), prompt: T.debloatPrompt({ title: title(input.title), text: text(input.text), context: ctxText(input.context) }) }),
  },
  quiz: {
    tier: "fast", maxTokens: 10000, parse: T.parseQuiz,
    build: (input, lang) => ({
      system: T.quizSystem(lang),
      prompt: T.quizPrompt({ title: title(input.title), text: text(input.text), count: Math.min(15, Math.max(1, input.count | 0 || 10)), context: ctxText(input.context) }),
    }),
  },
  problems: {
    tier: "fast", maxTokens: 12000, parse: T.parseProblems,
    build: (input, lang) => ({
      system: T.problemSystem(lang),
      prompt: T.problemPrompt({ title: title(input.title), text: text(input.text), count: Math.min(10, Math.max(1, input.count | 0 || 5)), context: ctxText(input.context) }),
    }),
  },
  check: {
    tier: "fast", maxTokens: 4000, parse: T.parseChecks,
    build(input, lang) {
      const qs = input.questions;
      if (!Array.isArray(qs) || !qs.length || qs.length > MAX_QUESTIONS) throw new HttpError(400, "bad_input", "Bad questions.");
      const src = text(input.text);
      const strong = needsStrongCheck({ text: src, questions: qs, fromVision: input.fromVision === true });
      return {
        tier: strong ? "strong" : "fast",
        ...(strong ? { effort: "medium" } : {}),
        system: T.checkSystem(lang),
        prompt: text(T.checkPrompt({ text: src, questions: qs, context: ctxText(input.context) }), MAX_TEXT + MAX_CONTEXT + 20_000),
      };
    },
  },
  check_problems: {
    tier: "strong", effort: "medium", maxTokens: 8000, parse: T.parseProblemChecks,
    build(input, lang) {
      const ps = input.problems;
      if (!Array.isArray(ps) || !ps.length || ps.length > MAX_PROBLEMS) throw new HttpError(400, "bad_input", "Bad problems.");
      const src = text(input.text);
      return {
        system: T.checkProblemSystem(lang),
        prompt: text(T.checkProblemPrompt({ text: src, problems: ps, context: ctxText(input.context) }), MAX_TEXT + MAX_CONTEXT + 25_000),
      };
    },
  },
  // Worked-example templates: extract reusable problem templates from a workbook or student's workings.
  template: {
    tier: "strong", effort: "medium", maxTokens: 12000, parse: T.parseTemplates,
    build(input, lang) {
      const images = pictures(input.images ?? []);
      const body = typeof input.text === "string" ? input.text : "";
      if (body.length > MAX_TEXT) throw new HttpError(413, "too_large", `Text over ${MAX_TEXT} characters.`);
      if (!body.trim() && !images.length) throw new HttpError(400, "bad_input", "No template text or pages.");
      return {
        system: T.templateSystem(lang),
        prompt: T.templatePrompt({ title: title(input.title), text: body, knownTopics: names(input.knownTopics), pages: images.length && body.trim() ? images.map((im) => im.page) : [], context: ctxText(input.context) }),
        images: images.map((im) => ({ mediaType: im.mediaType, data: im.data })),
      };
    },
  },
  // Generate one fresh similar problem from an extracted template (strictly capped at variant 1 or 2).
  template_problem: {
    tier: "fast", maxTokens: 6000, parse: T.parseTemplateProblem,
    build(input, lang) {
      const variant = input.variant;
      if (variant !== 1 && variant !== 2) throw new HttpError(400, "bad_input", "Variant must be 1 or 2.");
      const raw = input.template;
      if (!raw || typeof raw !== "object" || typeof raw.prompt !== "string" || !raw.prompt.trim()) {
        throw new HttpError(400, "bad_input", "Missing template.");
      }
      const tpl = {
        title: String(raw.title || "").trim().slice(0, 120),
        topic: String(raw.topic || "").trim().slice(0, 80),
        prompt: raw.prompt.trim().slice(0, 2000),
        method: (Array.isArray(raw.method) ? raw.method : []).filter((s) => typeof s === "string" && s.trim()).map((s) => s.trim().slice(0, 400)).slice(0, 8),
        varies: String(raw.varies || "").trim().slice(0, 300),
        example: String(raw.example || "").trim().slice(0, 2000),
      };
      const avoid = variant === 2 && typeof input.avoid === "string" ? input.avoid.trim().slice(0, MAX_AVOID) : "";
      const context = ctxText(input.context).slice(0, MAX_TEMPLATE_CONTEXT);
      const joined = [tpl.title, tpl.prompt, ...tpl.method, tpl.example].join("\n");
      const strong = needsStrongCheck({ text: joined, questions: [{ q: joined, o: [] }] }) ||
        /\d+(?:[.,]\d+)?\s*(?:%|€|\$|Kč|EUR|CZK)\b|\b(?:zaúčtuj|účtuj|odpis|úrok|elasticit|rozptyl|odchýlk|odchylk|pravdepodobn|pravděpodobn)/i.test(joined);
      return {
        tier: strong ? "strong" : "fast",
        ...(strong ? { effort: "medium" } : {}),
        system: T.templateProblemSystem(lang),
        prompt: T.templateProblemPrompt({ template: tpl, variant, avoid, context }),
      };
    },
  },
  topics: {
    tier: "fast", maxTokens: 8000, parse: T.parseTopics,
    build(input, lang) {
      if (!Array.isArray(input.files) || !Array.isArray(input.questions)) throw new HttpError(400, "bad_input", "Bad topics input.");
      const files = input.files.map((f) => ({ name: title(f.name), summary: String(f.summary || "") }));
      const questions = input.questions.map((x) => ({ id: String(x.id), q: String(x.q) }));
      return { system: T.topicSystem(lang), prompt: text(T.topicPrompt({ files, questions }), MAX_TEXT * 2) };
    },
  },
};

// Questions sent to the "group" task: their wording is cut, so a long exam stays a short request.
const MAX_EXAM_QUESTIONS = 600;
const GROUP_TEXT = 300;
TASKS.group = {
  tier: "fast", maxTokens: 12000, parse: T.parseExamGroups,
  build(input, lang) {
    const exams = input.exams;
    if (!Array.isArray(exams) || !exams.length) throw new HttpError(400, "bad_input", "No exams.");
    const list = exams.map((e) => ({
      name: title(e && e.name), year: Number.isInteger(e && e.year) ? e.year : null,
      questions: (Array.isArray(e && e.questions) ? e.questions : []).map((q) => ({
        ref: String(q.ref).slice(0, 20), topic: String(q.topic || "").slice(0, 80), text: String(q.text || "").replace(/\s+/g, " ").slice(0, GROUP_TEXT),
      })),
    }));
    const n = list.reduce((s, e) => s + e.questions.length, 0);
    if (!n) throw new HttpError(400, "bad_input", "No questions.");
    if (n > MAX_EXAM_QUESTIONS) throw new HttpError(413, "too_large", `At most ${MAX_EXAM_QUESTIONS} questions.`);
    return { system: T.examGroupSystem(lang), prompt: text(T.examGroupPrompt({ topics: names(input.topics), exams: list }), MAX_TEXT * 4) };
  },
};

// The cache key: a SHA-256 of everything that decides the answer (task, provider, model, settings,
// instructions, prompt with the source text, pictures). The same section sent again, by the same student
// after a failed upload or by another student with the same file, gets the stored answer for free.
export async function cacheKey(task, ai, req) {
  const model = ai.models?.[req.tier] ?? "";
  const material = JSON.stringify([CACHE_VERSION, task, ai.name ?? "", model, req.effort ?? "", req.maxTokens ?? 0, req.system, req.prompt, req.images ?? []]);
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(material));
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Provider errors become codes the app can act on: "ai_busy" is worth retrying, the others are not.
function aiFailure(e) {
  if (e?.code === "no_price") return new HttpError(503, "no_price", "This AI model has no price set, so it is not used.");
  if (e?.code === "refused") return new HttpError(422, "refused", "The AI declined this part of the file.");
  const status = e?.status;
  if ([408, 409, 429, 500, 502, 503, 504, 529].includes(status) || (!status && /connection|timeout|timed out|overloaded|fetch failed/i.test(`${e?.name} ${e?.message}`))) {
    return new HttpError(503, "ai_busy", "The AI service is busy. Try again in a moment.");
  }
  return e;
}

// body: { task, input, lang }. deps: { user: {id, email} | null, ai, spend(userId) -> {month, today, minute},
// record(row), env, cache?: { get(key) -> text | null, put({ key, task, model, result }) }, deleteUser?(userId), log? }.
// task "usage" returns the caller's spending without an AI call.
// task "delete_account" deletes the caller's own account and cascades all user data (runs even over caps / off allowlist).
export async function handle(body, { user, ai, spend, record, env, cache = null, deleteUser = null, log = console.error }) {
  if (!user) throw new HttpError(401, "auth", "Sign in first.");
  const { task, input = {}, lang: l } = body || {};
  if (task === "delete_account") {
    if (!input || input.confirm !== true) throw new HttpError(400, "bad_input", "Missing delete confirmation.");
    if (typeof deleteUser !== "function") throw new HttpError(503, "server_error", "Account deletion unavailable.");
    await deleteUser(user.id);
    return { deleted: true };
  }
  const lim = limitsFrom(env);
  if (lim.allowed && !lim.allowed.includes(String(user.email || "").toLowerCase())) throw new HttpError(403, "not_allowed", "This account is not on the test list.");
  const lang = l === "cs" ? "cs" : "sk";
  const s = await spend(user.id);
  const usage = (extra = 0) => ({ monthUsd: +(s.month + extra).toFixed(4), limitUsd: lim.userMonthUsd });
  if (task === "usage") return { usage: usage() };
  const def = TASKS[task];
  if (!def) throw new HttpError(400, "bad_task", `Unknown task "${task}".`);
  if ((s.minute || 0) >= lim.perMinute) throw new HttpError(429, "rate_limit", "Too many requests in a minute. Wait a moment.");

  const req = { tier: def.tier, effort: def.effort, maxTokens: def.maxTokens, ...def.build(input, lang) };
  const model = ai.models?.[req.tier] ?? "";
  const row = (extra) => ({ user_id: user.id, task, model, input_tokens: 0, output_tokens: 0, cost_usd: 0, cached: false, ...extra });

  // A stored answer costs nothing, so it is served even when a spending cap is reached.
  const key = cache ? await cacheKey(task, ai, req) : null;
  if (key) {
    let hit = null;
    try { hit = await cache.get(key); } catch (e) { log("ai_cache read failed", e); }
    if (hit != null) {
      let result = null;
      try { result = def.parse(hit); } catch (e) { /* stored before a parser change: ask the AI again */ }
      if (result != null) {
        await record(row({ cached: true }));
        return { result, truncated: false, cached: true, costUsd: 0, usage: usage() };
      }
    }
  }

  if (s.month >= lim.userMonthUsd) throw new HttpError(429, "user_limit", "Monthly limit reached.");
  if (s.today >= lim.dailyUsd) throw new HttpError(429, "daily_limit", "The app's daily limit is reached.");

  let res;
  try { res = await ai.complete(req); } catch (e) { throw aiFailure(e); }
  const cost = res.costUsd ?? 0;
  await record(row({ model: res.model || model, input_tokens: res.usage.inputTokens, output_tokens: res.usage.outputTokens, cost_usd: cost }));
  let result;
  try { result = def.parse(res.text); } catch (e) { throw new HttpError(502, "bad_reply", "The AI reply could not be read. Try again."); }
  // Only complete answers are kept: a cut-off one should be asked for again next time.
  if (key && !res.truncated) {
    try { await cache.put({ key, task, model: res.model || model, result: res.text }); } catch (e) { log("ai_cache write failed", e); }
  }
  return { result, truncated: !!res.truncated, cached: false, costUsd: cost, usage: usage(cost) };
}
