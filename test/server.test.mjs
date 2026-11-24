import test from "node:test";
import assert from "node:assert/strict";
import { handle, HttpError, limitsFrom, isPlusUser, PLUS_TASKS, accountKey, MAX_CONCURRENT, cacheKey, needsStrongCheck, estimateMaxUsd } from "../server/generate.js";
import { buildSubject, stepsFor, retrying, backoff, contextOf, citedForCheck } from "../src/upload/pipeline.js";
import { createSubject } from "../src/app/subjects.js";
import { parseQuiz, parseProblems, parseTopics, parseVision, parseChecks, parseProblemChecks } from "../ai/tasks.js";
import { getProvider } from "../ai/index.js";

const user = { id: "u1", email: "simon@example.com" };
function deps({ month = 0, today = 0, freeToday = today, minute = 0, vision = 0, env = {}, text = '{"title":"T","summary":"- a","key_terms":[]}', truncated = false, fail = null, cache = null, user: u = user } = {}) {
  const rows = [], calls = [];
  return {
    rows, calls, user: u, env, cache, log: () => {},
    spend: async () => ({ month, today, freeToday, minute, vision }),
    record: async (r) => rows.push(r),
    ai: {
      name: "fake", models: { fast: "m", strong: "m2" },
      complete: async (req) => {
        calls.push(req);
        if (fail) throw fail;
        return { text, truncated, usage: { inputTokens: 1000, outputTokens: 100 }, model: "m", costUsd: 0.01 };
      },
    },
  };
}
// The ai_cache table, in memory.
function memCache() {
  const m = new Map();
  return { m, get: async (k) => m.get(k) ?? null, put: async (r) => { if (!m.has(r.key)) m.set(r.key, r.result); } };
}
const rejects = (p, code) => assert.rejects(p, (e) => e instanceof HttpError && e.code === code);

test("server: needs a signed-in user and a known task", async () => {
  await rejects(handle({ task: "summary" }, { ...deps(), user: null }), "auth");
  await rejects(handle({ task: "nope" }, deps()), "bad_task");
  await rejects(handle({ task: "summary", input: { text: "" } }, deps()), "bad_input");
  await rejects(handle({ task: "summary", input: { text: "x".repeat(70_000) } }, deps()), "too_large");
});

test("server: stops at the monthly, free-daily, global-daily and free-vision caps before calling the AI", async () => {
  const d = deps({ month: 0.15 });
  await rejects(handle({ task: "summary", input: { text: "abc" } }, d), "user_limit");
  // Free daily pool (default $3) blocks Free accounts without cutting off Plus users.
  await rejects(handle({ task: "summary", input: { text: "abc" } }, deps({ today: 3 })), "daily_limit");
  const plusUnderCeiling = deps({ today: 3, user: { ...user, plan: "plus" } });
  await handle({ task: "summary", input: { text: "abc" } }, plusUnderCeiling);
  assert.equal(plusUnderCeiling.calls.length, 1);
  // Global emergency ceiling (default $25) still stops Plus users.
  await rejects(handle({ task: "summary", input: { text: "abc" } }, deps({ today: 25, user: { ...user, plan: "plus" } })), "daily_limit");
  // Free monthly vision page cap (default 18) returns plus_required; Plus is unaffected.
  const img = [{ page: 1, mediaType: "image/jpeg", data: "AAAA" }];
  await rejects(handle({ task: "vision", input: { images: img } }, deps({ vision: 18, text: '{"pages":[{"page":1,"text":"T"}]}' })), "plus_required");
  await handle({ task: "vision", input: { images: img } }, deps({ vision: 50, user: { ...user, plan: "plus" }, text: '{"pages":[{"page":1,"text":"T"}]}' }));

  const raised = deps({ month: 0.15, env: { USER_MONTHLY_LIMIT_USD: "2" } });
  await handle({ task: "summary", input: { text: "abc" } }, raised);
  assert.equal(d.calls.length, 0);
  assert.equal(raised.calls.length, 1);
});

test("server: free vs plus tier limits and paywalled tasks", async () => {
  const lim = limitsFrom({ PLUS_EMAILS: "Plus@Example.com, vip@skola.sk", USER_MONTHLY_LIMIT_USD: "1" });
  assert.equal(lim.freeMonthUsd, 0.15);
  assert.equal(lim.plusMonthUsd, 1.5);
  assert.equal(isPlusUser(user, lim), false);
  assert.equal(isPlusUser({ id: "u-owner", email: "novlys2012@gmail.com" }, limitsFrom({})), true);
  assert.equal(isPlusUser({ id: "u2", email: "plus@example.com" }, lim), true);
  assert.equal(isPlusUser({ id: "u3", email: "a@b.c", plan: "plus" }, lim), true);

  // Free user cannot run Plus tasks (exam, group, problems, check_problems, template, template_problem).
  for (const task of PLUS_TASKS) {
    await rejects(handle({ task, input: {} }, deps()), "plus_required");
  }

  // Plus user gets $1.50 (150 credits) monthly limit and can run above the $0.15 free limit.
  const plusDeps = { ...deps({ month: 0.5, env: { PLUS_EMAILS: user.email } }) };
  const uOut = await handle({ task: "usage" }, plusDeps);
  assert.deepEqual(uOut.usage, { plan: "plus", monthUsd: 0.5, limitUsd: 1.5 });
  await handle({ task: "summary", input: { text: "abc" } }, plusDeps);
  assert.equal(plusDeps.calls.length, 1);
  await rejects(handle({ task: "summary", input: { text: "abc" } }, { ...plusDeps, spend: async () => ({ month: 1.5, today: 0, minute: 0 }) }), "user_limit");
});

