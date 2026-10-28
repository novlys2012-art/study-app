// Server side of the upload pipeline: checks the caller and the spending caps, runs one AI task, records its cost.
// The Supabase Edge Function (supabase/functions/generate) wires it to Deno, Supabase and Claude;
// the tests wire it to fakes. Nothing here touches the network itself.
import * as T from "../ai/tasks.js";

// Defaults when the secrets are not set. USD, because that is what Anthropic bills.
export const DEFAULT_LIMITS = { userMonthUsd: 1, dailyUsd: 5 };

const MAX_TEXT = 60_000;          // characters per request, about 15k tokens
const MAX_IMAGES = 6;             // pages per vision request
const MAX_IMAGE_CHARS = 1_500_000; // base64 per page, about 1.1 MB
const MAX_QUESTIONS = 40;

export class HttpError extends Error {
  constructor(status, code, message) { super(message || code); this.status = status; this.code = code; }
}

export function limitsFrom(env = {}) {
  const num = (v, d) => (v != null && v !== "" && Number.isFinite(+v) ? +v : d);
  const allowed = String(env.ALLOWED_EMAILS || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  return {
    userMonthUsd: num(env.USER_MONTHLY_LIMIT_USD, DEFAULT_LIMITS.userMonthUsd),
    dailyUsd: num(env.DAILY_LIMIT_USD, DEFAULT_LIMITS.dailyUsd),
    allowed: allowed.length ? allowed : null,
  };
}

const text = (v, max = MAX_TEXT) => {
  if (typeof v !== "string" || !v.trim()) throw new HttpError(400, "bad_input", "Missing text.");
  if (v.length > max) throw new HttpError(413, "too_large", `Text over ${max} characters.`);
  return v;
};
const title = (v) => String(v || "").slice(0, 200);

const TASKS = {
  vision: {
    tier: "strong", effort: "medium", maxTokens: 16000, parse: T.parseVision,
    build({ images }) {
      if (!Array.isArray(images) || !images.length) throw new HttpError(400, "bad_input", "No images.");
      if (images.length > MAX_IMAGES) throw new HttpError(413, "too_large", `At most ${MAX_IMAGES} pages per request.`);
      for (const im of images) {
        if (!Number.isInteger(im.page) || !/^image\/(png|jpeg|webp)$/.test(im.mediaType) || typeof im.data !== "string") throw new HttpError(400, "bad_input", "Bad image.");
        if (im.data.length > MAX_IMAGE_CHARS) throw new HttpError(413, "too_large", "Image too large.");
      }
      return {
        system: T.visionSystem(),
        prompt: T.visionPrompt({ pages: images.map((im) => im.page) }),
        images: images.map((im) => ({ mediaType: im.mediaType, data: im.data })),
      };
    },
  },
  summary: {
    tier: "fast", maxTokens: 8000, parse: T.parseDebloat,
    build: (input, lang) => ({ system: T.debloatSystem(lang), prompt: T.debloatPrompt({ title: title(input.title), text: text(input.text) }) }),
  },
  quiz: {
    tier: "fast", maxTokens: 10000, parse: T.parseQuiz,
    build: (input, lang) => ({
      system: T.quizSystem(lang),
      prompt: T.quizPrompt({ title: title(input.title), text: text(input.text), count: Math.min(15, Math.max(1, input.count | 0 || 10)) }),
    }),
  },
  check: {
    tier: "strong", effort: "medium", maxTokens: 4000, parse: T.parseChecks,
    build(input, lang) {
      const qs = input.questions;
      if (!Array.isArray(qs) || !qs.length || qs.length > MAX_QUESTIONS) throw new HttpError(400, "bad_input", "Bad questions.");
      return { system: T.checkSystem(lang), prompt: text(T.checkPrompt({ text: text(input.text), questions: qs }), MAX_TEXT + 20_000) };
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

// body: { task, input, lang }. deps: { user: {id, email} | null, ai, spend(userId) -> {month, today}, record(row), env }.
// task "usage" returns the caller's spending without an AI call.
export async function handle(body, { user, ai, spend, record, env }) {
  if (!user) throw new HttpError(401, "auth", "Sign in first.");
  const lim = limitsFrom(env);
  if (lim.allowed && !lim.allowed.includes(String(user.email || "").toLowerCase())) throw new HttpError(403, "not_allowed", "This account is not on the test list.");
  const { task, input = {}, lang: l } = body || {};
  const lang = l === "cs" ? "cs" : "sk";
  const s = await spend(user.id);
  const usage = (extra = 0) => ({ monthUsd: +(s.month + extra).toFixed(4), limitUsd: lim.userMonthUsd });
  if (task === "usage") return { usage: usage() };
  const def = TASKS[task];
  if (!def) throw new HttpError(400, "bad_task", `Unknown task "${task}".`);
  if (s.month >= lim.userMonthUsd) throw new HttpError(429, "user_limit", "Monthly limit reached.");
  if (s.today >= lim.dailyUsd) throw new HttpError(429, "daily_limit", "The app's daily limit is reached.");

  const req = def.build(input, lang);
  const res = await ai.complete({ tier: def.tier, effort: def.effort, maxTokens: def.maxTokens, ...req });
  const cost = res.costUsd ?? 0;
  await record({
    user_id: user.id, task, model: res.model,
    input_tokens: res.usage.inputTokens, output_tokens: res.usage.outputTokens, cost_usd: cost,
  });
  let result;
  try { result = def.parse(res.text); } catch (e) { throw new HttpError(502, "bad_reply", "The AI reply could not be read. Try again."); }
  return { result, truncated: !!res.truncated, costUsd: cost, usage: usage(cost) };
}
