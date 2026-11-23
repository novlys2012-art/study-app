import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildSampleSubject, ensureSampleSubject, SAMPLE_ID } from "../src/app/sample.js";
import { loadSubjects, saveSubjects, loadMeta, saveMeta, clearLocal, removeSamples, logAnswer, resetProgress, readProgress, readLog, unsent, hasUnsynced, onLocalChange } from "../src/app/subjects.js";
import { authMessage, readPendingAuth, writePendingAuth, clearPendingAuth, extractOtpDigits, PENDING_TTL_MS } from "../src/app/auth-state.js";
import { rankExams } from "../src/app/exams.js";
import { sourceFileIndex, matchSummaryBlock, summaryBlocks, stripSourceMeta } from "../src/app/md.js";

function memoryStorage() {
  const m = new Map();
  return {
    get length() { return m.size; },
    key: (k) => [...m.keys()][k] ?? null,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    clear: () => m.clear(),
  };
}

globalThis.localStorage = memoryStorage();

test("sample subject has valid SK and CS content, 8 questions, summary matches, and 3 ranked exam topics with 4 of 5", () => {
  for (const lang of ["sk", "cs"]) {
    const sj = buildSampleSubject(lang);
    assert.equal(sj.id, SAMPLE_ID);
    assert.equal(sj.sample, true);
    assert.equal(sj.questions.length, 8);
    assert.equal(sj.files.length, 1);
    assert.ok(sj.files[0].keyTerms.length > 0 && sj.files[0].keyTerms.every((k) => k.term && k.meaning), "sample keyTerms have term and meaning");
    const blocks = summaryBlocks(sj.files[0].summary);
    for (const q of sj.questions) {
      assert.ok(q.id && q.t && q.q && Array.isArray(q.o) && q.o.length === 4 && q.s);
      assert.equal(sourceFileIndex(q, sj.files), 0, `source matches file for ${q.id}`);
      const hit = matchSummaryBlock(blocks, { quote: stripSourceMeta(q.s), extras: [q.e, q.q] });
      assert.ok(hit, `summary excerpt matches for ${q.id}`);
    }
    const ranked = rankExams(sj.exams, sj.topics);
    assert.equal(ranked.length, 3);
    assert.equal(ranked[0].exams, 4);
    assert.equal(ranked[0].of, 5);
  }
});

test("sample subject stays local-only: never marks sync metadata, never appears in unsent/hasUnsynced, and deletes cleanly", () => {
  localStorage.clear();
  let changeEvents = 0;
  onLocalChange(() => { changeEvents++; });

  const id = ensureSampleSubject("sk");
  assert.equal(id, SAMPLE_ID);
  assert.equal(loadSubjects().length, 1);
  assert.deepEqual(loadMeta().s, {});
  assert.equal(hasUnsynced(), false);
  assert.equal(changeEvents, 0);

  const sj = loadSubjects()[0];
  logAnswer(sj, sj.questions[0].id, true);
  assert.equal(readProgress(sj)[sj.questions[0].id].c, 1);
  assert.equal(unsent().length, 0);
  assert.equal(hasUnsynced(), false);
  assert.equal(changeEvents, 0);

  resetProgress(sj);
  assert.deepEqual(readProgress(sj), {});
  assert.equal(unsent().length, 0);
  assert.equal(hasUnsynced(), false);

  saveSubjects([]);
  assert.equal(loadSubjects().length, 0);
  assert.deepEqual(loadMeta().s, {});
  assert.equal(hasUnsynced(), false);
  assert.equal(changeEvents, 0);

  onLocalChange(null);
  clearLocal();
});

test("removeSamples drops preview subjects and their logs without touching real subjects or sync marks", () => {
  localStorage.clear();
  const real = { id: "real-1", name: "Mikro", topics: {}, questions: [{ id: "q1", t: "t1", q: "?", o: ["a", "b"], a: 0 }] };
  saveSubjects([real]);
  logAnswer(real, "q1", true);

  ensureSampleSubject("sk");
  const sample = loadSubjects().find((sj) => sj.id === SAMPLE_ID);
  logAnswer(sample, sample.questions[0].id, true);
  saveMeta({ user: "u1", s: { "real-1": { at: 1, base: 1, dirty: false, del: false }, [SAMPLE_ID]: { at: 1, dirty: true } }, rc: null });

  let changeEvents = 0;
  onLocalChange(() => { changeEvents++; });

  assert.equal(removeSamples(), true);
  assert.equal(removeSamples(), false);
  assert.deepEqual(loadSubjects().map((sj) => sj.id), ["real-1"]);
  assert.deepEqual(readLog(SAMPLE_ID), []);
  assert.equal(readProgress(real).q1.c, 1);
  assert.equal(loadMeta().s[SAMPLE_ID], undefined);
  assert.equal(loadMeta().s["real-1"].dirty, false);
  assert.equal(changeEvents, 0);

  onLocalChange(null);
  clearLocal();
});