test("server: pre-call cost reservation & concurrency cap block parallel TOCTOU bursts and release on failure", async () => {
  const key = await accountKey(user);
  assert.match(key, /^[0-9a-f]{64}$/);
  assert.equal(await accountKey({ id: "u9", email: "  SIMON@EXAMPLE.COM " }), key);

  // Two parallel requests when only 1 fast reservation ($0.005) fits under the $0.15 free cap:
  // the first enters ai.complete, the second sees the reserved spend and is rejected before calling AI.
  const nearCap = deps({ month: 0.146, user: { id: "u-race", email: "race@example.com" } });
  const [r1, r2] = await Promise.allSettled([
    handle({ task: "summary", input: { text: "one" } }, nearCap),
    handle({ task: "summary", input: { text: "two" } }, nearCap),
  ]);
  assert.equal(r1.status, "fulfilled");
  assert.equal(r2.status, "rejected");
  assert.equal(r2.reason.code, "user_limit");
  assert.equal(nearCap.calls.length, 1, "only one parallel call reached the AI");
  assert.equal(nearCap.rows[0].account_key, await accountKey({ id: "u-race", email: "race@example.com" }));

  // Firing more than MAX_CONCURRENT.free parallel requests triggers rate_limit on the excess.
  const burst = deps({ month: 0, user: { id: "u-burst", email: "burst@example.com" } });
  const batch = await Promise.allSettled(
    Array.from({ length: MAX_CONCURRENT.free + 2 }, (_, k) => handle({ task: "summary", input: { text: `part ${k}` } }, burst)),
  );
  assert.equal(batch.filter((x) => x.status === "fulfilled").length, MAX_CONCURRENT.free);
  assert.deepEqual(batch.filter((x) => x.status === "rejected").map((x) => x.reason.code), ["rate_limit", "rate_limit"]);

  // Worst-case cost estimator covers Sonnet 16k-output + images accurately.
  const sonnetAi = { name: "anthropic", models: { fast: "claude-haiku-5-5", strong: "claude-sonnet-5-5" } };
  const strongEst = estimateMaxUsd(sonnetAi, { tier: "strong", system: "s".repeat(2000), prompt: "p".repeat(12000), images: [{}, {}, {}, {}, {}, {}], maxTokens: 16000 });
  assert.ok(strongEst >= 0.18, `expected worst-case Sonnet reserve >= $0.18, got ${strongEst}`);

  // Atomic DB reserve/release hooks: reservation enforces server reasons, updates on success, deletes on failure.
  const dbRows = new Map();
  let seq = 1;
  const warnings = [];
  const withDbReserve = ({ fail = null, reserveResult = null } = {}) => ({
    ...deps({ fail, user: { id: "u-db", email: "db@example.com" } }),
    log: (msg, meta) => warnings.push([msg, meta]),
    reserve: async (p) => {
      if (reserveResult) return reserveResult;
      const id = seq++;
      dbRows.set(id, { ...p, cost_usd: p.est_usd });
      return { ok: true, id, month: 0, today: 21, freeToday: 0, minute: 0 };
    },
    release: async (id) => { dbRows.delete(id); },
    record: async (row, id) => { dbRows.set(id ?? seq++, row); },
  });
  await handle({ task: "summary", input: { text: "ok" } }, withDbReserve());
  assert.equal(dbRows.size, 1);
  assert.equal([...dbRows.values()][0].cost_usd, 0.01);
  assert.ok(warnings.some(([m]) => m === "daily_spend_high"), "logs warning above 80% of daily ceiling");

  for (const reason of ["rate_limit", "plus_required", "user_limit", "daily_limit"]) {
    const blocked = withDbReserve({ reserveResult: { ok: false, reason } });
    await rejects(handle({ task: "summary", input: { text: "blocked" } }, blocked), reason);
    assert.equal(blocked.calls.length, 0);
  }

  await rejects(handle({ task: "summary", input: { text: "fail" } }, withDbReserve({ fail: Object.assign(new Error("busy"), { status: 503 }) })), "ai_busy");
  assert.equal(dbRows.size, 1, "failed provider call released its reserved row");
});

