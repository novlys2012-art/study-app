// Main-page language rewrite animation: clears visible text on #welcome and rewrites it
// from scratch at a tactile pace during an initial time window, then accelerates to finish fast.
export const REWRITE_DEFAULTS = {
  slowWindow: 360, // ms of deliberate from-scratch typing before fast-forward kicks in
  fastSpan: 420,   // ms after slowWindow to accelerate and finish every remaining character
  slowRate: 0.036, // chars/ms (~36 chars/s) during the initial window
  maxDelay: 80,    // ms cap for top-to-bottom cascade across in-viewport elements
};

export function rewriteCount(elapsed, total, opts = {}) {
  if (total <= 0) return 0;
  const slowWindow = opts.slowWindow ?? REWRITE_DEFAULTS.slowWindow;
  const fastSpan = opts.fastSpan ?? REWRITE_DEFAULTS.fastSpan;
  const slowRate = opts.slowRate ?? REWRITE_DEFAULTS.slowRate;
  const start = Math.max(0, Math.min(opts.delay ?? 0, slowWindow));
  if (elapsed <= start) return 0;
  if (elapsed <= slowWindow) return Math.min(total, Math.floor((elapsed - start) * slowRate));
  const dt = elapsed - slowWindow;
  if (fastSpan <= 0 || dt >= fastSpan) return total;
  const c0 = Math.min(total, Math.floor((slowWindow - start) * slowRate));
  const rem = total - c0;
  const u = dt / fastSpan;
  const accel = dt * slowRate + dt * dt * 0.0014;
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
  root.querySelectorAll("[data-i18n], #wSent").forEach((el) => {
    if (el.childElementCount > 0 || el.getClientRects().length === 0) return;
    const target = el.textContent;
    if (!target || !target.trim()) return;
    raw.push({ kind: "text", el, target, rect: el.getBoundingClientRect() });
  });
  root.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    if (el.getClientRects().length === 0 || el.value || !el.placeholder) return;
    raw.push({ kind: "placeholder", el, target: el.placeholder, rect: el.getBoundingClientRect() });
  });
  if (!raw.length) return;

  // Cascade top-to-bottom across what is currently on screen; off-screen blocks run in parallel.
  const maxDelay = opts.maxDelay ?? REWRITE_DEFAULTS.maxDelay;
  const inView = raw.filter((x) => x.rect.bottom > 0 && x.rect.top < vh)
    .sort((a, b) => a.rect.top - b.rect.top || a.rect.left - b.rect.left);
  const delays = new Map();
  inView.forEach((x, idx) => {
    delays.set(x, inView.length > 1 ? (idx / (inView.length - 1)) * maxDelay : 0);
  });

  const items = raw.map((x) => {
    const chars = [...x.target];
    const delay = delays.get(x) || 0;
    if (x.kind === "placeholder") {
      x.el.placeholder = "";
      return { kind: "placeholder", el: x.el, target: x.target, chars, delay, shown: 0, tipLen: 0, done: false };
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
      kind: "text", el: x.el, target: x.target, chars, delay,
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
    const tipLen = elapsed > slowWindow ? 4 : 2;
    let remaining = 0;

    for (const item of items) {
      if (item.done) continue;
      if (item.kind === "text" && !item.el.contains(item.wrap)) {
        item.done = true;
        continue;
      }
      const n = rewriteCount(elapsed, item.chars.length, { ...opts, delay: item.delay });
      if (n >= item.chars.length) {
        restoreItem(item);
        continue;
      }
      remaining++;
      if (n === 0 || (n === item.shown && tipLen === item.tipLen)) continue;
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

    if (remaining > 0) state.raf = requestAnimationFrame(tick);
    else stopRewrite();
  }

  state.raf = requestAnimationFrame(tick);
}
