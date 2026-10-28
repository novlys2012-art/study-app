// Text extraction on the device: PDF (pdf.js), PPTX (JSZip), DOCX (mammoth), TXT and MD.
// The original file never leaves the device; only its text, and pictures of pages that have no text, are sent.
import { stripRepeated, splitPages } from "./text.js";

export const MIN_TEXT = 150;        // characters; a PDF page with less is read as a picture
export const MAX_PAGES = 300;       // per file, for the free test
export const MAX_PICTURES = 40;     // picture pages per file
export const MAX_BYTES = 60 * 1024 * 1024;
export const TYPES = [".pdf", ".pptx", ".docx", ".txt", ".md"];

export class ExtractError extends Error {
  constructor(code, vars) { super(code); this.code = code; this.vars = vars; }
}

const ext = (name) => (name.match(/\.[^.]+$/)?.[0] || "").toLowerCase();
const words = (s) => s.replace(/\s+/g, " ").trim();

let pdfjs;
async function loadPdf() {
  if (!pdfjs) {
    pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  }
  return pdfjs;
}

// A page as a JPEG, long side about 1400 px: readable for the model, about 1,500 input tokens.
async function render(page) {
  const v1 = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: Math.min(2, 1400 / Math.max(v1.width, v1.height)) });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvas, canvasContext: ctx, viewport }).promise;
  return canvas.toDataURL("image/jpeg", 0.75).split(",")[1];
}

async function pdf(buf) {
  const lib = await loadPdf();
  const task = lib.getDocument({ data: new Uint8Array(buf) });
  const doc = await task.promise;
  if (doc.numPages > MAX_PAGES) throw new ExtractError("tooManyPages", { n: doc.numPages, max: MAX_PAGES });
  const raw = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const content = await (await doc.getPage(n)).getTextContent();
    raw.push(content.items.map((it) => (it.str || "") + (it.hasEOL ? "\n" : "")).join(""));
  }
  const pages = stripRepeated(raw);
  const images = [];
  let skipped = 0;
  for (let n = 1; n <= pages.length; n++) {
    if (words(pages[n - 1]).length >= MIN_TEXT) continue;
    if (images.length >= MAX_PICTURES) { skipped++; continue; }
    images.push({ page: n, mediaType: "image/jpeg", data: await render(await doc.getPage(n)) });
  }
  await task.destroy();
  return { pages, images, skipped };
}

async function pptx(buf) {
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(buf);
  const num = (p) => Number(p.match(/(\d+)\.xml$/)[1]);
  const slides = Object.keys(zip.files).filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p)).sort((a, b) => num(a) - num(b));
  if (slides.length > MAX_PAGES) throw new ExtractError("tooManyPages", { n: slides.length, max: MAX_PAGES });
  const text = (xml) => [...xml.matchAll(/<a:p>([\s\S]*?)<\/a:p>/g)]
    .map((p) => [...p[1].matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((t) => t[1]).join(""))
    .filter(Boolean).join("\n");
  const pages = [];
  for (const s of slides) {
    let page = text(await zip.file(s).async("string"));
    const notes = zip.file(s.replace("slides/slide", "notesSlides/notesSlide"));
    if (notes) { const n = text(await notes.async("string")); if (n) page += "\n[Poznámky] " + n; }
    pages.push(page);
  }
  return { pages: stripRepeated(pages), images: [], skipped: 0 };
}

async function docx(buf) {
  const { default: mammoth } = await import("mammoth/mammoth.browser.js");
  const pages = splitPages((await mammoth.extractRawText({ arrayBuffer: buf })).value);
  if (pages.length > MAX_PAGES) throw new ExtractError("tooManyPages", { n: pages.length, max: MAX_PAGES });
  return { pages, images: [], skipped: 0 };
}

// file: a File from <input type="file">. Returns { name, pages: [text], images: [{ page, mediaType, data }], skipped }.
export async function extractFile(file) {
  const type = ext(file.name);
  if (!TYPES.includes(type)) throw new ExtractError("type", { types: TYPES.join(", ") });
  if (file.size > MAX_BYTES) throw new ExtractError("tooBig", { mb: MAX_BYTES / 1048576 });
  const buf = await file.arrayBuffer();
  const name = file.name.replace(/\.[^.]+$/, "");
  let out;
  if (type === ".pdf") out = await pdf(buf);
  else if (type === ".pptx") out = await pptx(buf);
  else if (type === ".docx") out = await docx(buf);
  else out = { pages: splitPages(new TextDecoder().decode(buf)), images: [], skipped: 0 };
  const chars = out.pages.reduce((s, p) => s + words(p).length, 0);
  if (!out.images.length && chars < 200) throw new ExtractError("empty");
  return { name, ...out };
}