test("server: malformed inputs return 400 bad_input instead of throwing 500", async () => {
  const plusUser = { ...user, plan: "plus" };
  await rejects(handle({ task: "summary", input: null }, deps()), "bad_input");
  await rejects(handle({ task: "summary", input: "text" }, deps()), "bad_input");
  await rejects(handle({ task: "topics", input: { files: [null], questions: [] } }, deps()), "bad_input");
  await rejects(handle({ task: "topics", input: { files: [], questions: [null] } }, deps()), "bad_input");
  await rejects(handle({ task: "group", input: { exams: [null] } }, deps({ user: plusUser })), "bad_input");
  await rejects(handle({ task: "group", input: { exams: [{ name: "E", questions: [null] }] } }, deps({ user: plusUser })), "bad_input");
  await rejects(handle({ task: "check", input: { text: "src", questions: [null] } }, deps()), "bad_input");
  await rejects(handle({ task: "check", input: { text: "src", questions: [{ q: "A?", o: ["only-one"], a: 0 }] } }, deps()), "bad_input");
  await rejects(handle({ task: "check", input: { text: "src", questions: [{ q: "A?", o: ["a", "b"], a: 5 }] } }, deps()), "bad_input");
  await rejects(handle({ task: "check_problems", input: { text: "src", problems: [null] } }, deps({ user: plusUser })), "bad_input");
  await rejects(handle({ task: "check_problems", input: { text: "src", problems: [{ q: "A", steps: "not-array", ans: "1" }] } }, deps({ user: plusUser })), "bad_input");
});

test("server: the test list blocks other accounts", async () => {
  const env = { ALLOWED_EMAILS: "Simon@Example.com, other@x.sk" };
  assert.deepEqual(limitsFrom(env).allowed, ["simon@example.com", "other@x.sk"]);
  await handle({ task: "usage" }, deps({ env }));
  await rejects(handle({ task: "usage" }, { ...deps({ env }), user: { id: "u2", email: "x@y.z" } }), "not_allowed");
});

test("server: runs a task, records its cost and returns the new total", async () => {
  const d = deps({ month: 0.05 });
  const out = await handle({ task: "summary", input: { title: "L1", text: "[1]\nText" }, lang: "cs" }, d);
  assert.equal(out.result.summary, "- a");
  assert.deepEqual(out.usage, { plan: "free", monthUsd: 0.06, limitUsd: 0.15 });
  assert.equal(d.rows[0].cost_usd, 0.01);
  assert.equal(d.rows[0].task, "summary");
  assert.equal(d.calls[0].tier, "fast");
  assert.match(d.calls[0].system, /Czech/);
});

test("server: vision uses the strong tier and checks the images", async () => {
  const d = deps({ text: '{"pages":[{"page":3,"text":"T"}]}' });
  const out = await handle({ task: "vision", input: { images: [{ page: 3, mediaType: "image/jpeg", data: "AAAA" }] } }, d);
  assert.deepEqual(out.result, [{ page: 3, text: "T" }]);
  assert.equal(d.calls[0].tier, "strong");
  assert.equal(d.calls[0].effort, "low");
  assert.equal(d.calls[0].images.length, 1);
  await rejects(handle({ task: "vision", input: { images: Array(7).fill({ page: 1, mediaType: "image/jpeg", data: "A" }) } }, d), "too_large");
});

test("server: an unreadable reply is still paid for", async () => {
  const d = deps({ text: "sorry" });
  await rejects(handle({ task: "quiz", input: { text: "abc" } }, d), "bad_reply");
  assert.equal(d.rows.length, 1);
});

test("parsers keep only well-formed items", () => {
  const q = parseQuiz('{"questions":[{"q":"A?","o":["1","2"],"a":1,"s":"q","page":2},{"q":"B?","o":["1"],"a":0}]}');
  assert.equal(q.questions.length, 1); assert.equal(q.dropped, 1); assert.equal(q.questions[0].page, 2);
  assert.deepEqual(parseVision('x {"pages":[{"page":1,"text":"a"},{"page":"2"}]}'), [{ page: 1, text: "a" }]);
  assert.deepEqual(parseChecks('{"checks":[{"i":0,"verdict":"ok"},{"i":1,"verdict":"maybe"}]}'), [{ i: 0, verdict: "ok", note: "" }]);
  assert.equal(parseTopics('{"topics":[{"name":"A","questions":["f1#1"],"weak_spots":["x"]},{"name":""}]}').topics.length, 1);
});

// A fake server: one picture page, one question the check rejects.
function fakeCall() {
  const log = [];
  const call = async (task, input) => {
    log.push(task);
    if (task === "vision") return input.images.map((im) => ({ page: im.page, text: "Prepis obrázka" }));
    if (task === "summary") return { title: "Dopyt a ponuka", summary: "## Dopyt\n- **Dopyt** klesá s cenou", keyTerms: [{ term: "Dopyt", meaning: "ochota kúpiť" }] };
    if (task === "quiz") return { questions: [
      { q: "Čo sa stane s dopytom, keď cena stúpne?", o: ["klesne", "stúpne"], a: 0, e: "", x: "", s: "klesá s cenou", page: 1 },
      { q: "Zlá otázka", o: ["a", "b"], a: 1, e: "", x: "", s: "", page: 2 },
    ] };
    if (task === "check") { assert.match(input.text, /\[1\]/); return [{ i: 0, verdict: "ok" }, { i: 1, verdict: "wrong" }]; }
    if (task === "topics") return { topics: [{ name: "Dopyt", files: ["L1"], summary: "S", questions: ["f1#1"], weakSpots: ["posun vs. pohyb"] }] };
  };
  return { call, log };
}

