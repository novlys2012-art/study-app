import test from "node:test";
import assert from "node:assert/strict";
import { parseTime, formatTime, loadReminderPrefs, saveReminderPrefs, clearReminderPrefs, buildReminderSchedule, HORIZON_DAYS } from "../src/app/reminders.js";

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

const fakeT = (k, v = {}) => k + (Object.keys(v).length ? ":" + JSON.stringify(v) : "");
const makeSubject = (id, name, exam, qCount = 10, extra = {}) => ({
  id, name, exam,
  topics: { t1: "Téma" },
  questions: Array.from({ length: qCount }, (_, k) => ({ id: `${id}-q${k}`, t: "t1", q: `Q${k}`, o: ["a", "b"], a: 0 })),
  ...extra,
});

test("reminders: time parsing and preference persistence", () => {
  mockStorage();
  assert.deepEqual(parseTime("08:30"), { hour: 8, minute: 30 });
  assert.deepEqual(parseTime("25:99"), { hour: 23, minute: 59 });
  assert.deepEqual(parseTime("bad"), { hour: 18, minute: 0 });
  assert.equal(formatTime(7, 5), "07:05");

  assert.deepEqual(loadReminderPrefs(), { enabled: false, time: "18:00" });
  saveReminderPrefs({ enabled: true, time: "9:15" });
  assert.deepEqual(loadReminderPrefs(), { enabled: true, time: "09:15" });
  clearReminderPrefs();
  assert.deepEqual(loadReminderPrefs(), { enabled: false, time: "18:00" });
});

test("reminders: skips disabled, empty, and sample subjects", () => {
  const now = new Date(2026, 4, 10, 10, 0, 0).getTime();
  const sample = makeSubject("sample", "Ukážka", "2026-05-12", 10, { sample: true });
  const real = makeSubject("bio", "Biochémia", "2026-05-12", 10);
  assert.deepEqual(buildReminderSchedule([real], { enabled: false, time: "18:00" }, { now, t: fakeT }), []);
  assert.deepEqual(buildReminderSchedule([sample], { enabled: true, time: "18:00" }, { now, t: fakeT }), []);
});

test("reminders: prioritises nearest upcoming exam and schedules up to horizon days", () => {
  // 2026-05-10 10:00 local -> 18:00 today is still ahead; exam on 2026-05-12 (in 2 days)
  const now = new Date(2026, 4, 10, 10, 0, 0).getTime();
  const near = makeSubject("bio", "Biochémia", "2026-05-12", 10);
  const far = makeSubject("eko", "Mikroekonómia", "2026-05-25", 10);
  const items = buildReminderSchedule([far, near], { enabled: true, time: "18:00" }, { now, t: fakeT });

  assert.equal(items.length, HORIZON_DAYS);
  assert.equal(items[0].subjectId, "bio");
  assert.match(items[0].title, /^profile\.remExamDaysFewTitle:/);
  assert.equal(items[1].subjectId, "bio");
  assert.match(items[1].title, /^profile\.remExamTomorrowTitle:/);
  assert.equal(items[2].subjectId, "bio");
  assert.match(items[2].title, /^profile\.remExamTodayTitle:/);
  // Once bio's exam passes, Mikroekonómia takes over the daily schedule.
  assert.equal(items[3].subjectId, "eko");
  assert.equal(items[0].id, 1001);
  assert.equal(new Set(items.map((x) => x.id)).size, items.length);
});

test("reminders: skips today if reminder time already passed and falls back to due reviews without an exam", () => {
  const now = new Date(2026, 4, 10, 20, 0, 0).getTime();
  const noExam = makeSubject("pravo", "Občianske právo", "", 5);
  const items = buildReminderSchedule([noExam], { enabled: true, time: "18:00" }, { now, t: fakeT });
  assert.equal(items.length, HORIZON_DAYS - 1);
  assert.ok(items[0].atMs > now);
  assert.match(items[0].title, /^profile\.remReviewTitle:/);
});

test("reminders: skips days when all questions are already mastered and no exam is today", () => {
  const now = new Date(2026, 4, 10, 10, 0, 0).getTime();
  const sj = makeSubject("bio", "Biochémia", "", 2);
  // Both questions answered right just now -> interval is 1 day, so day 0 has target 0, day 1 is due again.
  const log = [
    { id: "a1", k: "a", q: "bio-q0", ok: 1, at: now - 1000 },
    { id: "a2", k: "a", q: "bio-q1", ok: 1, at: now - 1000 },
  ];
  const items = buildReminderSchedule([sj], { enabled: true, time: "18:00" }, { now, readLog: () => log, t: fakeT });
  const day0 = new Date(2026, 4, 10, 18, 0, 0).getTime();
  assert.ok(items.length > 0);
  assert.ok(items[0].atMs > day0, "skips today when all questions are mastered until tomorrow");
});
