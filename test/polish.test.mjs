import test from "node:test";
import assert from "node:assert/strict";
import { saveSubjects, loadSubjects, createSubject, logAnswer, markSent, saveMeta, clearLocal, hasUnsynced, subjectFileCounts, unsent } from "../src/app/subjects.js";

function mockStorage() {
  const map = new Map();
  globalThis.localStorage = {
    get length() { return map.size; },
    key: (i) => [...map.keys()][i] ?? null,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(String(k), String(v)),
    removeItem: (k) => map.delete(k),
    clear: () => map.clear(),
  };
}

test("subjectFileCounts separates summaries from reference context files", () => {
  assert.deepEqual(subjectFileCounts([
    { name: "l1.pdf", summary: "## Intro\n- bod" },
    { name: "vzorce.pdf", context: true, text: "E = mc^2" },
    { name: "empty.pdf", context: true, text: "" },
    { name: "q-only.pdf" },
  ]), { summaries: 1, context: 1 });
  assert.deepEqual(subjectFileCounts([]), { summaries: 0, context: 0 });
});

test("hasUnsynced detects pending answers and dirty subjects", () => {
  mockStorage();
  clearLocal();
  assert.equal(hasUnsynced(), false);

  const sj = { id: "s1", name: "Bio", topics: {}, questions: [{ id: "q1", t: "t1", q: "?", o: ["a", "b"], a: 0 }] };
  saveSubjects([sj]);
  assert.equal(hasUnsynced(), true);

  // Mark subject synced; now only a new local answer should trigger hasUnsynced.
  saveMeta({ user: "u1", s: { s1: { at: 1, base: 1, dirty: false, del: false } }, rc: null });
  assert.equal(hasUnsynced(), false);

  logAnswer(sj, "q1", true);
  assert.equal(hasUnsynced(), true);

  markSent("s1", unsent().map((x) => x.e.id));
  assert.equal(hasUnsynced(), false);
});

test("createSubject creates valid empty subjects that persist and mark dirty for sync", () => {
  mockStorage();
  clearLocal();

  assert.throws(() => createSubject("   "));
  const a = createSubject("  Štatistika  ");
  const b = createSubject("---");
  assert.notEqual(a.id, b.id);
  assert.match(a.id, /^u[0-9a-z]+$/);
  assert.equal(a.name, "Štatistika");
  assert.equal(a.code, "ŠTA");
  assert.equal(b.code, "NEW");
  assert.deepEqual(a.topics, {});
  assert.deepEqual(a.topicInfo, {});
  assert.deepEqual(a.files, []);
  assert.deepEqual(a.questions, []);
  assert.equal(a.checkedOut, 0);

  saveSubjects([a]);
  const [loaded] = loadSubjects();
  assert.equal(loaded.id, a.id);
  assert.equal(loaded.name, "Štatistika");
  assert.deepEqual(loaded.questions, []);
  assert.equal(hasUnsynced(), true);
});