test("pipeline: builds a subject in the quiz format from one file", async () => {
  const docs = [{ name: "L1", pages: ["Dopyt klesá s cenou. ".repeat(20), ""], images: [{ page: 2, mediaType: "image/jpeg", data: "A" }] }];
  const { call, log } = fakeCall();
  const steps = [];
  const sj = await buildSubject({ name: "Mikroekonómia", docs, call, onStep: (d, n) => steps.push([d, n]) });
  assert.deepEqual(log, ["vision", "summary", "quiz", "check", "topics"]);
  assert.equal(stepsFor(docs), 5);
  assert.deepEqual(steps.at(-1), [5, 5]);
  assert.equal(sj.code, "MIK");
  assert.deepEqual(sj.topics, { t1: "Dopyt" });
  assert.equal(sj.questions.length, 1);
  assert.equal(sj.checkedOut, 1);
  const x = sj.questions[0];
  assert.deepEqual(Object.keys(x), ["t", "q", "o", "a", "e", "x", "s", "id"]);
  assert.equal(x.t, "t1");
  assert.match(x.s, /\(L1, s\. 1\)$/);
  assert.equal(sj.files[0].pagesBefore, 2);
  assert.equal(sj.files[0].picturePages, 1);
  assert.deepEqual(sj.topicInfo.t1.weakSpots, ["posun vs. pohyb"]);
});

test("pipeline: makes only what was chosen", async () => {
  const docs = [{ name: "L1", pages: ["Dopyt klesá s cenou. ".repeat(20)], images: [] }];
  const { call, log } = fakeCall();
  const make = { summary: false, quiz: true, topics: false };
  const steps = [];
  const sj = await buildSubject({ name: "M", docs, call, make, onStep: (d, n) => steps.push([d, n]) });
  assert.deepEqual(log, ["quiz", "check"]);
  assert.equal(stepsFor(docs, make), 2);
  assert.deepEqual(steps.at(-1), [2, 2]);
  assert.equal(sj.files[0].summary, "");
  assert.deepEqual(Object.values(sj.topics), ["L1"]);
});

test("pipeline: adds files to a subject and sorts topics again; every question keeps its id", async () => {
  const { call } = fakeCall();
  const docs = [{ name: "L1", pages: ["Dopyt klesá s cenou. ".repeat(20)], images: [] }];
  const first = await buildSubject({ name: "Mikro", docs, call });
  const oldId = first.questions[0].id;
  const log = [];
  let sent;
  const call2 = async (task, input) => {
    log.push(task);
    if (task === "topics") {
      sent = input;
      return { topics: [{ name: "Ponuka", questions: ["n1#1"], files: [], summary: "", weakSpots: [] }, { name: "Dopyt", questions: ["p1"], files: [], summary: "", weakSpots: [] }] };
    }
    if (task === "quiz") return { questions: [{ q: "Čo robí ponuka, keď cena stúpne?", o: ["rastie", "klesá"], a: 0, e: "", x: "", s: "rastie", page: 1 }] };
    if (task === "check") return [{ i: 0, verdict: "ok" }];
    return call(task, input);
  };
  const sj = await buildSubject({ name: "", docs: [{ name: "L2", pages: ["Ponuka rastie s cenou. ".repeat(20)], images: [] }], call: call2, existing: first });
  assert.equal(sj.id, first.id);
  assert.equal(sj.name, "Mikro");
  assert.deepEqual(sent.files.map((f) => f.name), ["L1", "L2"]);
  assert.deepEqual(sent.questions.map((x) => x.id), ["p1", "n1#1"]);
  assert.deepEqual(sj.topics, { t1: "Ponuka", t2: "Dopyt" });
  assert.equal(sj.questions.length, 2);
  const moved = sj.questions.find((x) => x.q === first.questions[0].q);
  assert.equal(moved.t, "t2");
  assert.equal(moved.id, oldId, "a question keeps its id when the topics are sorted again");
  const added = sj.questions.find((x) => x.q !== first.questions[0].q);
  assert.match(added.id, /^q[0-9a-f]{10}$/);
  assert.notEqual(added.id, oldId);
  assert.equal(sj.checkedOut, first.checkedOut);
  assert.deepEqual(sj.failed, []);
});

// ----- Phase 0: the price gate, error codes, the per-minute limit and the result cache

test("ai: a model with no price is never run", async () => {
  const ai = getProvider({ AI_MODEL_FAST: "claude-unknown-1", ANTHROPIC_API_KEY: "not-used" });
  await assert.rejects(ai.complete({ tier: "fast", system: "s", prompt: "p" }), (e) => e.code === "no_price");
  const d = deps({ fail: Object.assign(new Error("x"), { code: "no_price" }) });
  await rejects(handle({ task: "summary", input: { text: "abc" } }, d), "no_price");
  assert.equal(d.rows.length, 0, "nothing is recorded at $0");
});

test("server: provider errors become codes, and only a busy AI is worth retrying", async () => {
  await rejects(handle({ task: "summary", input: { text: "abc" } }, deps({ fail: Object.assign(new Error("Overloaded"), { status: 529 }) })), "ai_busy");
  await rejects(handle({ task: "summary", input: { text: "abc" } }, deps({ fail: Object.assign(new TypeError("fetch failed")) })), "ai_busy");
  await rejects(handle({ task: "summary", input: { text: "abc" } }, deps({ fail: Object.assign(new Error("declined"), { code: "refused" }) })), "refused");
  await assert.rejects(handle({ task: "summary", input: { text: "abc" } }, deps({ fail: new RangeError("bug") })), (e) => e instanceof RangeError);
});

