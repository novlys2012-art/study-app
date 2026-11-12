// Opens the built app in Chromium at phone size, checks the empty start screen, then walks a made-up
// test subject: tabs, a summary, the past exam ranking, one quiz round, an exam date, Today and Profile. Fails on any page error.
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
  exams: [
    { id: "x1", name: "Skúška 2024", year: 2024, questions: [
      { id: "e1", n: "1", text: "Sčítajte 2 + 2.", topic: "Téma A", points: 5 },
      { id: "e2", n: "2", text: "Vynásobte dve matice.", topic: "Matice", points: 3 },
    ] },
    { id: "x2", name: "Skúška 2023", year: 2023, questions: [
      { id: "e3", n: "1", text: "Akej farby je obloha?", topic: "téma b", points: 2 },
      { id: "e4", n: "2", text: "Ktoré čísla sú párne?", topic: "Téma A", points: 2 },
    ] },
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
await page.click('#sTabs [data-tab="topics"]');
check((await page.locator("#tinfo .card").count()) === 2, "topics show");
await page.click('#sTabs [data-tab="files"]');
check((await page.locator("#files .card").count()) === 4, "summaries show");
await page.fill("#studySearch", "tazke");
check((await page.locator("#files .card:not([hidden])").count()) === 1, "search finds a summary without diacritics");
await page.fill("#studySearch", "");
await page.click('#studySort [data-s="az"]');
check((await page.locator("#files .card .rc-title").first().textContent()) === "Algebra", "summaries sort by name");
await page.locator("#files .card").first().click();
check(await page.locator("#reader").isVisible() && (await page.textContent("#rBody")).includes("Algebra"), "a summary opens in the reading view");
await page.click("#rBack");

await page.click('#sTabs [data-tab="exams"]');
const rows = await page.locator("#tabExams .tbar .tbar-top span:first-child").allTextContents();
check(rows.join("|") === "Téma A|Matice|Téma B", "past exams rank topics, the newer exam counting more: " + rows.join(", "));
check((await page.textContent("#tabExams")).includes("v 2 z 2 skúšok") && (await page.textContent("#tabExams")).includes("Nie je to predpoveď"), "the ranking shows raw counts and its limits");
check(await page.locator("#tabExams .tipbox").isVisible(), "fewer than three exams are flagged as a rough guess");
await page.locator("#tabExams .tbar").nth(1).click();
check(await page.locator("#examSheet").isVisible() && (await page.textContent("#xBody")).includes("Vynásobte dve matice."), "a topic opens with its old exam questions");
await page.locator("#xBody select").first().selectOption("Téma B");
check(await page.locator("#examSheet").isHidden(), "moving the topic's only question closes its sheet");
const after = await page.locator("#tabExams .tbar .tbar-top span:first-child").allTextContents();
check(after.join("|") === "Téma A|Téma B", "a topic not in the materials is linked to a subject topic");
await page.locator("#tabExams .rowcard").first().click();
check((await page.textContent("#xTitle")) === "Skúška 2024", "an uploaded exam opens, newest first");
await page.fill("#xYear", "2021"); await page.press("#xYear", "Tab");
await page.click("#examSheet [data-close]");
check((await page.textContent("#tabExams .rowcard .hint")).startsWith("2023"), "changing an exam's year re-sorts the list");
await page.click("#tabExams .btn");
check(await page.locator("#quiz").isVisible() && (await page.textContent("#qtopic")) === "Téma A", "practising in ranked order starts with the most asked topic");
await page.click("#quit");
await page.goto(base + "#test");
check((await page.evaluate(() => JSON.parse(localStorage.getItem("studyapp-subjects-v1"))[0].exams[0].year)) === 2021, "exam changes are saved in the subject");

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

await page.click("#sMore");
const soon = new Date(Date.now() + 3 * 864e5);
await page.fill("#examDate", `${soon.getFullYear()}-${String(soon.getMonth() + 1).padStart(2, "0")}-${String(soon.getDate()).padStart(2, "0")}`);
await page.click("#moreSheet [data-close]");
check((await page.textContent("#sMeta")).includes("o 3 dni"), "an exam date shows as a countdown");
await page.click('#tabbar [data-go="home"]');
check((await page.locator("#subjects .sj").count()) === 2, "subjects screen lists the subject and the add card");
await page.click('#tabbar [data-go="today"]');
check((await page.textContent("#todayBody .hero")).includes("Testovací predmet"), "today leads with the subject whose exam is nearest");
await page.click("#todayBody .hero .btn");
check(await page.locator("#quiz").isVisible(), "today's button starts a round");
await page.click("#quit");
await page.click('#tabbar [data-go="profile"]');
await page.click('#looks [data-l="riso"]');
check((await page.evaluate(() => document.body.dataset.look)) === "riso", "profile switches the look");

await browser.close();
server.close();
if (errors.length) { console.log("✗ " + errors.join("\n✗ ")); process.exit(1); }
