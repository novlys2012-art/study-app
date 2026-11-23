// Shared helpers for practice problems (kind: "problem") and optional numeric answer checks.

export const isProblem = (x) => Boolean(x && x.kind === "problem");

export function correctAnswers(x) {
  if (!x) return [];
  if (isProblem(x)) return x.ans ? [String(x.ans)] : [];
  const a = Array.isArray(x.a) ? x.a : [x.a];
  return a.map((k) => x.o?.[k]).filter((v) => typeof v === "string" && v.length > 0);
}

// Parses student numeric input: decimal comma or dot, spaces, Unicode minus, simple fractions (e.g. -3/4),
// scientific notation, and optional trailing unit or %. Returns null when not a clean number.
export function parseNumericInput(raw, unit = "") {
  if (typeof raw !== "string") return null;
  let s = raw.trim().replace(/[−–—]/g, "-");
  if (!s) return null;

  const isPctUnit = String(unit || "").trim() === "%";
  let scalePct = false;
  if (s.endsWith("%")) {
    s = s.slice(0, -1).trim();
    if (!isPctUnit) scalePct = true;
  } else if (unit && String(unit).trim()) {
    const u = String(unit).trim();
    if (s.toLowerCase().endsWith(u.toLowerCase())) s = s.slice(0, -u.length).trim();
  }

  // Strip a short trailing unit (e.g. "€", "eur", "m/s^2") when separated by space after a number.
  s = s.replace(/\s+(?![eE][+-]?\d)[^\d.,+\-/\s].*$/, "").trim();
  // Remove thousands/grouping spaces between digits (e.g. "1 250,5").
  s = s.replace(/(\d)[\s\u00a0]+(?=\d)/g, "$1").replace(/,/g, ".");
  if (!s) return null;

  const frac = s.match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*\/\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))$/);
  let val;
  if (frac) {
    const num = Number(frac[1]), den = Number(frac[2]);
    if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) return null;
    val = num / den;
  } else {
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(s)) return null;
    val = Number(s);
  }
  if (!Number.isFinite(val)) return null;
  return scalePct ? val / 100 : val;
}

// Returns true/false when both student input and check.num are valid numbers, otherwise null.
export function checkNumericAnswer(raw, check) {
  if (!check || typeof check.num !== "number" || !Number.isFinite(check.num)) return null;
  const val = parseNumericInput(raw, check.unit || "");
  if (val == null) return null;
  const tol = typeof check.tol === "number" && Number.isFinite(check.tol) && check.tol >= 0
    ? check.tol
    : Math.max(1e-6, Math.abs(check.num) * 0.01);
  return Math.abs(val - check.num) <= tol + 1e-9;
}
