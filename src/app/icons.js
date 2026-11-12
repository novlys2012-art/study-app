// Icons for parts built in code. The static ones are written out in index.html.
const NS = "http://www.w3.org/2000/svg";
const PATHS = {
  chev: "M9 5l7 7-7 7",
  down: "M5 9l7 7 7-7",
  plus: "M12 5v14M5 12h14",
  cal: "M6 5h12a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3zM3 10h18M8 3v4M16 3v4",
  doc: "M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h4",
  check: "M5 12.5l4.5 4.5L19 7",
  x: "M6 6l12 12M18 6L6 18",
  up: "M12 16V4M7 9l5-5 5 5M5 20h14",
};
const FILLED = { play: "M8 5.2v13.6a1 1 0 0 0 1.5.86l11-6.8a1 1 0 0 0 0-1.72l-11-6.8A1 1 0 0 0 8 5.2z" };

export function icon(name, cls) {
  const s = document.createElementNS(NS, "svg");
  s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("aria-hidden", "true");
  s.setAttribute("class", "ic" + (cls ? " " + cls : ""));
  const p = document.createElementNS(NS, "path");
  if (FILLED[name]) { s.setAttribute("fill", "currentColor"); p.setAttribute("d", FILLED[name]); }
  else {
    s.setAttribute("fill", "none"); s.setAttribute("stroke", "currentColor"); s.setAttribute("stroke-width", "2.2");
    s.setAttribute("stroke-linecap", "round"); s.setAttribute("stroke-linejoin", "round");
    p.setAttribute("d", PATHS[name]);
  }
  s.appendChild(p);
  return s;
}

// A progress ring with the percentage inside. It draws itself from zero when it appears.
export function ring(pct, label, cls) {
  const R = 22, LEN = 2 * Math.PI * R;
  const s = document.createElementNS(NS, "svg");
  s.setAttribute("viewBox", "0 0 56 56"); s.setAttribute("class", "ring" + (cls ? " " + cls : "")); s.setAttribute("role", "img");
  s.setAttribute("aria-label", label);
  const circle = (c) => { const e = document.createElementNS(NS, "circle"); e.setAttribute("cx", 28); e.setAttribute("cy", 28); e.setAttribute("r", R); e.setAttribute("class", c); return e; };
  const fg = circle("ring-fg");
  fg.setAttribute("transform", "rotate(-90 28 28)");
  fg.style.strokeDasharray = "0 " + LEN.toFixed(1);
  const full = ((pct / 100) * LEN).toFixed(1) + " " + LEN.toFixed(1);
  requestAnimationFrame(() => requestAnimationFrame(() => (fg.style.strokeDasharray = full)));
  const tx = document.createElementNS(NS, "text");
  tx.setAttribute("x", 28); tx.setAttribute("y", 33); tx.setAttribute("text-anchor", "middle"); tx.textContent = pct + "%";
  s.append(circle("ring-bg"), fg, tx);
  return s;
}