test("server: the per-minute limit stops a burst", async () => {
  await rejects(handle({ task: "summary", input: { text: "abc" } }, deps({ minute: 60 })), "rate_limit");
  await handle({ task: "summary", input: { text: "abc" } }, deps({ minute: 60, env: { USER_RATE_PER_MINUTE: "100" } }));
  await handle({ task: "usage" }, deps({ minute: 999 }));
});

test("server: the same request is answered from the cache, for free and even over the cap", async () => {
  const cache = memCache();
  const d = deps({ cache });
  const body = { task: "summary", input: { title: "L1", text: "[1]\nText" } };
  const first = await handle(body, d);
  assert.equal("cached" in first, false, "HTTP response omits cached flag");
  assert.equal(d.rows[0].cached, false);
  assert.equal(cache.m.size, 1);
  const again = await handle(body, { ...d, spend: async () => ({ month: 5, today: 0, minute: 0 }) });
  assert.equal("cached" in again, false, "HTTP response omits cached flag on hit too");
  assert.deepEqual(again.result, first.result);
  assert.equal(d.calls.length, 1, "the AI was asked once");
  assert.deepEqual([d.rows[1].cached, d.rows[1].cost_usd], [true, 0]);
  // Another language, another text or another model is a different request.
  await handle({ ...body, lang: "cs" }, d);
  await handle({ ...body, input: { ...body.input, text: "[1]\nOther" } }, d);
  assert.equal(d.calls.length, 3);
  const req = { tier: "fast", system: "s", prompt: "p" };
  assert.notEqual(await cacheKey("summary", { name: "a", models: { fast: "x" } }, req), await cacheKey("summary", { name: "a", models: { fast: "y" } }, req));
  assert.match(await cacheKey("summary", d.ai, req), /^[0-9a-f]{64}$/);
});

test("server: unreadable, cut-off and failed answers are not cached", async () => {
  const cache = memCache();
  await rejects(handle({ task: "quiz", input: { text: "abc" } }, deps({ cache, text: "sorry" })), "bad_reply");
  await handle({ task: "summary", input: { text: "abc" } }, deps({ cache, truncated: true }));
  await rejects(handle({ task: "summary", input: { text: "abc" } }, deps({ cache, fail: Object.assign(new Error("x"), { status: 503 }) })), "ai_busy");
  assert.equal(cache.m.size, 0);
  // A broken cache never breaks the call.
  const broken = { get: async () => { throw new Error("db down"); }, put: async () => { throw new Error("db down"); } };
  const out = await handle({ task: "summary", input: { text: "abc" } }, deps({ cache: broken }));
  assert.equal(out.result.summary, "- a");
});

test("pipeline: a failed call is tried again with growing waits", async () => {
  const busy = Object.assign(new Error("busy"), { code: "ai_busy" });
  let n = 0;
  const waits = [];
  const call = retrying(async () => { if (++n < 3) throw busy; return "ok"; }, { sleep: async (ms) => waits.push(ms) });
  assert.equal(await call("summary", {}), "ok");
  assert.deepEqual(waits, [2000, 4000]);
  const limit = Object.assign(new Error("limit"), { code: "user_limit" });
  let m = 0;
  await assert.rejects(retrying(async () => { m++; throw limit; }, { base: 0 })("summary", {}), (e) => e === limit);
  assert.equal(m, 1, "a spending limit is not retried");
  assert.deepEqual([backoff(2, "rate_limit"), backoff(3, "rate_limit")], [15000, 30000]);
});

test("pipeline: a file that keeps failing is left out, and the others are kept", async () => {
  const { call } = fakeCall();
  const refused = Object.assign(new Error("refused"), { code: "refused" });
  const tries = {};
  const flaky = async (task, input) => {
    if (task === "quiz" && input.title === "L2") { tries.L2 = (tries.L2 || 0) + 1; throw refused; }
    return call(task, input);
  };
  const docs = ["L1", "L2", "L3"].map((name) => ({ name, pages: ["Dopyt klesá s cenou. ".repeat(20)], images: [] }));
  const states = [], steps = [];
  const sj = await buildSubject({ name: "M", docs, call: flaky, retry: { base: 0 }, onFile: (k, st) => states.push(k + st), onStep: (d, n) => steps.push([d, n]) });
  assert.deepEqual(sj.files.map((f) => f.name), ["L1", "L3"]);
  assert.deepEqual(sj.failed.map((f) => [f.index, f.name, f.code]), [[1, "L2", "refused"]]);
  assert.equal(tries.L2, 1, "a refusal is not retried");
  assert.deepEqual(states, ["0ai", "0done", "1ai", "1failed", "2ai", "2done"]);
  assert.deepEqual(steps.at(-1), [stepsFor(docs), stepsFor(docs)], "the bar still ends full");
});

