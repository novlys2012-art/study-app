import test from "node:test";
import assert from "node:assert/strict";
import { rewriteCount, REWRITE_DEFAULTS } from "../src/app/rewrite.js";

test("rewriteCount stays at 0 before delay and for empty strings", () => {
  assert.equal(rewriteCount(500, 0), 0);
  assert.equal(rewriteCount(0, 40), 0);
  assert.equal(rewriteCount(50, 40, { delay: 60 }), 0);
  assert.equal(rewriteCount(60, 40, { delay: 60 }), 0);
});

test("rewriteCount writes slowly during slowWindow, accelerates after, and finishes on time", () => {
  const { slowWindow, fastSpan } = REWRITE_DEFAULTS;
  const len = 140;

  const midSlow = rewriteCount(slowWindow / 2, len);
  const endSlow = rewriteCount(slowWindow, len);
  const midFast = rewriteCount(slowWindow + fastSpan / 2, len);
  const endAll = rewriteCount(slowWindow + fastSpan, len);

  assert.ok(midSlow > 0 && midSlow < endSlow, "advances steadily during the initial window");
  assert.ok(endSlow < len / 4, "keeps the initial window deliberate on long text");
  assert.ok((midFast - endSlow) > endSlow * 2, "accelerates sharply after slowWindow");
  assert.equal(endAll, len, "completes at slowWindow + fastSpan");
  assert.equal(rewriteCount(slowWindow + fastSpan + 500, len), len);
});

test("rewriteCount is monotonic across every millisecond for short and long strings", () => {
  const { slowWindow, fastSpan } = REWRITE_DEFAULTS;
  for (const len of [1, 6, 30, 140, 320]) {
    for (const delay of [0, 40, 80]) {
      let prev = 0;
      for (let t = 0; t <= slowWindow + fastSpan + 20; t += 10) {
        const cur = rewriteCount(t, len, { delay });
        assert.ok(cur >= prev && cur <= len, `non-monotonic at len=${len} delay=${delay} t=${t}: ${prev} -> ${cur}`);
        prev = cur;
      }
      assert.equal(prev, len);
    }
  }
});
