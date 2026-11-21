// Lazy loader for self-hosted per-look font stylesheets in public/fonts/.
// Keeps first paint to the active look only and works offline inside Capacitor builds.
const SHEET_FOR = {
  kocky: "kocky",
  "": "kniha",
  zosit: "zosit",
  tabula: "zosit",
  cisty: "cisty",
  riso: "riso",
};

const loaded = new Set();

export function fontSheetForLook(look) {
  return SHEET_FOR[look || ""] || "kniha";
}

export function loadLookFonts(look) {
  if (typeof document === "undefined") return;
  const sheet = fontSheetForLook(look);
  if (loaded.has(sheet)) return;
  loaded.add(sheet);
  if (document.querySelector(`link[data-look-fonts="${sheet}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = `./fonts/${sheet}.css`;
  link.dataset.lookFonts = sheet;
  document.head.appendChild(link);
}
