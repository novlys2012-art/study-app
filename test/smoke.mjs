// Opens the built app in Chromium at phone size, checks the empty start screen, then walks a made-up
// test subject: tabs, a summary, one quiz round, an exam date, Today and Profile. Fails on any page error.
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

await page.setViewportSize({ width: 390, height: 844 });
await page.goto(base);
check(await page.locator("#today").isVisible() && await page.locator("#tabbar").isVisible(), "start screen shows with the tab bar");
check((await page.locator(".sj").count()) === 1, "no subjects, only the empty-state card");

await page.evaluate((s) => localStorage.setItem("studyapp-subjects-v1", JSON.stringify([s])), SUBJECT);
await page.goto(base + "#test");
check(await page.locator("#subject").isVisible(), "subject opens on its overview");
check((await page.locator("#tbars .tbar").count()) === 2, "overview lists the topics");
await page.locator("#tbars .tbar").first().click();
check(await page.locator("#tbars .tcard.open .btn").isVisible() && (await page.textContent("#tbars .tcard.open")).includes("Párne a nepárne"), "a topic opens to its weak spots and a practise button");
await page.click('#sTabs [data-tab="files"]');
check((await page.locator("#files .file").count()) === 4, "summaries show");
await page.fill("#studySearch", "tazke");
check((await page.locator("#files .file:not([hidden])").count()) === 1, "search finds a summary without diacritics");
await page.fill("#studySearch", "");
await page.selectOption("#studySort", "az");
check((await page.locator("#files .file .rc-title").first().textContent()) === "Algebra", "summaries sort by name");
await page.locator("#files .file").first().click();
check(await page.locator("#reader").isVisible() && (await page.textContent("#rBody")).includes("Algebra"), "a summary opens in the reading view");
check(await page.locator("#tabbar").isHidden() && page.url().endsWith("#test/read/1"), "the reader is full screen and has its own address");
await page.goBack();
check(await page.locator("#subject").isVisible(), "the back button goes from the summary to the subject");

await page.click("#custom");
await page.click('#counts [data-n="all"]');
await page.click("#go");
for (let n = 0; n < SUBJECT.questions.length; n++) {
  await page.locator("#opts .opt").first().click();
  if (await page.locator("#check").isVisible()) await page.click("#check");
  check(await page.locator("#fb").isVisible() && await page.locator("#tabbar").isHidden(), "the verdict slides up on question " + (n + 1));
  await page.click("#next");
}
check(await page.locator("#end").isVisible(), "a full round ends on the result screen");
await page.click("#endBack");
check(await page.locator("#subject").isVisible(), "leaving the result goes back to the subject");

await page.click("#sExam");
const soon = new Date(Date.now() + 3 * 864e5);
await page.fill("#examDate", `${soon.getFullYear()}-${String(soon.getMonth() + 1).padStart(2, "0")}-${String(soon.getDate()).padStart(2, "0")}`);
await page.click("#examDone");
check((await page.textContent("#sExam")).includes("o 3 dni"), "an exam date shows as a countdown");
await page.click("#sMore");
await page.goBack();
await page.locator("#moreSheet").waitFor({ state: "hidden" });
check(await page.locator("#subject").isVisible(), "the back button closes a sheet and stays on the screen");
await page.click('#tabbar [data-go="home"]');
check((await page.locator("#subjects .sj").count()) === 1 && await page.locator("#fab").isVisible(), "subjects screen lists the subject and shows the add button");
await page.click('#tabbar [data-go="today"]');
check((await page.textContent("#todayBody .hero")).includes("Testovací predmet"), "today leads with the subject whose exam is nearest");
await page.click("#todayBody .hero .btn");
check(await page.locator("#quiz").isVisible(), "today's button starts a round");
await page.click("#quit");
check(await page.locator("#today").isVisible(), "leaving a round started on Today goes back to Today");
await page.click('#tabbar [data-go="profile"]');
await page.click('#looks [data-l="riso"]');
check((await page.evaluate(() => document.body.dataset.look)) === "riso", "profile switches the look");
await page.click('#themes [data-th="dark"]');
check((await page.evaluate(() => document.documentElement.dataset.theme)) === "dark", "profile switches to dark");

await browser.close();
server.close();
if (errors.length) { console.log("✗ " + errors.join("\n✗ ")); process.exit(1); }
