import test from "node:test";
import assert from "node:assert/strict";
import { DAY_MS, daysTo, memoryStates, questionStats, dueRound, dailyPlan } from "../src/app/plan.js";

const qs = (...ids) => ids.map((id) => ({ id, t: "t1" }));
const T0 = new Date(2026, 4, 10, 12, 0, 0).getTime(); // 2026-05-10 noon local

test("daysTo calculates calendar days from today regardless of time of day", () => {
  assert.equal(daysTo("2026-05-10", T0), 0);
  assert.equal(daysTo("2026-05-11", T0), 1);
  assert.equal(daysTo("2026-05-14", T0), 4);
  assert.equal(daysTo("2026-05-08", T0), -2);
  assert.equal(daysTo("", T0), null);
  assert.equal(daysTo("bad-date", T0), null);
});

test("memoryStates grows intervals on consecutive correct answers and resets on wrong answer", () => {
  const log = [
    { k: "a", q: "q1", ok: 1, at: T0 },
    { k: "a", q: "q1", ok: 1, at: T0 + DAY_MS },
    { k: "a", q: "q1", ok: 1, at: T0 + 4 * DAY_MS },
    { k: "a", q: "q2", ok: 1, at: T0 },
    { k: "a", q: "q2", ok: 0, at: T0 + DAY_MS },
  ];
  const m = memoryStates(log);
  assert.equal(m.get("q1").reps, 3);
  assert.equal(m.get("q1").intervalDays, 7);
  assert.equal(m.get("q1").dueAt, T0 + 11 * DAY_MS);

  assert.equal(m.get("q2").reps, 0);
  assert.equal(m.get("q2").lapses, 1);
  assert.equal(m.get("q2").l, 0);
  assert.equal(m.get("q2").dueAt, T0 + DAY_MS);
});

test("memoryStates honours reset entries and handles legacy base entries", () => {
  const log = [
    { k: "a", q: "q1", ok: 1, at: T0 },
    { k: "r", at: T0 + 1000 },
    { k: "b", q: "q2", n: 3, c: 3, l: 1, at: T0 + 2000 },
    { k: "a", q: "q2", ok: 1, at: T0 + 3000 },
  ];
  const m = memoryStates(log);
  assert.equal(m.has("q1"), false, "answers before reset are ignored");
  assert.equal(m.get("q2").n, 4);
  assert.equal(m.get("q2").l, 1);
  assert.ok(m.get("q2").intervalDays >= 3);
});

test("questionStats and dueRound prioritize wrong, then overdue, then unseen, then upcoming", () => {
  const questions = qs("wrong", "overdueOld", "overdueNew", "fresh", "masteredSoon", "masteredLater");
  const now = T0 + 10 * DAY_MS;
  const log = [
    { k: "a", q: "wrong", ok: 0, at: now - 1000 },
    { k: "a", q: "overdueOld", ok: 1, at: now - 5 * DAY_MS },
    { k: "a", q: "overdueNew", ok: 1, at: now - 2 * DAY_MS },
    { k: "a", q: "masteredSoon", ok: 1, at: now - 1000 }, // due in 1 day
    { k: "a", q: "masteredLater", ok: 1, at: now - 3 * DAY_MS },
    { k: "a", q: "masteredLater", ok: 1, at: now - 1000 }, // due in 3 days
  ];
  const st = questionStats(questions, log, now);
  assert.deepEqual(st, { total: 6, ok: 2, bad: 1, overdue: 2, fresh: 1, due: 4, reviewDue: 3, pct: 33 });

  const order = dueRound(questions, log, { limit: 6, now }).map((x) => x.id);
  assert.deepEqual(order, ["wrong", "overdueOld", "overdueNew", "fresh", "masteredSoon", "masteredLater"]);

  assert.deepEqual(dueRound(questions, log, { limit: 3, now }).map((x) => x.id), ["wrong", "overdueOld", "overdueNew"]);
});

test("dailyPlan spreads unseen questions across days until exam and computes next review when caught up", () => {
  const questions = qs(...Array.from({ length: 12 }, (_, k) => "q" + k));
  const exam = "2026-05-14"; // 4 days after T0

  // 2 wrong/overdue + 10 unseen across 4 days => newToday = ceil(10/4) = 3, target = 5
  const log = [
    { k: "a", q: "q0", ok: 0, at: T0 },
    { k: "a", q: "q1", ok: 1, at: T0 - 2 * DAY_MS }, // overdue by 1 day at T0
  ];
  const p = dailyPlan(questions, log, exam, { roundSize: 20, now: T0 });
  assert.equal(p.hasExam, true);
  assert.equal(p.days, 4);
  assert.equal(p.reviewNow, 2);
  assert.equal(p.newToday, 3);
  assert.equal(p.target, 5);
  assert.equal(p.roundCount, 5);
  assert.equal(p.nextReviewDays, null);

  // All questions answered correctly today -> caught up, next review in 1 day
  const allRight = questions.map((x) => ({ k: "a", q: x.id, ok: 1, at: T0 - 1000 }));
  const done = dailyPlan(questions, allRight, exam, { roundSize: 20, now: T0 });
  assert.equal(done.target, 0);
  assert.equal(done.roundCount, 12, "refresher round still has available questions");
  assert.equal(done.nextReviewDays, 1);

  // Exam today (days === 0) schedules all unseen questions for today
  const sameDay = dailyPlan(questions, [], "2026-05-10", { roundSize: 20, now: T0 });
  assert.equal(sameDay.newToday, 12);
  assert.equal(sameDay.target, 12);

  // Empty subject edge case
  const empty = dailyPlan([], [], exam, { roundSize: 20, now: T0 });
  assert.equal(empty.target, 0);
  assert.equal(empty.roundCount, 0);
  assert.equal(empty.nextReviewDays, null);
});

test("dueRound prioritizes higher-yield exam topics within wrong, overdue, and unseen buckets", () => {
  const items = [
    { id: "lowFresh", t: "t3" },
    { id: "topFresh", t: "t1" },
    { id: "lowWrong", t: "t3" },
    { id: "topWrong", t: "t1" },
    { id: "midOverdue", t: "t2" },
    { id: "topOverdue", t: "t1" },
  ];
  const now = T0 + 5 * DAY_MS;
  const log = [
    { k: "a", q: "lowWrong", ok: 0, at: now - 1000 },
    { k: "a", q: "topWrong", ok: 0, at: now - 1000 },
    { k: "a", q: "midOverdue", ok: 1, at: now - 4 * DAY_MS },
    { k: "a", q: "topOverdue", ok: 1, at: now - 2 * DAY_MS },
  ];
  const order = dueRound(items, log, { limit: 6, now, topicOrder: ["t1", "t2"] }).map((x) => x.id);
  assert.deepEqual(order, ["topWrong", "lowWrong", "topOverdue", "midOverdue", "topFresh", "lowFresh"]);
  // Precomputed memoryStates Map matches raw log output for stats, dueRound, and dailyPlan.
  const states = memoryStates(log);
  assert.deepEqual(questionStats(items, states, now), questionStats(items, log, now));
  assert.deepEqual(dueRound(items, states, { limit: 6, now, topicOrder: ["t1", "t2"] }).map((x) => x.id), order);
  assert.deepEqual(dailyPlan(items, states, "2026-05-20", { roundSize: 6, now }), dailyPlan(items, log, "2026-05-20", { roundSize: 6, now }));
});
