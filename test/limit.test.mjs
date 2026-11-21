import test from "node:test";
import assert from "node:assert/strict";
import { limitInfo } from "../src/app/limit.js";

test("limitInfo calculates percentage, formatted amounts, and ok/warn/full states", () => {
  assert.equal(limitInfo(null), null);
  assert.deepEqual(limitInfo({ monthUsd: 0, limitUsd: 1 }), {
    pct: 0, state: "ok", spent: "$0.00", limit: "$1.00", remaining: "$1.00",
  });
  assert.deepEqual(limitInfo({ monthUsd: 0.424, limitUsd: 1 }), {
    pct: 42, state: "ok", spent: "$0.42", limit: "$1.00", remaining: "$0.58",
  });
  assert.deepEqual(limitInfo({ monthUsd: 0.85, limitUsd: 1 }), {
    pct: 85, state: "warn", spent: "$0.85", limit: "$1.00", remaining: "$0.15",
  });
  assert.deepEqual(limitInfo({ monthUsd: 1.25, limitUsd: 1 }), {
    pct: 100, state: "full", spent: "$1.25", limit: "$1.00", remaining: "$0.00",
  });
  assert.deepEqual(limitInfo({ monthUsd: 0.2, limitUsd: 0 }), {
    pct: 0, state: "ok", spent: "$0.20", limit: "$0.00", remaining: "$0.00",
  });
});
