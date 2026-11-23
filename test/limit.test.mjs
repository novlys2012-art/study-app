import test from "node:test";
import assert from "node:assert/strict";
import {
  limitInfo, nextResetDate, FREE_CREDITS, PLUS_CREDITS, FREE_LIMIT_USD, PLUS_LIMIT_USD, PRICING,
  getCachedUsage, setCachedUsage, isPlusActive,
} from "../src/app/limit.js";

test("limitInfo calculates credit counts, plan tier, percentage, and ok/warn/full states", () => {
  assert.equal(FREE_CREDITS, 15);
  assert.equal(PLUS_CREDITS, 150);
  assert.equal(FREE_LIMIT_USD, 0.15);
  assert.equal(PLUS_LIMIT_USD, 1.5);
  assert.equal(PRICING.sk.monthly, "5,99 €");
  assert.equal(PRICING.sk.annual, "34,99 €");
  assert.equal(PRICING.cs.monthly, "149 Kč");
  assert.equal(PRICING.cs.annual, "890 Kč");

  assert.equal(limitInfo(null), null);
  assert.deepEqual(limitInfo({ monthUsd: 0, limitUsd: 0.15 }), {
    plan: "free", pct: 0, state: "ok", used: 0, limit: 15, remaining: 15,
  });
  assert.deepEqual(limitInfo({ plan: "plus", monthUsd: 0.45, limitUsd: 1.5 }), {
    plan: "plus", pct: 30, state: "ok", used: 45, limit: 150, remaining: 105,
  });
  assert.deepEqual(limitInfo({ monthUsd: 0.002, limitUsd: 1 }), {
    plan: "free", pct: 1, state: "ok", used: 1, limit: 100, remaining: 99,
  });
  assert.deepEqual(limitInfo({ monthUsd: 0.424, limitUsd: 1 }), {
    plan: "free", pct: 42, state: "ok", used: 42, limit: 100, remaining: 58,
  });
  assert.deepEqual(limitInfo({ monthUsd: 0.85, limitUsd: 1 }), {
    plan: "free", pct: 85, state: "warn", used: 85, limit: 100, remaining: 15,
  });
  assert.deepEqual(limitInfo({ monthUsd: 1.25, limitUsd: 1 }), {
    plan: "free", pct: 100, state: "full", used: 100, limit: 100, remaining: 0,
  });
  assert.deepEqual(limitInfo({ monthUsd: 0.2, limitUsd: 0 }), {
    plan: "free", pct: 0, state: "ok", used: 0, limit: 0, remaining: 0,
  });

  setCachedUsage({ plan: "free", monthUsd: 0.05, limitUsd: 0.15 });
  assert.equal(isPlusActive(), false);
  setCachedUsage({ plan: "plus", monthUsd: 0.2, limitUsd: 1.5 });
  assert.equal(isPlusActive(), true);
  assert.equal(getCachedUsage().plan, "plus");
  setCachedUsage(null);
  assert.equal(isPlusActive(), false);
});

test("nextResetDate returns the 1st of the next UTC month", () => {
  assert.equal(nextResetDate(new Date("2026-11-21T17:39:41Z")), "1. 12. 2026");
  assert.equal(nextResetDate(new Date("2026-12-15T12:00:00Z")), "1. 1. 2027");
  assert.equal(nextResetDate(new Date("2027-01-31T23:59:59Z")), "1. 2. 2027");
  assert.equal(nextResetDate(new Date("2026-12-01T00:00:00Z")), "1. 1. 2027");
});
