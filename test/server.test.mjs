import test from "node:test";
import assert from "node:assert/strict";
import { handle, HttpError, limitsFrom, cacheKey } from "../server/generate.js";
import { buildSubject, stepsFor, retrying, backoff } from "../src/upload/pipeline.js";
import { parseQuiz, parseTopics, parseVision, parseChecks } from "../ai/tasks.js";
import { getProvider } from "../ai/index.js";

const user = { id: "u1", email: "simon@example.com" };
function deps({ month = 0, today = 0, minute = 0, env = {}, text = '{"title":"T","summary":"- a","key_terms":[]}', truncated = false, fail = null, cache = null } = {}) {
  const rows = [], calls = [];
  return {
    rows, calls, user, env, cache, log: () => {},
    spend: async () => ({ month, today, minute }),
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

test("server: stops at the monthly and daily caps before calling the AI", async () => {
  const d = deps({ month: 1 });
  await rejects(handle({ task: "summary", input: { text: "abc" } }, d), "user_limit");
  await rejects(handle({ task: "summary", input: { text: "abc" } }, deps({ today: 5 })), "daily_limit");
  const raised = deps({ month: 1, env: { USER_MONTHLY_LIMIT_USD: "2" } });
  await handle({ task: "summary", input: { text: "abc" } }, raised);
  assert.equal(d.calls.length, 0);
  assert.equal(raised.calls.length, 1);
});

test("server: the test list blocks other accounts", async () => {
  const env = { ALLOWED_EMAILS: "Simon@Example.com, other@x.sk" };
  assert.deepEqual(limitsFrom(env).allowed, ["simon@example.com", "other@x.sk"]);
  await handle({ task: "usage" }, deps({ env }));
  await rejects(handle({ task: "usage" }, { ...deps({ env }), user: { id: "u2", email: "x@y.z" } }), "not_allowed");
});

test("server: runs a task, records its cost and returns the new total", async () => {
  const d = deps({ month: 0.2 });
  const out = await handle({ task: "summary", input: { title: "L1", text: "[1]\nText" }, lang: "cs" }, d);
  assert.equal(out.result.summary, "- a");
  assert.deepEqual(out.usage, { monthUsd: 0.21, limitUsd: 1 });
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
  assert.equal(first.cached, false);
  assert.equal(cache.m.size, 1);
  const again = await handle(body, { ...d, spend: async () => ({ month: 5, today: 0 }) });
  assert.equal(again.cached, true);
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