test("pipeline: a spending limit stops the upload but keeps what finished", async () => {
  const { call } = fakeCall();
  const limit = Object.assign(new Error("limit"), { code: "user_limit" });
  const docs = ["L1", "L2", "L3"].map((name) => ({ name, pages: ["Dopyt klesá s cenou. ".repeat(20)], images: [] }));
  const log = [];
  const capped = async (task, input) => { log.push(task + ":" + (input.title || "")); if (input.title === "L2") throw limit; return call(task, input); };
  const sj = await buildSubject({ name: "M", docs, call: capped, retry: { base: 0 } });
  assert.deepEqual(sj.files.map((f) => f.name), ["L1"]);
  assert.deepEqual(sj.failed.map((f) => [f.name, f.code]), [["L2", "user_limit"], ["L3", "user_limit"]]);
  assert.ok(!log.some((x) => x.endsWith(":L3")), "nothing more is sent after the limit");
  assert.ok(!log.includes("topics:"), "no topic sort over the limit");
  // Nothing finished at all: the error itself comes back.
  await assert.rejects(buildSubject({ name: "M", docs: docs.slice(1, 2), call: capped, retry: { base: 0 } }), (e) => e === limit);
});

test("pipeline: context files skip summary/quiz/topics and feed context into other files", async () => {
  const seen = [];
  const { call } = fakeCall();
  const spy = async (task, input) => { seen.push({ task, input }); return call(task, input); };
  const docs = [
    { name: "Prednaska.pdf", pages: ["Dopyt klesá s cenou. ".repeat(20)], images: [] },
    { name: "Vzorce.pdf", pages: ["E = (dQ/dP) * (P/Q)"], images: [], context: true },
  ];
  assert.equal(stepsFor(docs), 4, "context file adds no summary/quiz/check steps");
  const sj = await buildSubject({ name: "Mikro", docs, call: spy });
  const ctxFile = sj.files.find((f) => f.name === "Vzorce.pdf");
  assert.equal(ctxFile.context, true);
  assert.equal(ctxFile.summary, "");
  assert.match(ctxFile.text, /E = \(dQ\/dP\)/);
  assert.equal(sj.files.find((f) => f.name === "Prednaska.pdf").summary.length > 0, true);
  for (const t of ["summary", "quiz", "check"]) {
    const callInput = seen.find((x) => x.task === t).input;
    assert.match(callInput.context, /Vzorce\.pdf/);
    assert.match(callInput.context, /E = \(dQ\/dP\)/);
  }
  const topicsInput = seen.find((x) => x.task === "topics").input;
  assert.deepEqual(topicsInput.files.map((f) => f.name), ["Prednaska.pdf"], "context file is excluded from topic files");
  assert.match(contextOf(sj.files), /E = \(dQ\/dP\)/);

  // Uploading only a context file makes zero AI calls and keeps context text for future uploads.
  const onlySeen = [];
  const onlyCtxDocs = [{ name: "Tabulka.pdf", pages: ["Tabuľka hodnôt"], images: [], context: true }];
  assert.equal(stepsFor(onlyCtxDocs), 0);
  const onlySj = await buildSubject({ name: "LenKontext", docs: onlyCtxDocs, call: async (t, i) => { onlySeen.push(t); return call(t, i); } });
  assert.deepEqual(onlySeen, []);
  assert.equal(onlySj.files[0].context, true);
  assert.match(onlySj.files[0].text, /Tabuľka hodnôt/);
});

test("server: optional context is included in prompts and validated", async () => {
  const d = deps();
  await handle({ task: "summary", input: { title: "L1", text: "Obsah", context: "Vzorec: F = m*a" } }, d);
  assert.match(d.calls[0].prompt, /<context>\nVzorec: F = m\*a\n<\/context>/);
  await rejects(handle({ task: "summary", input: { title: "L1", text: "Obsah", context: 123 } }, d), "bad_input");
  await rejects(handle({ task: "summary", input: { title: "L1", text: "Obsah", context: "x".repeat(30_001) } }, d), "too_large");
});

test("server: check uses fast tier for plain prose and escalates to strong for math or vision", async () => {
  const okReply = '{"checks":[{"i":0,"verdict":"ok","note":""}]}';
  const cache = memCache();
  const prose = [{ q: "Čo upravuje zákon č. 40/1964 Zb. v rokoch 2020-2024 pre e-mail a PFK-1?", o: ["1989", "1993", "2004", "2009"], a: 0 }];
  const d1 = deps({ text: okReply, cache });
  await handle({ task: "check", input: { text: "[1]\nZákon č. 40/1964 Zb. definuje základné pojmy.", questions: prose } }, d1);
  assert.equal(d1.calls[0].tier, "fast");
  assert.equal(d1.calls[0].effort, undefined);

  const mathQ = [{ q: "Vypočítajte hodnotu výrazu x² pri x = 3.", o: ["6", "9", "12", "27"], a: 1 }];
  const d2 = deps({ text: okReply, cache });
  await handle({ task: "check", input: { text: "[1]\nMocniny", questions: mathQ } }, d2);
  assert.equal(d2.calls[0].tier, "strong");
  assert.equal(d2.calls[0].effort, "medium");
  // Cached hit logs the routed strong model rather than the default fast tier.
  await handle({ task: "check", input: { text: "[1]\nMocniny", questions: mathQ } }, d2);
  assert.equal(d2.rows[1].cached, true);
  assert.equal(d2.rows[1].model, "m2");

  const d3 = deps({ text: okReply });
  await handle({ task: "check", input: { text: "[1]\nGraf zo slajdu.", questions: prose, fromVision: true } }, d3);
  assert.equal(d3.calls[0].tier, "strong");
  assert.equal(d3.calls[0].effort, "medium");

  assert.equal(needsStrongCheck({ text: "Bežný text a/alebo 1-2 vety", questions: prose }), false);
  assert.equal(needsStrongCheck({ text: "F = m * a", questions: prose }), true);
  assert.equal(needsStrongCheck({ text: "Text", questions: [{ q: "Aká je pravdepodobnosť?", o: ["0,05", "0,5", "5", "50"] }] }), true);
  assert.equal(needsStrongCheck({ text: "Text", questions: [{ q: "Spočítejte směrodatnou odchylku", o: ["A", "B"] }] }), true);
});

