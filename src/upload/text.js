// Page clean-up shared by the app (src/upload/extract.js) and the Node trial (scripts/lib/extract.mjs).

// Drops lines that repeat on most pages (headers, footers, slide numbers).
export function stripRepeated(pages) {
  if (pages.length < 4) return pages;
  const seen = new Map();
  for (const p of pages) for (const l of new Set(p.split("\n").map((s) => s.trim()).filter(Boolean))) seen.set(l, (seen.get(l) || 0) + 1);
  const junk = new Set([...seen].filter(([l, n]) => n >= pages.length * 0.6 || /^\d{1,3}$/.test(l)).map(([l]) => l));
  return pages.map((p) => p.split("\n").filter((l) => !junk.has(l.trim())).join("\n"));
}

// Groups pages into sections of about maxTokens (4 characters per token is a rough estimate).
export function toSections(pages, maxTokens = 9000) {
  const limit = maxTokens * 4, out = [];
  let cur = "", from = 1;
  pages.forEach((p, i) => {
    if (cur && cur.length + p.length > limit) { out.push({ from, to: i, text: cur }); cur = ""; from = i + 1; }
    cur += (cur ? "\n\n" : "") + `[${i + 1}]\n` + p;
  });
  if (cur.trim()) out.push({ from, to: pages.length, text: cur });
  return out;
}

// Splits one long text (a Word file, a .txt) into pages of about one standard page (1800 characters),
// at paragraph breaks where possible, so page counts and sections work the same as for PDFs.
export function splitPages(text, size = 1800) {
  const out = [];
  let cur = "";
  for (const para of text.replace(/\r\n?/g, "\n").split(/\n{2,}/)) {
    for (let p = para; p; p = p.slice(size * 2)) {
      const part = p.slice(0, size * 2);
      if (cur && cur.length + part.length > size) { out.push(cur); cur = ""; }
      cur += (cur ? "\n\n" : "") + part;
    }
  }
  if (cur.trim()) out.push(cur);
  return out.length ? out : [""];
}
