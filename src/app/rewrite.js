// Main-page language rewrite animation: clears visible text on #welcome and rewrites it
// sequentially line by line from scratch during an initial window, then accelerates to finish fast.
export const REWRITE_DEFAULTS = {
  slowWindow: 460,   // ms of deliberate line-by-line typing before fast-forward kicks in
  fastSpan: 520,     // ms after slowWindow to accelerate through every remaining line
  slowRate: 0.13,    // chars/ms (~130 chars/s) across the sequential stream during slowWindow
  fastAccel: 0.0022, // quadratic speed-up term (chars/ms^2) after slowWindow
};

export function rewriteCount(elapsed, total, opts = {}) {
  if (total <= 0 || elapsed <= 0) return 0;
  const slowWindow = opts.slowWindow ?? REWRITE_DEFAULTS.slowWindow;
  const fastSpan = opts.fastSpan ?? REWRITE_DEFAULTS.fastSpan;
  const slowRate = opts.slowRate ?? REWRITE_DEFAULTS.slowRate;
  const fastAccel = opts.fastAccel ?? REWRITE_DEFAULTS.fastAccel;
  if (elapsed <= slowWindow) return Math.min(total, Math.floor(elapsed * slowRate));
  const dt = elapsed - slowWindow;
  if (fastSpan <= 0 || dt >= fastSpan) return total;
  const c0 = Math.min(total, Math.floor(slowWindow * slowRate));
  const rem = total - c0;
  const u = dt / fastSpan;
  const accel = dt * slowRate + dt * dt * fastAccel;
  return Math.min(total, Math.floor(c0 + Math.max(accel, rem * u * u)));
}

let active = null;

function restoreItem(item) {
  if (item.done) return;
  item.done = true;
  if (item.kind === "placeholder") {
    if (item.el.placeholder !== item.target) item.el.placeholder = item.target;
  } else if (item.el.contains(item.wrap)) {
    item.el.textContent = item.target;
  }
}

export function stopRewrite() {
  if (!active) return;
  cancelAnimationFrame(active.raf);
  active.items.forEach(restoreItem);
  active = null;
}

function makeSpan(cls, text = "") {
  const s = document.createElement("span");
  s.className = cls;
  const node = document.createTextNode(text);
  s.appendChild(node);
  return [s, node];
}

export function startRewrite(root, opts = {}) {
  stopRewrite();
  if (!root || root.hidden) return;
  if (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const vh = window.innerHeight || 800;
  const raw = [];
  root.querySelectorAll("[data-i18n]").forEach((el) => {
    if (el.childElementCount > 0 || el.getClientRects().length === 0) return;
    const target = el.textContent;
    if (!target || !target.trim()) return;
    const rect = el.getBoundingClientRect();
    if (rect.bottom <= 0 || rect.top >= vh) return;
    raw.push({ kind: "text", el, target });
  });
  root.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    if (el.getClientRects().length === 0 || el.value || !el.placeholder) return;
    const rect = el.getBoundingClientRect();
    if (rect.bottom <= 0 || rect.top >= vh) return;
    raw.push({ kind: "placeholder", el, target: el.placeholder });
  });
  if (!raw.length) return;

  let totalChars = 0;
  const items = raw.map((x) => {
    const chars = [...x.target];
    const start = totalChars;
    totalChars += chars.length;
    const end = totalChars;
    if (x.kind === "placeholder") {
      x.el.placeholder = "";
      return { kind: "placeholder", el: x.el, target: x.target, chars, start, end, shown: 0, tipLen: 0, done: false };
    }
    const wrap = document.createElement("span");
    wrap.className = "rw-wrap";
    const [doneEl, doneNode] = makeSpan("rw-done");
    const [tipEl, tipNode] = makeSpan("rw-tip");
    const [headEl, headNode] = makeSpan("rw-head");
    const [restEl, restNode] = makeSpan("rw-rest", x.target);
    restEl.setAttribute("aria-hidden", "true");
    wrap.append(doneEl, tipEl, headEl, restEl);
    x.el.replaceChildren(wrap);
    return {
      kind: "text", el: x.el, target: x.target, chars, start, end,
      wrap, doneNode, tipNode, headNode, restNode,
      shown: 0, tipLen: 0, done: false,
    };
  });

  const slowWindow = opts.slowWindow ?? REWRITE_DEFAULTS.slowWindow;
  const state = { root, items, raf: 0 };
  active = state;
  let t0 = -1;

  function tick(now) {
    if (active !== state) return;
    if (root.hidden) { stopRewrite(); return; }
    if (t0 < 0) t0 = now;
    const elapsed = Math.max(0, now - t0);
    const cursor = rewriteCount(elapsed, totalChars, opts);
    const tipLen = elapsed > slowWindow ? 6 : 3;

    for (const item of items) {
      if (item.done) continue;
      if (item.kind === "text" && !item.el.contains(item.wrap)) {
        item.done = true;
        continue;
      }
      if (cursor <= item.start) break; // strictly line by line: later blocks wait their turn
      if (cursor >= item.end) {
        restoreItem(item);
        continue;
      }
      const n = cursor - item.start;
      if (n === item.shown && tipLen === item.tipLen) continue;
      item.shown = n;
      item.tipLen = tipLen;
      if (item.kind === "placeholder") {
        item.el.placeholder = item.chars.slice(0, n).join("");
      } else {
        const tipStart = Math.max(0, n - 1 - tipLen);
        item.doneNode.nodeValue = item.chars.slice(0, tipStart).join("");
        item.tipNode.nodeValue = item.chars.slice(tipStart, n - 1).join("");
        item.headNode.nodeValue = item.chars[n - 1];
        item.restNode.nodeValue = item.chars.slice(n).join("");
      }
    }

    if (cursor < totalChars) state.raf = requestAnimationFrame(tick);
    else stopRewrite();
  }

  state.raf = requestAnimationFrame(tick);
}
