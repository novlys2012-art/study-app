import test from "node:test";
import assert from "node:assert/strict";

// A localStorage for Node, so the device store runs as it does in the browser.
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k),
  key: (i) => [...mem.keys()][i] ?? null, get length() { return mem.size; },
};
const S = await import("../src/app/subjects.js");
const subject = (id, name) => ({ id, name, topics: {}, questions: [{ id: "q1", q: "?", o: ["a", "b"], a: 0 }] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test("saving marks only the subjects that changed, and a delete leaves a mark", () => {
  let calls = 0; S.onLocalChange(() => calls++);
  S.saveSubjects([subject("a", "A"), subject("b", "B")]);
  let meta = S.loadMeta();
  assert.ok(meta.s.a.dirty && meta.s.b.dirty);
  meta.s.a.dirty = false; meta.s.b.dirty = false; S.saveMeta(meta);
  S.saveSubjects(S.loadSubjects());
  assert.equal(calls, 1, "saving the same list is not a change");
  S.logAnswer("b", "q1", true);
  assert.equal(calls, 2, "an answer is a change");
  S.saveSubjects([{ ...subject("a", "A"), exam: "2027-01-10" }]);
  meta = S.loadMeta();
  assert.ok(meta.s.a.dirty && !meta.s.a.del);
  assert.ok(meta.s.b.dirty && meta.s.b.del);
  assert.deepEqual(S.readProgress("b"), {}, "a deleted subject's answers go with it");
});

test("the counts come from the answer log: answers, a reset, then more answers", async () => {
  S.saveSubjects([subject("c", "C")]);
  S.logAnswer("c", "q1", true); S.logAnswer("c", "q1", false); S.logAnswer("c", "q2", true);
  assert.deepEqual(S.readProgress("c"), { q1: { n: 2, c: 1, l: 0 }, q2: { n: 1, c: 1, l: 1 } });
  await sleep(2);
  S.resetProgress("c");
  assert.deepEqual(S.readProgress("c"), {});
  await sleep(2);
  S.logAnswer("c", "q2", false);
  assert.deepEqual(S.readProgress("c"), { q2: { n: 1, c: 0, l: 0 } });
  assert.deepEqual(S.readLog("c").map((e) => [e.k, !!e.u]), [["r", true], ["a", true]], "the device keeps only what counts");
});

test("progressFrom: bases first, then answers in time order; a reset hides everything before it", () => {
  const log = [
    { id: "2", k: "a", q: "q1", ok: 0, at: 30 },
    { id: "b:x:q1", k: "b", q: "q1", n: 4, c: 3, l: 1, at: 50 },
    { id: "1", k: "a", q: "q1", ok: 1, at: 20 },
  ];
  assert.deepEqual(S.progressFrom(log), { q1: { n: 6, c: 4, l: 0 } });
  assert.deepEqual(S.progressFrom([...log, { id: "r", k: "r", at: 25 }]), { q1: { n: 5, c: 3, l: 0 } });
  assert.deepEqual(S.progressFrom([...log, { id: "r", k: "r", at: 60 }]), {});
});

test("counts saved before the answer log become base entries once, with the same id the database gives them", () => {
  S.saveSubjects([subject("old", "Old")]);
  localStorage.setItem("studyapp-progress:old", JSON.stringify({ q1: { n: 3, c: 2, l: 1 }, q2: { n: 0, c: 0 } }));
  assert.deepEqual(S.readProgress("old"), { q1: { n: 3, c: 2, l: 1 } });
  assert.equal(localStorage.getItem("studyapp-progress:old"), null);
  const [base] = S.readLog("old");
  assert.equal(base.id, "b:old:q1");
  assert.equal(base.u, 1, "and they go to the account");
  S.readLog("old");
  assert.equal(S.readLog("old").length, 1, "read once");
});

test("unsent entries go up as rows, and come back from the account as the same entries", () => {
  S.saveSubjects([subject("d", "D")]);
  S.logAnswer("d", "q1", true);
  const out = S.unsent().filter((x) => x.sid === "d");
  assert.equal(out.length, 1);
  const row = S.toRow("user-1", "d", out[0].e);
  assert.deepEqual({ ...row, id: "x", at: "x" }, { user_id: "user-1", id: "x", subject_id: "d", kind: "answer", at: "x", question_id: "q1", correct: true, n: null, c: null });
  assert.deepEqual(S.fromRow(row), (({ u, ...e }) => e)(out[0].e));
  const base = { id: "b:d:q2", k: "b", q: "q2", n: 2, c: 1, l: 0, at: 5 };
  assert.deepEqual(S.fromRow(S.toRow("u", "d", base)), base);
  const reset = { id: "r1", k: "r", at: 5 };
  assert.deepEqual(S.fromRow(S.toRow("u", "d", reset)), reset);
  S.markSent("d", [out[0].e.id]);
  assert.equal(S.unsent().filter((x) => x.sid === "d").length, 0);
});

test("answers from another device are added to the ones here, never replacing them", () => {
  S.saveSubjects([subject("e", "E")]);
  S.logAnswer("e", "q1", true);
  let calls = 0; S.onLocalChange(() => calls++);
  const other = { id: "other-1", subject_id: "e", question_id: "q1", kind: "answer", correct: false, n: null, c: null, at: new Date().toISOString(), created_at: new Date().toISOString() };
  assert.equal(S.applyRemote({ reviews: [other] }), true);
  assert.deepEqual(S.readProgress("e").q1.n, 2);
  assert.equal(S.applyRemote({ reviews: [other] }), false, "the same row twice is one answer");
  assert.equal(S.readProgress("e").q1.n, 2);
  assert.equal(calls, 0, "what came from the account is not a local change");
  // A deleted subject does not come back through its answers.
  S.saveSubjects(S.loadSubjects().filter((x) => x.id !== "e"));
  assert.equal(S.applyRemote({ reviews: [{ ...other, id: "other-2" }] }), false);
  assert.deepEqual(S.readLog("e"), []);
});

test("what arrives from the account is stored without counting as a local change", () => {
  let calls = 0; S.onLocalChange(() => calls++);
  S.applyRemote({ subjects: [subject("f", "F"), subject("a", "A2")], removed: ["zz"] });
  assert.ok(S.loadSubjects().some((x) => x.name === "A2") && S.loadSubjects().some((x) => x.id === "f"));
  assert.equal(calls, 0);
  assert.equal(S.loadMeta().s.f, undefined);
});

test("another account on this device clears every log", () => {
  S.saveSubjects([subject("g", "G")]);
  S.logAnswer("g", "q1", true);
  S.clearLocal();
  assert.deepEqual(S.loadSubjects(), []);
  assert.ok(![...mem.keys()].some((k) => k.startsWith("studyapp-log:") || k.startsWith("studyapp-progress:")));
});

test("decide: push, pull, both or nothing", () => {
  const d = S.decide;
  assert.equal(d(undefined, undefined), "none");
  assert.equal(d({ at: 5, dirty: true }, undefined), "push");
  assert.equal(d(undefined, { at: 5 }), "pull");
  assert.equal(d({ at: 5, base: 5, dirty: false }, { at: 5 }), "none");
  assert.equal(d({ at: 5, base: 5, dirty: false }, { at: 9 }), "pull");
  assert.equal(d({ at: 7, base: 5, dirty: true }, { at: 5 }), "push");
  assert.equal(d({ at: 7, base: 5, dirty: true }, { at: 9 }), "both");
  assert.equal(d({ at: 5, base: 5, dirty: false }, undefined), "push", "a row the account lost goes up again");
  assert.equal(d({ at: 5, base: 5, dirty: false, del: true }, undefined), "none");
});

test("question ids are random and unique", () => {
  const ids = new Set(Array.from({ length: 2000 }, () => S.questionId()));
  assert.equal(ids.size, 2000);
  assert.match([...ids][0], /^q[0-9a-f]{10}$/);
});
