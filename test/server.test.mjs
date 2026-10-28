import test from "node:test";
import assert from "node:assert/strict";
import { handle, HttpError, limitsFrom } from "../server/generate.js";
import { buildSubject, stepsFor } from "../src/upload/pipeline.js";
import { parseQuiz, parseTopics, parseVision, parseChecks } from "../ai/tasks.js";

const user = { id: "u1", email: "simon@example.com" };
function deps({ month = 0, today = 0, env = {}, text = '{"title":"T","summary":"- a","key_terms":[]}' } = {}) {
  const rows = [], calls = [];
  return {
    rows, calls, user, env,
    spend: async () => ({ month, today }),
    record: async (r) => rows.push(r),
    ai: { complete: async (req) => { calls.push(req); return { text, usage: { inputTokens: 1000, outputTokens: 100 }, model: "m", costUsd: 0.01 }; } },
  };
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
