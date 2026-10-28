// Text extraction for the phase 0 trial (Node). The app does the same on the device in phase 3.
import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import mammoth from "mammoth";
import JSZip from "jszip";

async function pdf(buf) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), useSystemFonts: true }).promise;
  const pages = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const content = await (await doc.getPage(n)).getTextContent();
    pages.push(content.items.map((it) => it.str + (it.hasEOL ? "\n" : "")).join(""));
  }
  return pages;
}

async function pptx(buf) {
  const zip = await JSZip.loadAsync(buf);
  const num = (p) => Number(p.match(/(\d+)\.xml$/)[1]);
  const slides = Object.keys(zip.files).filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p)).sort((a, b) => num(a) - num(b));
  const text = (xml) => [...xml.matchAll(/<a:p>([\s\S]*?)<\/a:p>/g)]
    .map((p) => [...p[1].matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((t) => t[1]).join(""))
    .filter(Boolean).join("\n");
  const pages = [];
  for (const s of slides) {
    let page = text(await zip.file(s).async("string"));
    const notes = zip.file(s.replace("slides/slide", "notesSlides/notesSlide"));
    if (notes) {
      const n = text(await notes.async("string"));
      if (n) page += "\n[Poznámky] " + n;
    }
    pages.push(page);
  }
  return pages;
}

// Returns one string per page or slide; DOCX and text files count as one page.
export async function extract(path) {
  const buf = await readFile(path);
  const ext = extname(path).toLowerCase();
  if (ext === ".pdf") return pdf(buf);
  if (ext === ".pptx") return pptx(buf);
  if (ext === ".docx") return [(await mammoth.extractRawText({ buffer: buf })).value];
  if (ext === ".txt" || ext === ".md") return [buf.toString("utf8")];
  throw new Error(`Unsupported file type ${ext}`);
}

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

const IMAGE_TYPES = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp" };
const MIN_IMAGE_BYTES = 5000;      // smaller ones are icons and bullets
const MAX_IMAGE_BYTES = 5_000_000; // the API's limit per image

// Page images for scanned material: a photo file itself, or the pictures inside a DOCX in document order.
// Image-only PDF pages need rendering, which the app does on the device in phase 3; here they are skipped.
export async function extractImages(path) {
  const ext = extname(path).toLowerCase();
  const keep = (name, buf) => {
    const mediaType = IMAGE_TYPES[extname(name).toLowerCase()];
    if (!mediaType || buf.length < MIN_IMAGE_BYTES) return null;
    if (buf.length > MAX_IMAGE_BYTES) { console.warn(`Skipping ${name}: over 5 MB`); return null; }
    return { name, mediaType, data: buf.toString("base64") };
  };
  if (IMAGE_TYPES[ext]) return [keep(path, await readFile(path))].filter(Boolean);
  if (ext !== ".docx") return [];
  const zip = await JSZip.loadAsync(await readFile(path));
  const rels = await zip.file("word/_rels/document.xml.rels")?.async("string") || "";
  const target = new Map([...rels.matchAll(/Id="([^"]+)"[^>]*Target="([^"]+)"/g)].map((m) => [m[1], "word/" + m[2]]));
  const doc = await zip.file("word/document.xml")?.async("string") || "";
  const order = [...new Set([...doc.matchAll(/r:embed="([^"]+)"/g)].map((m) => target.get(m[1])).filter(Boolean))];
  const out = [];
  for (const name of order) {
    const f = zip.file(name);
    if (!f) continue;
    const im = keep(name, await f.async("nodebuffer"));
    if (im) out.push(im);
  }
  return out;
}
