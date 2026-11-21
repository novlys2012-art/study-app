import test from "node:test";
import assert from "node:assert/strict";
import { rewriteCount, REWRITE_DEFAULTS } from "../src/app/rewrite.js";

test("rewriteCount stays at 0 at t<=0 and for empty streams", () => {
  assert.equal(rewriteCount(500, 0), 0);
  assert.equal(rewriteCount(0, 400), 0);
  assert.equal(rewriteCount(-10, 400), 0);
});

test("rewriteCount paces line-by-line during slowWindow, accelerates after, and finishes on time", () => {
  const { slowWindow, fastSpan } = REWRITE_DEFAULTS;
  const total = 1000;

  const midSlow = rewriteCount(slowWindow / 2, total);
  const endSlow = rewriteCount(slowWindow, total);
  const midFast = rewriteCount(slowWindow + fastSpan / 2, total);
  const endAll = rewriteCount(slowWindow + fastSpan, total);

  assert.ok(midSlow > 0 && midSlow < endSlow, "advances steadily during the initial window");
  assert.ok(endSlow < total / 4, "keeps the initial window deliberate on a full viewport");
  assert.ok((midFast - endSlow) > endSlow * 2, "accelerates sharply after slowWindow");
  assert.equal(endAll, total, "completes at slowWindow + fastSpan");
  assert.equal(rewriteCount(slowWindow + fastSpan + 500, total), total);
});

test("rewriteCount is monotonic across every millisecond for short and long streams", () => {
  const { slowWindow, fastSpan } = REWRITE_DEFAULTS;
  for (const total of [1, 12, 80, 450, 1200]) {
    let prev = 0;
    for (let t = 0; t <= slowWindow + fastSpan + 20; t += 10) {
      const cur = rewriteCount(t, total);
      assert.ok(cur >= prev && cur <= total, `non-monotonic at total=${total} t=${t}: ${prev} -> ${cur}`);
      prev = cur;
    }
    assert.equal(prev, total);
  }
});
