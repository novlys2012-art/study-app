// End-to-end test of uploads without a real key: builds the app against a fake Supabase that runs the real
// server handler (server/generate.js) with a fake AI, then signs in, uploads a PDF (with a picture page),
// a Word file and a PowerPoint in Chromium, and studies the result. Fails on any page error.
// Usage: npm run e2e
import { createServer } from "node:http";
import { readFile, rm } from "node:fs/promises";
import { extname, join } from "node:path";
import { execFileSync } from "node:child_process";
import JSZip from "jszip";
import { chromium } from "playwright";
import { handle, HttpError } from "../server/generate.js";

const ROOT = new URL("../", import.meta.url).pathname;
const OUT = join(ROOT, "dist-e2e");
const API_PORT = 54329;
const API = `http://localhost:${API_PORT}`;

// ----- Fake AI: answers each task in the shape the prompts ask for.
const fakeAi = {
  async complete({ system, prompt, images = [] }) {
    let out;
    if (/transcribe/.test(system)) {
      const pages = prompt.match(/pages ([\d, ]+),/)[1].split(", ").map(Number);
      out = { pages: pages.map((page, k) => ({ page, text: `Graf ponuky a dopytu z obrázka ${k + 1}. `.repeat(10) })) };
      if (images.length !== pages.length) throw new Error("image count");
    } else if (/clean, short study summary/.test(system)) {
      const name = prompt.match(/^Source: (.*)$/m)[1];
      out = { title: "Zhrnutie: " + name, summary: `## ${name}\n- **Dopyt** klesá, keď cena stúpa\n- Ponuka rastie s cenou`, key_terms: [{ term: "Dopyt", meaning: "ochota kupovať" }] };
    } else if (/multiple-choice/.test(system)) {
      const page = +(prompt.match(/\[(\d+)\]/) || [0, 1])[1];
      const name = prompt.match(/^Source: (.*)$/m)[1];
      out = { questions: [
        { q: `Čo platí o dopyte? (${name})`, o: ["Klesá s cenou", "Rastie s cenou", "Nemení sa", "Je vždy nulový"], a: 0, e: "Zákon dopytu.", x: "", s: "Dopyt klesá", page },
        { q: `Nesprávne označená otázka (${name})`, o: ["a", "b", "c", "d"], a: 3, e: "", x: "", s: "", page },
      ] };
    } else if (/check exam practice questions/.test(system)) {
      const qs = JSON.parse(prompt.match(/<questions>\n([\s\S]*)\n<\/questions>/)[1]);
      out = { checks: qs.map((x) => ({ i: x.i, verdict: x.q.startsWith("Nesprávne") ? "wrong" : "ok", note: "" })) };
    } else if (/organise one subject/.test(system)) {
      const ids = [...prompt.matchAll(/^(f\d+#\d+):/gm)].map((m) => m[1]);
      out = { subject: "Mikro", topics: [
        { name: "Dopyt", files: [], summary: "Ako dopyt reaguje na cenu.", questions: ids.slice(0, 1), weak_spots: ["Posun krivky vs. pohyb po krivke"] },
        { name: "Ponuka", files: [], summary: "Ponuka a cena.", questions: ids.slice(1), weak_spots: [] },
      ] };
    } else throw new Error("unexpected prompt");
    return { text: JSON.stringify(out), usage: { inputTokens: 2000, outputTokens: 400 }, model: "fake", costUsd: 0.002, truncated: false };
  },
};

// ----- Fake Supabase: sign-in link request and the generate function.
const USER = { id: "11111111-1111-1111-1111-111111111111", email: "student@example.com", aud: "authenticated", role: "authenticated" };
const ledger = [], tasks = [];
let bodyBytes = "";
const api = createServer(async (req, res) => {
  const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-api-version", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
  const send = (status, body) => { res.writeHead(status, { ...cors, "Content-Type": "application/json" }); res.end(JSON.stringify(body)); };
  if (req.method === "OPTIONS") { res.writeHead(204, cors); res.end(); return; }
  let raw = ""; for await (const c of req) raw += c;
  const path = req.url.split("?")[0];
  if (path === "/auth/v1/otp") return send(200, {});
  if (path === "/auth/v1/user") return send(200, USER);
  // The 6-digit code from the email: 123456 is right, anything else is wrong or expired.
  if (path === "/auth/v1/verify") {
    const { token, email, type } = JSON.parse(raw || "{}");
    if (token !== "123456" || email !== USER.email || type !== "email") return send(403, { code: "otp_expired", error_code: "otp_expired", msg: "Token has expired or is invalid" });
    const now = Math.floor(Date.now() / 1000);
    return send(200, { access_token: "fake-token", token_type: "bearer", expires_in: 3600, expires_at: now + 3600, refresh_token: "r", user: USER });
  }
  if (path === "/functions/v1/generate") {
    bodyBytes += raw;
    const token = (req.headers.authorization || "").replace(/^Bearer /, "");
    try {
      const body = JSON.parse(raw);
      tasks.push(body.task);
      const out = await handle(body, {
        user: token === "fake-token" ? { id: USER.id, email: USER.email } : null,
        env: { USER_MONTHLY_LIMIT_USD: "1" }, ai: fakeAi,
        spend: async () => ({ month: ledger.reduce((s, r) => s + r.cost_usd, 0), today: 0 }),
        record: async (row) => { ledger.push(row); },
      });
      return send(200, out);
    } catch (e) {
      return e instanceof HttpError ? send(e.status, { error: e.code, message: e.message }) : send(500, { error: "server", message: e.message });
    }
  }
  send(404, { error: "not found" });
}).listen(API_PORT);

// ----- Build against the fake and serve it.
execFileSync("npx", ["vite", "build", "--outDir", OUT, "--emptyOutDir", "--logLevel", "warn"], {
  cwd: ROOT, stdio: "inherit", env: { ...process.env, VITE_SUPABASE_URL: API, VITE_SUPABASE_KEY: "fake-publishable-key" },
});
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json" };
const web = createServer(async (req, res) => {
  const path = join(OUT, decodeURIComponent(req.url.split("?")[0]).replace(/\/$/, "/index.html"));
  try { res.writeHead(200, { "content-type": TYPES[extname(path)] || "application/octet-stream" }); res.end(await readFile(path)); }
  catch { res.writeHead(404).end(); }
}).listen(0);
const base = `http://localhost:${web.address().port}/`;

// ----- Test files: a 2-page PDF (text, then a drawing only), a Word file and a PowerPoint.
function makePdf() {
  const text = "Dopyt klesa, ked cena stupa. Ponuka rastie s cenou. Rovnovaha je tam, kde sa stretnu. ";
  const line = (s, y) => `BT /F1 11 Tf 40 ${y} Td (${s}) Tj ET`;
  const page1 = [0, 1, 2, 3, 4].map((k) => line(text.slice(0, 88), 780 - k * 16)).join("\n");
  const page2 = "0.2 0.4 0.8 rg 60 300 400 300 re f 0 0 0 RG 4 w 60 300 m 460 600 l S";
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 7 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${page1.length} >>\nstream\n${page1}\nendstream`,
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 6 0 R >>",
    `<< /Length ${page2.length} >>\nstream\n${page2}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = objs.map((o, k) => { const at = pdf.length; pdf += `${k + 1} 0 obj\n${o}\nendobj\n`; return at; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offsets.map((o) => String(o).padStart(10, "0") + " 00000 n \n").join("");
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}
async function makeDocx() {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file("_rels/.rels", '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  const para = (s) => `<w:p><w:r><w:t>${s}</w:t></w:r></w:p>`;
  zip.file("word/document.xml", `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${Array.from({ length: 12 }, (_, k) => para(`Odsek ${k + 1}: elasticita dopytu meria, ako silno dopyt reaguje na zmenu ceny.`)).join("")}</w:body></w:document>`);
  return zip.generateAsync({ type: "nodebuffer" });
}
async function makePptx() {
  const zip = new JSZip();
  const slide = (s) => `<p:sld xmlns:a="a" xmlns:p="p"><a:p><a:r><a:t>${s}</a:t></a:r></a:p></p:sld>`;
  zip.file("ppt/slides/slide1.xml", slide("Trhová rovnováha: cena, pri ktorej sa ponuka rovná dopytu. ".repeat(4)));
  zip.file("ppt/slides/slide2.xml", slide("Prebytok a nedostatok na trhu, cenové stropy a cenové podlahy. ".repeat(4)));
  return zip.generateAsync({ type: "nodebuffer" });
}

// ----- The run.
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
let refusing = false; // the wrong-code step expects the browser to log one 403
page.on("console", (m) => m.type() === "error" && !/fonts\./.test(m.text()) && !(refusing && /status of 403/.test(m.text())) && errors.push(m.text()));
const check = (cond, msg) => { if (!cond) errors.push(msg); else console.log("✓ " + msg); };

try {
  await page.goto(base);
  await page.click(".subj.add");
  await page.locator("#upLogin").waitFor();
  check(page.url().endsWith("#upload"), "the add card opens the upload screen");
  await page.fill("#upEmail", USER.email);
  await page.click("#upSend");
  await page.locator("#upSent").waitFor();
  check((await page.textContent("#upSent")).includes(USER.email), "sign-in code requested");
  await page.fill("#upCode", "654321");
  refusing = true;
  await page.click("#upVerify");
  await page.locator("#upErr").waitFor();
  refusing = false;
  check((await page.textContent("#upErr")).includes("Kód nesedí"), "a wrong code is refused");
  await page.fill("#upCode", "123 456");
  await page.press("#upCode", "Enter");
  await page.locator("#upConsent").waitFor();
  check(await page.locator("#upErr").isHidden(), "the right code signs in");
  await page.reload();
  await page.locator("#upConsent").waitFor();
  check(true, "the session survives a reload");
  check((await page.textContent("#upConsent")).includes("Anthropic"), "consent screen names the AI provider");
  await page.click("#upAgree");
  await page.locator("#upForm").waitFor();
  await page.waitForFunction(() => document.getElementById("upUsage").textContent.includes("$1.00"));
  check(true, "usage shows the monthly limit");

  await page.fill("#upName", "Mikroekonómia");
  await page.setInputFiles("#upFiles", [
    { name: "prednaska1.pdf", mimeType: "application/pdf", buffer: makePdf() },
    { name: "elasticita.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: await makeDocx() },
    { name: "rovnovaha.pptx", mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation", buffer: await makePptx() },
  ]);
  check((await page.locator("#upList li").count()) === 3, "three files picked");
  await page.click("#upGo");
  await page.locator("#setup").waitFor({ timeout: 30000 });
  check(true, "processing ends on the new subject");

  check(tasks.filter((x) => x === "vision").length === 1, "the drawing-only PDF page went to vision once");
  check(!bodyBytes.includes("%PDF") && !bodyBytes.includes("[Content_Types]"), "original files never leave the browser");
  check((await page.locator("#files .card").count()) === 3, "a summary for each file");
  check((await page.textContent("#files")).includes("2 str."), "page counts before and after");
  check((await page.textContent("#checked")).includes("vyradila 3"), "checked-out questions are counted");
  check((await page.locator("#tinfo .card").count()) === 2, "topics with their summaries");
  await page.click("#tinfo .card summary");
  await page.click("#files .card summary");
  // E2E_SHOTS=folder saves screenshots of the result screen, for checking the design.
  if (process.env.E2E_SHOTS) await page.screenshot({ path: join(process.env.E2E_SHOTS, "subject.png"), fullPage: true });
  check((await page.textContent("#tinfo")).includes("Posun krivky"), "weak spots show");
  await page.click("#tinfo .card .btn");
  await page.locator("#quiz").waitFor();
  check((await page.textContent("#qtopic")) === "Dopyt", "practising a topic starts its round");
  await page.locator("#opts .opt").first().click();
  await page.click("#toggle");
  check((await page.textContent("#more")).includes("prednaska1"), "the source quote names the file");
  await page.click("#crumb");
  check((await page.locator(".subj").count()) === 2, "home lists the new subject");
  check(ledger.length === tasks.filter((x) => x !== "usage").length, "every AI call is recorded for the limit");
} catch (e) {
  errors.push(e.message);
  const shown = await page.locator("#upErr").textContent().catch(() => "");
  if (shown) errors.push("on screen: " + shown);
  await page.screenshot({ path: join(ROOT, "e2e-failure.png") }).catch(() => {});
}

await browser.close();
web.close(); api.close();
await rm(OUT, { recursive: true, force: true });
if (errors.length) { console.log("✗ " + errors.join("\n✗ ")); process.exit(1); }