test("authMessage maps errors to dedicated auth.err.* keys and never leaks raw fetch or server text", async () => {
  const sk = JSON.parse(await readFile(new URL("../src/i18n/sk.json", import.meta.url), "utf8"));
  const tr = (k) => sk[k] ?? k;

  assert.equal(authMessage({ code: "code", message: "Invalid token" }, tr), sk["auth.err.wrongCode"]);
  assert.equal(authMessage({ code: "expired", message: "Token has expired" }, tr), sk["auth.err.expiredCode"]);
  assert.equal(authMessage({ code: "rate", message: "429" }, tr), sk["auth.err.rate"]);
  assert.equal(authMessage({ code: "wait", message: "wait 60 seconds" }, tr), sk["auth.err.wait"]);
  assert.equal(authMessage({ code: "network", message: "Failed to fetch" }, tr), sk["auth.err.network"]);
  assert.equal(authMessage(new TypeError("Failed to fetch"), tr), sk["auth.err.network"]);
  assert.equal(authMessage(new Error("raw postgres detail"), tr), sk["auth.err.unknown"]);
  assert.ok(!authMessage(new TypeError("Failed to fetch"), tr).includes("Failed to fetch"));
  assert.ok(!authMessage(new Error("raw postgres detail"), tr).includes("postgres"));
});

test("pending auth stores email + timestamp only, expires after 15 minutes, and clears cleanly", () => {
  const store = memoryStorage();
  const t0 = 1_700_000_000_000;
  writePendingAuth("student@uniba.sk", t0, store);
  const raw = JSON.parse(store.getItem("lekto-pending-auth"));
  assert.deepEqual(Object.keys(raw).sort(), ["at", "email"]);
  assert.equal(readPendingAuth(t0 + 60_000, store).email, "student@uniba.sk");
  assert.equal(readPendingAuth(t0 + PENDING_TTL_MS + 1, store), null);
  assert.equal(store.getItem("lekto-pending-auth"), null);

  writePendingAuth("student@uniba.sk", t0, store);
  clearPendingAuth(store);
  assert.equal(readPendingAuth(t0, store), null);
});

test("extractOtpDigits handles pasted spaced codes and fonts.css ships Source Sans 3 + JetBrains Mono", async () => {
  assert.equal(extractOtpDigits("1234 5678"), "12345678");
  assert.equal(extractOtpDigits(" 12-34-56-78\n"), "12345678");
  const css = await readFile(new URL("../public/fonts/fonts.css", import.meta.url), "utf8");
  assert.ok(css.includes("Source Sans 3") && css.includes("400 700"), "fonts.css declares variable Source Sans 3");
  assert.ok(css.includes("JetBrains Mono"), "fonts.css declares JetBrains Mono");
});

test("public static legal pages exist for SK and CS and stay synced with i18n text", async () => {
  const sk = JSON.parse(await readFile(new URL("../src/i18n/sk.json", import.meta.url), "utf8"));
  const cs = JSON.parse(await readFile(new URL("../src/i18n/cs.json", import.meta.url), "utf8"));
  const checks = [
    ["../public/terms.html", sk["legal.termsTitle"], sk["legal.termsBody1"], sk["legal.termsBody2"]],
    ["../public/privacy.html", sk["legal.privacyTitle"], sk["legal.privacyBody1"], sk["legal.privacyBody2"]],
    ["../public/cs/terms.html", cs["legal.termsTitle"], cs["legal.termsBody1"], cs["legal.termsBody2"]],
    ["../public/cs/privacy.html", cs["legal.privacyTitle"], cs["legal.privacyBody1"], cs["legal.privacyBody2"]],
  ];
  for (const [file, title, b1, b2] of checks) {
    const html = await readFile(new URL(file, import.meta.url), "utf8");
    assert.ok(html.includes(title), `${file} includes title`);
    assert.ok(html.includes(b1), `${file} includes body1`);
    assert.ok(html.includes(b2), `${file} includes body2`);
  }
});