test("pipeline: citedForCheck recovers missing pages from quotes and tracks vision pages", () => {
  const pages = ["Prvá strana úvod", "Dopyt klesá s cenou na trhu.", "Tretia strana obrázok grafu"];
  const sec = { from: 1, to: 3, text: "[1]\nPrvá strana úvod\n\n[2]\nDopyt klesá s cenou na trhu.\n\n[3]\nTretia strana obrázok grafu" };
  const recovered = citedForCheck(sec, pages, [
    { page: 1, s: "Prvá strana" },
    { page: null, s: "Dopyt klesá s cenou" },
  ], new Set([3]));
  assert.match(recovered.text, /\[1\]/);
  assert.match(recovered.text, /\[2\]/);
  assert.doesNotMatch(recovered.text, /\[3\]/);
  assert.equal(recovered.fromVision, false);

  const withVision = citedForCheck(sec, pages, [{ page: 3, s: "obrázok grafu" }], new Set([3]));
  assert.equal(withVision.fromVision, true);

  const fallback = citedForCheck(sec, pages, [{ page: null, s: "úplne iný citát" }], new Set([3]));
  assert.equal(fallback.text, sec.text);
  assert.equal(fallback.fromVision, true);
});

test("server: delete_account requires auth and confirm, and works even over limits or off allowlist", async () => {
  const deleted = [];
  const delDeps = (extra = {}) => ({
    ...deps({ month: 99, today: 99, env: { ALLOWED_EMAILS: "other@example.com" } }),
    deleteUser: async (uid) => { deleted.push(uid); },
    ...extra,
  });
  await rejects(handle({ task: "delete_account", input: { confirm: true } }, delDeps({ user: null })), "auth");
  await rejects(handle({ task: "delete_account", input: {} }, delDeps()), "bad_input");
  await rejects(handle({ task: "delete_account", input: { confirm: true } }, delDeps({ deleteUser: null })), "server_error");
  const out = await handle({ task: "delete_account", input: { confirm: true } }, delDeps());
  assert.deepEqual(out, { deleted: true });
  assert.deepEqual(deleted, [user.id]);
});

test("server & parsers: problems run on fast tier and check_problems runs on strong tier with fix support", async () => {
  const parsed = parseProblems(JSON.stringify({
    problems: [
      { q: "Vypočítaj 2x pre x = 5.", hints: ["Dosadz x = 5", ""], steps: ["2 × 5 = 10"], ans: "10", check: { num: 10, tol: 0.01, unit: "" }, e: "Jednoduché násobenie.", s: "2x", page: 1 },
      { q: "Bez postupu", steps: [], ans: "1" },
    ],
  }));
  assert.equal(parsed.problems.length, 1);
  assert.equal(parsed.dropped, 1);
  assert.deepEqual(parsed.problems[0].hints, ["Dosadz x = 5"]);
  assert.deepEqual(parsed.problems[0].check, { num: 10, tol: 0.01, unit: "" });

  const checks = parseProblemChecks(JSON.stringify({
    checks: [
      { i: 0, verdict: "ok", note: "", fix: null },
      { i: 1, verdict: "wrong", note: "Chyba v sčítaní", fix: { steps: ["2 + 3 = 5"], ans: "5", check: { num: 5, tol: 0.01, unit: "" } } },
      { i: 2, verdict: "ambiguous", note: "Chýba údaj", fix: null },
    ],
  }));
  assert.equal(checks.length, 3);
  assert.equal(checks[0].fix, null);
  assert.deepEqual(checks[1].fix, { steps: ["2 + 3 = 5"], ans: "5", check: { num: 5, tol: 0.01, unit: "" } });

  const d1 = { ...deps({ text: '{"problems":[{"q":"Nájdi deriváciu x²","hints":["Mocninové pravidlo"],"steps":["(x²)′ = 2x"],"ans":"2x","check":null,"e":"","s":"derivácia","page":1}]}' }), user: { ...user, plan: "plus" } };
  const r1 = await handle({ task: "problems", input: { title: "Mat1", text: "[1]\nDerivácia x²", context: "Vzorec: (xⁿ)′ = n·xⁿ⁻¹" } }, d1);
  assert.equal(d1.calls[0].tier, "fast");
  assert.match(d1.calls[0].prompt, /<context>/);
  assert.equal(r1.result.problems.length, 1);

  const d2 = { ...deps({ text: '{"checks":[{"i":0,"verdict":"ok","note":"","fix":null}]}' }), user: { ...user, plan: "plus" } };
  await handle({ task: "check_problems", input: { text: "[1]\nDerivácia x²", problems: r1.result.problems } }, d2);
  assert.equal(d2.calls[0].tier, "strong");
  assert.equal(d2.calls[0].effort, "medium");
  await rejects(handle({ task: "check_problems", input: { text: "[1]\nA", problems: [] } }, d2), "bad_input");
});

