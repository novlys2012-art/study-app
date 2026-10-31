// Opens the built app in Chromium, checks the empty start screen, then plays one quiz round
// on a made-up test subject. Fails on any page error.
// Usage: npm run build && npm run smoke
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

const SUBJECT = {
  id: "test", code: "TST", name: "Testovací predmet", term: "",
  topics: { a: "Téma A", b: "Téma B" },
  topicInfo: { a: { summary: "Sčítanie.", weakSpots: ["Párne a nepárne čísla"] }, b: { summary: "Farby.", weakSpots: [] } },
  files: ["Zlomky", "Algebra", "Ťažké príklady", "Bežné príklady"].map((title, k) => ({
    name: "subor" + k + ".pdf", title, pagesBefore: 10 - k, pagesAfter: 1.5, summary: "- **" + title + "** v skratke", keyTerms: [],
  })),
  questions: [
    { t: "a", q: "Koľko je 2 + 2?", o: ["3", "4", "5", "6"], a: 1, e: "Dva a dva sú štyri.", x: "", s: "test" },
    { t: "a", q: "Ktoré čísla sú párne?", o: ["1", "2", "3", "4"], a: [1, 3], e: "Párne sú 2 a 4.", x: "", s: "test" },
    { t: "b", q: "Aká farba je obloha cez deň?", o: ["modrá", "zelená", "červená", "čierna"], a: 0, e: "", x: "", s: "" },
  ],
};

const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && !/fonts\./.test(m.text()) && errors.push(m.text()));
const check = (cond, msg) => { if (!cond) errors.push(msg); else console.log("✓ " + msg); };

await page.goto(base);
check(await page.locator("#home").isVisible(), "start screen shows");
check((await page.locator(".subj").count()) === 1, "no subjects, only the empty-state card");

await page.evaluate((s) => localStorage.setItem("studyapp-subjects-v1", JSON.stringify([s])), SUBJECT);
await page.goto(base + "#test");
check(await page.locator("#setup").isVisible(), "subject opens on the round setup");
check((await page.locator("#files .card").count()) === 4 && (await page.locator("#tinfo .card").count()) === 2, "summaries and topics show");
await page.fill("#studySearch", "tazke");
check((await page.locator("#files .card:not([hidden])").count()) === 1 && await page.locator("#tinfoWrap").isHidden(), "search finds a summary without diacritics");
await page.fill("#studySearch", "");
await page.click('#studySort [data-s="az"]');
check((await page.locator("#files .card summary span").first().textContent()) === "Algebra", "summaries sort by name");
await page.click('#counts [data-n="all"]');
await page.click("#go");
for (let n = 0; n < SUBJECT.questions.length; n++) {
  await page.locator("#opts .opt").first().click();
  if (await page.locator("#check").isVisible()) await page.click("#check");
  await page.click("#next");
}
check(await page.locator("#end").isVisible(), "a full round ends on the result screen");
await page.click("#crumb");
check((await page.locator(".subj").count()) === 2, "home lists the subject and the add card");

await browser.close();
server.close();
if (errors.length) { console.log("✗ " + errors.join("\n✗ ")); process.exit(1); }
