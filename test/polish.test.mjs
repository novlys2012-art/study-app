import test from "node:test";
import assert from "node:assert/strict";
import { saveSubjects, logAnswer, markSent, saveMeta, clearLocal, hasUnsynced, subjectFileCounts, unsent } from "../src/app/subjects.js";

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