test("pipeline: generates, verifies, repairs, drops and preserves worked practice problems", async () => {
  const docs = [
    { name: "Stat_01.pdf", pages: ["Výberový priemer x̄ = ∑xᵢ / n a t-test pre strednú hodnotu. ".repeat(15)], images: [] },
    { name: "Vzorce.pdf", pages: ["t = (x̄ - μ₀) / (s / √n)"], images: [], context: true },
  ];
  const log = [];
  const call = async (task, input) => {
    log.push(task);
    if (task === "problems") {
      assert.match(input.context, /t = \(x̄/);
      return {
        problems: [
          { q: "Vypočítaj priemer z 2, 4, 6.", hints: ["Sčítaj a vydeľ počtom."], steps: ["(2+4+6)/3 = 4"], ans: "4", check: { num: 4, tol: 0.01, unit: "" }, e: "Definícia priemeru.", s: "Výberový priemer", page: 1 },
          { q: "Vypočítaj priemer z 10, 20.", hints: ["Vydeľ 2."], steps: ["(10+20)/2 = 16"], ans: "16", check: { num: 16, tol: 0.01, unit: "" }, e: "", s: "Výberový priemer", page: 1 },
          { q: "Neriešiteľný príklad bez dát.", hints: [], steps: ["?"], ans: "?", check: null, e: "", s: "", page: 1 },
        ],
      };
    }
    if (task === "check_problems") {
      assert.match(input.context, /t = \(x̄/);
      return [
        { i: 0, verdict: "ok", note: "", fix: null },
        { i: 1, verdict: "wrong", note: "Chyba výpočtu", fix: { steps: ["(10+20)/2 = 15"], ans: "15", check: { num: 15, tol: 0.01, unit: "" } } },
        { i: 2, verdict: "ambiguous", note: "Chýbajú dáta", fix: null },
      ];
    }
    if (task === "topics") {
      return { topics: [{ name: "Štatistika", files: ["Stat_01.pdf"], summary: "Priemer a testy.", questions: input.questions.map((x) => x.id), weakSpots: [] }] };
    }
    throw new Error("unexpected task: " + task);
  };
  const make = { summary: false, quiz: false, problems: true, topics: true };
  assert.equal(stepsFor(docs, make), 3);
  const steps = [];
  const sj = await buildSubject({ name: "Štatistika", docs, call, make, onStep: (d, n) => steps.push([d, n]) });
  assert.deepEqual(log, ["problems", "check_problems", "topics"]);
  assert.deepEqual(steps.at(-1), [3, 3]);
  assert.equal(sj.checkedOut, 1);
  assert.equal(sj.questions.length, 2);
  assert.equal(sj.questions[0].kind, "problem");
  assert.equal(sj.questions[0].ans, "4");
  assert.equal(sj.questions[1].ans, "15", "repaired by check_problems fix");
  assert.deepEqual(sj.questions[1].steps, ["(10+20)/2 = 15"]);
  assert.equal(sj.questions[1].check.num, 15);
  assert.match(sj.questions[0].s, /\(Stat_01\.pdf, s\. 1\)$/);

  // Adding another file keeps existing problems' kind, steps, ans, check and ids intact.
  const prevId = sj.questions[0].id;
  const sj2 = await buildSubject({
    name: "", existing: sj, docs: [{ name: "Stat_02.pdf", pages: ["Rozptyl s² = ∑(xᵢ-x̄)²/(n-1). ".repeat(15)], images: [] }],
    make: { summary: false, quiz: false, problems: false, topics: false },
    call: async () => { throw new Error("no AI calls expected"); },
  });
  const kept = sj2.questions.find((x) => x.id === prevId);
  assert.equal(kept.kind, "problem");
  assert.deepEqual(kept.steps, ["(2+4+6)/3 = 4"]);
  assert.equal(kept.ans, "4");
});

test("pipeline: uploading files later into an empty subject preserves its id, name and exam date", async () => {
  const empty = { ...createSubject("Mikroekonómia"), exam: "2027-01-15" };
  const docs = [{ name: "L1.pdf", pages: ["Dopyt klesá s cenou. ".repeat(20)], images: [] }];
  const { call: baseCall } = fakeCall();
  const call = async (task, input) => (task === "topics"
    ? { topics: [{ name: "Dopyt", files: ["L1.pdf"], summary: "S", questions: input.questions.map((x) => x.id), weakSpots: [] }] }
    : baseCall(task, input));
  const filled = await buildSubject({ name: "", existing: empty, docs, call });
  assert.equal(filled.id, empty.id);
  assert.equal(filled.name, "Mikroekonómia");
  assert.equal(filled.exam, "2027-01-15");
  assert.equal(filled.files.length, 1);
  assert.equal(filled.questions.length, 1);
  assert.equal(filled.questions[0].t, "t1");
  assert.deepEqual(filled.topics, { t1: "Dopyt" });
});



