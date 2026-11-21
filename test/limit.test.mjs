import test from "node:test";
import assert from "node:assert/strict";
import { limitInfo, nextResetDate } from "../src/app/limit.js";

test("limitInfo calculates credit counts, percentage, and ok/warn/full states", () => {
  assert.equal(limitInfo(null), null);
  assert.deepEqual(limitInfo({ monthUsd: 0, limitUsd: 1 }), {
    pct: 0, state: "ok", used: 0, limit: 100, remaining: 100,
  });
  assert.deepEqual(limitInfo({ monthUsd: 0.002, limitUsd: 1 }), {
    pct: 1, state: "ok", used: 1, limit: 100, remaining: 99,
  });
  assert.deepEqual(limitInfo({ monthUsd: 0.424, limitUsd: 1 }), {
    pct: 42, state: "ok", used: 42, limit: 100, remaining: 58,
  });
  assert.deepEqual(limitInfo({ monthUsd: 0.85, limitUsd: 1 }), {
    pct: 85, state: "warn", used: 85, limit: 100, remaining: 15,
  });
  assert.deepEqual(limitInfo({ monthUsd: 1.25, limitUsd: 1 }), {
    pct: 100, state: "full", used: 100, limit: 100, remaining: 0,
  });
  assert.deepEqual(limitInfo({ monthUsd: 0.2, limitUsd: 0 }), {
    pct: 0, state: "ok", used: 0, limit: 0, remaining: 0,
  });
});

test("nextResetDate returns the 1st of the next UTC month", () => {
  assert.equal(nextResetDate(new Date("2026-11-21T17:39:41Z")), "1. 12. 2026");
  assert.equal(nextResetDate(new Date("2026-12-15T12:00:00Z")), "1. 1. 2027");
  assert.equal(nextResetDate(new Date("2027-01-31T23:59:59Z")), "1. 2. 2027");
  assert.equal(nextResetDate(new Date("2026-12-01T00:00:00Z")), "1. 1. 2027");
});
