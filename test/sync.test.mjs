import test from "node:test";
import assert from "node:assert/strict";

// A localStorage for Node, so the device store runs as it does in the browser.
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k),
};
const S = await import("../src/app/subjects.js");
const subject = (id, name) => ({ id, name, topics: {}, questions: [{ id: "q1", q: "?", o: ["a", "b"], a: 0 }] });

test("saving marks only the subjects that changed, and a delete leaves a mark", () => {
  let calls = 0; S.onLocalChange(() => calls++);
  S.saveSubjects([subject("a", "A"), subject("b", "B")]);
  let meta = S.loadMeta();
  assert.ok(meta.s.a.dirty && meta.s.b.dirty);
  meta.s.a.dirty = false; meta.s.b.dirty = false; S.saveMeta(meta);
  S.saveSubjects(S.loadSubjects());
  assert.equal(calls, 1, "saving the same list is not a change");
  S.writeProgress("b", { q1: { n: 1, c: 1, l: 1 } });
  S.saveSubjects([{ ...subject("a", "A"), exam: "2027-01-10" }]);
  meta = S.loadMeta();
  assert.ok(meta.s.a.dirty && !meta.s.a.del);
  assert.ok(meta.s.b.dirty && meta.s.b.del);
  assert.equal(meta.p.b, undefined);
  assert.deepEqual(S.readProgress("b"), {}, "a deleted subject's progress goes with it");
});

test("what arrives from the account is stored without counting as a local change", () => {
  let calls = 0; S.onLocalChange(() => calls++);
  S.applyRemote({ subjects: [subject("c", "C"), subject("a", "A2")], removed: ["zz"], progress: { c: { q1: { n: 2, c: 1, l: 0 } } } });
  assert.deepEqual(S.loadSubjects().map((x) => x.name), ["A2", "C"]);
  assert.equal(S.readProgress("c").q1.n, 2);
  assert.equal(calls, 0);
  assert.equal(S.loadMeta().s.c, undefined);
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

test("mergeProgress keeps, per question, the record with more answers", () => {
  const a = { q1: { n: 3, c: 2, l: 1 }, q2: { n: 1, c: 0, l: 0 } };
  const b = { q1: { n: 2, c: 2, l: 1 }, q2: { n: 2, c: 1, l: 1 }, q3: { n: 1, c: 1, l: 1 } };
  assert.deepEqual(S.mergeProgress(a, b), { q1: a.q1, q2: b.q2, q3: b.q3 });
  assert.deepEqual(S.mergeProgress(a, null), a);
});
