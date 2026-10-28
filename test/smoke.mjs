// Opens every screen of the built app in Chromium and fails on any page error.
// Usage: npm run build && npm run smoke [-- reference-url]
// With a reference URL (e.g. the old kviz-final page), each screen's text must match it.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { chromium } from "playwright";

const DIST = new URL("../dist/", import.meta.url).pathname;
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };
const server = createServer(async (req, res) => {
  const path = join(DIST, decodeURIComponent(req.url.split("?")[0]).replace(/\/$/, "/index.html"));
  try {
    res.writeHead(200, { "content-type": TYPES[extname(path)] || "application/octet-stream" });
    res.end(await readFile(path));
  } catch {
    res.writeHead(404).end();
  }
}).listen(0);
const base = `http://localhost:${server.address().port}/`;
const reference = process.argv[2];
const SCREENS = ["", "fu", "zauctuj", "ucty", "es", "mat", "mat-vypocty"];

const browser = await chromium.launch();
let failed = 0;

async function visit(url, hash) {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && !/goatcounter|gc\.zgo|fonts\./.test(m.text()) && errors.push(m.text()));
  // Same random order on both pages, so screens with shuffled items compare equal.
  await page.addInitScript(() => { let x = 42; Math.random = () => ((x = (x * 16807) % 2147483647) - 1) / 2147483646; });
  await page.goto(url + (hash ? "#" + hash : ""));
  await page.waitForLoadState("networkidle").catch(() => {});
  const text = await page.locator("main").innerText();
  return { page, errors, text };
}

for (const hash of SCREENS) {
  const { page, errors, text } = await visit(base, hash);
  if (hash === "fu" || hash === "mat") {
    await page.click("#go");
    await page.locator("#opts button, #opts .opt").first().click();
  }
  if (errors.length) { failed++; console.log(`✗ #${hash}: ${errors.join(" | ")}`); }
  else console.log(`✓ #${hash || "home"}`);
  if (reference) {
    const ref = await visit(reference, hash);
    if (ref.text !== text) { failed++; console.log(`✗ #${hash}: text differs from reference`); }
    await ref.page.close();
  }
  await page.close();
}
await browser.close();
server.close();
process.exit(failed ? 1 : 0);
