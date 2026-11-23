// Icons for parts built in code. The static ones are written out in index.html.
const NS = "http://www.w3.org/2000/svg";
const PATHS = {
  chev: "M9 5l7 7-7 7",
  down: "M5 9l7 7 7-7",
  plus: "M12 5v14M5 12h14",
  cal: "M6 5h12a2.5 2.5 0 0 1 2.5 2.5v10A2.5 2.5 0 0 1 18 20H6a2.5 2.5 0 0 1-2.5-2.5v-10A2.5 2.5 0 0 1 6 5zM3.5 10h17M8 3v4M16 3v4",
  doc: "M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h4",
  check: "M5 12.5l4.5 4.5L19 7",
  x: "M6 6l12 12M18 6L6 18",
  up: "M12 16V4M7 9l5-5 5 5M5 20h14",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c1.5-4 4.5-6 8-6s6.5 2 8 6",
};
const FILLED = { play: "M8 5.2v13.6a1 1 0 0 0 1.5.86l11-6.8a1 1 0 0 0 0-1.72l-11-6.8A1 1 0 0 0 8 5.2z" };

export function icon(name, cls) {
  const s = document.createElementNS(NS, "svg");
  s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("aria-hidden", "true");
  s.setAttribute("class", "ic" + (cls ? " " + cls : ""));
  const p = document.createElementNS(NS, "path");
  if (FILLED[name]) { s.setAttribute("fill", "currentColor"); p.setAttribute("d", FILLED[name]); }
  else {
    s.setAttribute("fill", "none"); s.setAttribute("stroke", "currentColor"); s.setAttribute("stroke-width", "1.8");
    s.setAttribute("stroke-linecap", "round"); s.setAttribute("stroke-linejoin", "round");
    p.setAttribute("d", PATHS[name]);
  }
  s.appendChild(p);
  return s;
}
