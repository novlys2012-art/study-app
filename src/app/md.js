// The small part of Markdown the summaries use (## headings, - bullets, **bold**), built as DOM nodes
// with textContent, so AI text can never inject markup.
import { isProblem, correctAnswers } from "./problems.js";

function inline(parent, text) {
  text.split(/(\*\*[^*]+\*\*)/g).forEach((part) => {
    if (!part) return;
    if (/^\*\*[^*]+\*\*$/.test(part)) { const b = document.createElement("strong"); b.textContent = part.slice(2, -2); parent.appendChild(b); }
    else parent.appendChild(document.createTextNode(part));
  });
  return parent;
}

export function renderMarkdown(src) {
  const box = document.createElement("div");
  box.className = "md";
  let ul = null;
  for (const raw of String(src).split("\n")) {
    const line = raw.trim();
    if (!line) { ul = null; continue; }
    const h = line.match(/^#{1,6}\s+(.*)$/);
    const li = line.match(/^(?:[-*•]|\d+[.)])\s+(.*)$/);
    if (h) { ul = null; box.appendChild(inline(document.createElement("h3"), h[1])); }
    else if (li) {
      if (!ul) { ul = document.createElement("ul"); box.appendChild(ul); }
      ul.appendChild(inline(document.createElement("li"), li[1]));
    } else { ul = null; box.appendChild(inline(document.createElement("p"), line)); }
  }
  return box;
}

const norm = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const words = (s) => norm(s).split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 4);
const stem = (w) => w.slice(0, Math.max(4, w.length - 2));

// Picks the summary block (<p> or <li>) that best matches a quiz question's quote/explanation.
export function matchSummaryBlock(blocks, { quote = "", extras = [] } = {}) {
  const qNorm = norm(quote).replace(/\s+/g, " ").trim();
  if (qNorm.length >= 6) {
    const exact = blocks.findIndex((b) => norm(b).replace(/\s+/g, " ").includes(qNorm));
    if (exact >= 0) return { index: exact, phrase: quote.trim() };
  }
  const qStems = new Set(words(quote).map(stem));
  const eStems = new Set(extras.flatMap(words).map(stem));
  if (!qStems.size && !eStems.size) return null;
  let best = -1, top = 0;
  blocks.forEach((b, idx) => {
    const bw = new Set(words(b).map(stem));
    let score = 0;
    qStems.forEach((w) => { if (bw.has(w)) score += 3; });
    eStems.forEach((w) => { if (bw.has(w)) score += 1; });
    if (score > top) { top = score; best = idx; }
  });
  return top >= 3 ? { index: best, phrase: "" } : null;
}

export const stripSourceMeta = (s) => String(s || "").replace(/\s*\([^()]*\)\s*$/, "").trim();

export function sourceFileIndex(x, files = []) {
  if (!x || !x.s) return -1;
  return files.findIndex((f) => f && f.summary && (x.s.includes("(" + f.name) || x.s === f.name));
}

export function summaryBlocks(src) {
  const out = [];
  for (const raw of String(src || "").split("\n")) {
    const line = raw.trim();
    if (!line || /^#{1,6}\s+/.test(line)) continue;
    const li = line.match(/^(?:[-*•]|\d+[.)])\s+(.*)$/);
    const plain = (li ? li[1] : line).replace(/\*\*([^*]+)\*\*/g, "$1");
    if (plain) out.push(plain);
  }
  return out;
}

// Builds an ephemeral, zero-AI study summary referencing missed quiz questions or problems and their matching summary excerpts.
export function buildWrongStudyPack(wrong = [], files = [], topics = {}) {
  const sectionsMap = new Map();
  const blockCache = new Map();
  const matchedFiles = new Set();

  for (const x of wrong) {
    if (!x) continue;
    const fi = sourceFileIndex(x, files);
    const f = fi >= 0 ? files[fi] : null;
    const key = fi >= 0 ? "f:" + fi : "t:" + (x.t || "");
    let sec = sectionsMap.get(key);
    if (!sec) {
      sec = { fi, title: f ? (f.title || f.name) : (topics[x.t] || ""), fileName: f ? f.name : "", items: [] };
      sectionsMap.set(key, sec);
    }
    const correct = correctAnswers(x);
    const quote = stripSourceMeta(x.s);
    const extras = [x.e, x.q, ...correct].filter(Boolean);
    let excerpt = "", phrase = "";
    if (f) {
      matchedFiles.add(fi);
      let blocks = blockCache.get(fi);
      if (!blocks) { blocks = summaryBlocks(f.summary); blockCache.set(fi, blocks); }
      const hit = matchSummaryBlock(blocks, { quote, extras });
      if (hit) { excerpt = blocks[hit.index]; phrase = hit.phrase; }
    }
    sec.items.push({
      q: x.q || "",
      correct,
      steps: isProblem(x) && Array.isArray(x.steps) ? x.steps : [],
      explanation: x.e || "",
      example: x.x || "",
      topicName: topics[x.t] || "",
      fi, quote, extras, excerpt, phrase,
    });
  }

  const sections = [...sectionsMap.values()];
  const corpusRaw = sections.flatMap((s) => s.items.flatMap((it) => [it.q, ...it.correct, it.explanation, it.excerpt])).join(" ");
  const corpus = norm(corpusRaw);
  const corpusStems = new Set(words(corpusRaw).map(stem));
  const seenTerm = new Set();
  const keyTerms = [];
  for (const fi of matchedFiles) {
    for (const kt of files[fi]?.keyTerms || []) {
      const k = norm(kt?.term).trim();
      if (!k || k.length < 2 || seenTerm.has(k)) continue;
      const tWords = words(kt.term);
      const hit = corpus.includes(k) || (tWords.length > 0 && tWords.every((w) => corpusStems.has(stem(w))));
      if (hit) { seenTerm.add(k); keyTerms.push(kt); }
    }
  }
  return { sections, keyTerms, fileCount: matchedFiles.size };
}

export function highlightMatch(el, phrase) {
  el.classList.add("hl-block");
  const target = norm(phrase).replace(/\s+/g, " ").trim();
  if (!target) return el;
  const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let nStr = "", prevSpace = false;
  const map = [];
  for (let t; (t = walk.nextNode()); ) {
    for (let p = 0; p < t.data.length; p++) {
      const raw = norm(t.data[p]);
      for (let c = 0; c < raw.length; c++) {
        const ch = /\s/.test(raw[c]) ? " " : raw[c];
        if (ch === " " && prevSpace) continue;
        prevSpace = ch === " ";
        nStr += ch;
        map.push({ t, p });
      }
    }
  }
  const at = nStr.indexOf(target);
  if (at < 0) return el;
  const ranges = new Map();
  for (let k = at; k < at + target.length; k++) {
    const { t, p } = map[k];
    const r = ranges.get(t);
    if (r) r[1] = p + 1; else ranges.set(t, [p, p + 1]);
  }
  for (const [t, [start, rawEnd]] of ranges) {
    let end = rawEnd;
    while (end < t.data.length && /[\u0300-\u036f]/.test(t.data[end])) end++;
    t.splitText(end);
    const mid = t.splitText(start);
    const mark = document.createElement("mark");
    mark.className = "hl";
    mid.replaceWith(mark);
    mark.appendChild(mid);
  }
  return el;
}

