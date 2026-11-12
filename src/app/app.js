// The app's screens: Today, Subjects, one subject (topics, summaries), the summary reader,
// the multiple-choice quiz and Profile. The upload screen has its own module (src/upload/ui.js).
// How screens should look and behave: docs/design.md.
import { t, getLang } from "../i18n/index.js";
import { loadSubjects, saveSubjects, readProgress, logAnswer, resetProgress } from "./subjects.js";
import { startSync } from "./autosync.js";
import { renderMarkdown } from "./md.js";
import { icon, ring } from "./icons.js";

const LOOK_KEY = "studyapp-look";
const THEME_KEY = "studyapp-theme";
const LAST_KEY = "studyapp-last-subject";
const ROUND = 20;      // questions in a "learn" round
const SEARCH_FROM = 4; // summaries before the search box shows
const L = "ABCD";
// Options that refer to other options ("none of the above", "a) and b)") keep their order.
const PIN = /žiadn|všetk|ani jedn|vyššie|predchádzaj|uveden.{0,10}možnost|\b[a-dA-D]\)|\b[a-dA-D] aj [a-dA-D]\b/i;

const $ = (id) => document.getElementById(id);
const corr = (x) => (Array.isArray(x.a) ? x.a : [x.a]);
const norm = (s) => String(s || "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

let SUBJECTS = [];
let CUR = null, QUESTIONS = [], TOPICS = {};
let picked = new Set();
let list = [], i = 0, score = 0, wrong = [], answered = false, count = "20", topic = "all", mode = "all", order = [];
let P = {};
let tab = "overview", sortBy = "order", query = "", openTopic = null;
let roundOf = null;   // what "next round" repeats: a topic key, or null for the whole subject
let stage = "quiz";   // the quiz entry shows a question ("quiz") or the result ("end")

function shuffle(a) { a = a.slice(); for (let k = a.length - 1; k > 0; k--) { const j = Math.floor(Math.random() * (k + 1)); [a[k], a[j]] = [a[j], a[k]]; } return a; }
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
function button(cls, text, onclick) { const b = el("button", cls, text); b.type = "button"; b.onclick = onclick; return b; }
function bar(pct) { const b = el("span", "bar"), fill = el("i"); fill.style.width = pct + "%"; b.appendChild(fill); return b; }
function buzz(pattern) { try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (e) {} }

// ===== Navigation: every screen is a history entry, so the back button always goes one step back
//
// Hashes: "" Today, "subjects", "profile", "upload", "upload/<subject>", "signin", "<subject>",
// "<subject>/read/<file number>", "<subject>/quiz". history.state.d counts the steps taken inside the app,
// so back() knows whether there is somewhere to go back to. An open bottom sheet is an entry too.

const SCREENS = ["today", "home", "subject", "reader", "quiz", "end", "upload", "profile"];
const TAB_OF = { today: "today", home: "home", subject: "home", profile: "profile" };
const scrolls = new Map();
let dir = "fade", shown = null, screen = null, skipPop = false, booted = false;
try { history.scrollRestoration = "manual"; } catch (e) {}
// After a reload the sheet that was open is closed, so its entry is an ordinary one again.
if (history.state && history.state.sheet) history.replaceState({ d: history.state.d || 0 }, "");

const here = () => decodeURIComponent(location.hash.slice(1));
const depth = () => (history.state && history.state.d) || 0;

function go(h, replace) {
  // Leaving from a sheet replaces the sheet's entry, so back does not land on a closed sheet.
  if (history.state && history.state.sheet) { replace = true; dir = "fwd"; }
  else dir = replace ? "fade" : "fwd";
  try { history[replace ? "replaceState" : "pushState"]({ d: replace ? depth() : depth() + 1 }, "", h ? "#" + h : location.pathname + location.search); } catch (e) {}
  route();
}
function back(fallback) { if (depth() > 0) history.back(); else go(fallback, true); }

function show(id) {
  SCREENS.forEach((s) => ($(s).hidden = s !== id));
  const on = TAB_OF[id];
  $("tabbar").hidden = !on;
  document.body.classList.toggle("has-tabbar", !!on);
  $("tabbar").querySelectorAll(".tab").forEach((b) => { if (b.dataset.go === on) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current"); });
  const fab = (id === "today" || id === "home") && SUBJECTS.length > 0;
  $("fab").hidden = !fab;
  document.body.classList.toggle("has-fab", fab);
  if (dir !== "none") {
    const s = $(id);
    s.classList.remove("in-fwd", "in-back", "in-fade"); void s.offsetWidth; s.classList.add("in-" + dir);
  }
  if (screen !== id) document.querySelectorAll("dialog[open]").forEach((d) => d.close());
  screen = id;
}

function route() {
  if (shown != null) scrolls.set(shown, window.scrollY);
  SUBJECTS = loadSubjects();
  const h = here();
  const y = dir === "none" ? window.scrollY : dir === "back" ? scrolls.get(h) || 0 : 0;
  const sj = SUBJECTS.find((x) => h === x.id || h.startsWith(x.id + "/"));
  // The sign-in link comes back with ?code=..., which the upload screen turns into a session.
  const code = !booted && /[?&]code=/.test(location.search);
  booted = true;
  if (h.startsWith("upload/")) showUpload(h.slice(7));
  else if (h === "upload" || code) showUpload();
  else if (h === "signin") showUpload(null, true);
  else if (h === "subjects") showHome();
  else if (h === "profile") showProfile();
  else if (sj) {
    const [, sub, arg] = h.slice(sj.id.length).split("/");
    enter(sj);
    const file = sub === "read" ? (sj.files || [])[+arg] : null;
    if (sub === "quiz" && !list.length) { go(sj.id, true); return; }
    if (sub === "quiz") { if (stage === "end") showEnd(); else showQuiz(); }
    else if (file && file.summary) showReader(file);
    else showSubject();
  } else showToday();
  shown = h; dir = "fade";
  window.scrollTo(0, y);
}
// Draws the current screen again in place (after a sync, or a change made in a sheet).
function refresh() { dir = "none"; route(); }

window.addEventListener("popstate", () => {
  if (skipPop) { skipPop = false; return; }
  const open = document.querySelector("dialog[open]");
  if (open) { open.close(); return; }
  dir = "back"; route();
});
// A hash typed into the address bar.
window.addEventListener("hashchange", () => { if (here() !== shown) route(); });

$("tabbar").onclick = (e) => {
  const b = e.target.closest("[data-go]"); if (!b) return;
  if (b.dataset.go === "upload") openUpload();
  else go({ today: "", home: "subjects", profile: "profile" }[b.dataset.go], true);
};
$("fab").onclick = () => openUpload();

// ===== Bottom sheets and the toast

function openSheet(d) {
  d.classList.remove("closing");
  d.showModal();
  try { history.pushState({ d: depth() + 1, sheet: true }, ""); } catch (e) {}
}
// Slides the sheet down, then closes it.
function closeSheet(d) {
  if (!d.open || d.classList.contains("closing")) return;
  if (matchMedia("(prefers-reduced-motion:reduce)").matches) { d.close(); return; }
  d.classList.add("closing");
  setTimeout(() => { if (d.open) d.close(); }, 170);
}
document.querySelectorAll("dialog.bsheet").forEach((d) => {
  // A sheet closes with its ✕ button, a tap outside, Esc or the back button.
  d.addEventListener("click", (e) => { if (e.target === d || e.target.closest("[data-close]")) closeSheet(d); });
  d.addEventListener("cancel", (e) => { e.preventDefault(); closeSheet(d); });
  d.addEventListener("close", () => {
    d.classList.remove("closing");
    if (history.state && history.state.sheet) { skipPop = true; history.back(); }
  });
});

let toastTimer = 0;
function toast(msg) {
  const box = $("toast");
  box.textContent = msg; box.hidden = false;
  // In the top layer, so it also shows above an open sheet.
  try { if (box.showPopover) { if (box.matches(":popover-open")) box.hidePopover(); box.showPopover(); } } catch (e) {}
  box.classList.remove("on"); void box.offsetWidth; box.classList.add("on");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { box.hidden = true; try { if (box.hidePopover) box.hidePopover(); } catch (e) {} }, 2600);
}

// ===== Progress and exam dates

// How much of a subject is known: a question counts once its last answer was right.
function stats(qs, p) {
  let ok = 0, bad = 0;
  qs.forEach((x) => { const r = p[x.id]; if (r) { if (r.l === 1) ok++; else bad++; } });
  return { total: qs.length, ok, bad, due: qs.length - ok, pct: qs.length ? Math.round((ok / qs.length) * 100) : 0 };
}
// A learn round: mistakes first, then questions not seen yet, then the known ones with the weakest record.
function smartRound(qs, p, n = ROUND) {
  const bad = [], fresh = [], known = [];
  qs.forEach((x) => { const r = p[x.id]; (!r ? fresh : r.l === 1 ? known : bad).push(x); });
  known.sort((a, b) => p[a.id].c / p[a.id].n - p[b.id].c / p[b.id].n);
  return [...shuffle(bad), ...shuffle(fresh), ...known].slice(0, n);
}
function daysTo(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ""); if (!m) return null;
  const now = new Date(); now.setHours(0, 0, 0, 0);
  return Math.round((new Date(+m[1], +m[2] - 1, +m[3]) - now) / 864e5);
}
function examDate(sj) {
  const [y, m, day] = sj.exam.split("-").map(Number);
  return new Date(y, m - 1, day).toLocaleDateString(getLang(), { day: "numeric", month: "numeric" });
}
function examText(sj) {
  const d = daysTo(sj.exam); if (d == null) return "";
  const date = examDate(sj);
  if (d < 0) return t("exam.past", { date });
  const when = d === 0 ? t("exam.today") : d === 1 ? t("exam.tomorrow") : t(d < 5 ? "exam.daysFew" : "exam.days", { n: d });
  return t("exam.on", { date, when });
}
const dueText = (st) => (st.due ? t("home.due", { n: st.due }) : t("home.allOk"));
const pctLabel = (st) => t("subject.mastered", { pct: st.pct });
// An exam within a week is shown in the warning colour.
const soonClass = (sj) => { const d = daysTo(sj.exam); return d != null && d >= 0 && d <= 7 ? " soon" : ""; };

// ===== Today

// What an empty app shows: one sentence, the three steps and the button.
function emptyState() {
  const box = el("div", "empty big");
  const art = el("span", "empty-art"); art.appendChild(icon("up"));
  const steps = el("ol", "steps");
  ["home.stepUpload", "home.stepRead", "home.stepPractise"].forEach((k) => steps.appendChild(el("li", null, t(k))));
  box.append(art, el("h2", null, t("home.empty.title")), el("p", null, t("home.empty.text")), steps,
    button("btn wide sj add", t("home.empty.go"), () => openUpload()));
  return box;
}
function countdown(sj) {
  const d = daysTo(sj.exam);
  if (d == null || d < 0) return null;
  const box = el("div", "countdown");
  box.append(el("b", null, d === 0 ? t("today.cdToday") : d === 1 ? t("today.cdTomorrow") : String(d)),
    el("span", null, (d < 2 ? t("today.cdExam") : t(d < 5 ? "today.cdFew" : "today.cdMany")) + " · " + examDate(sj)));
  return box;
}
function renderToday() {
  const box = $("todayBody"); box.innerHTML = ""; $("subjects").innerHTML = "";
  $("todayDate").textContent = new Date().toLocaleDateString(getLang(), { weekday: "long", day: "numeric", month: "long" });
  if (!SUBJECTS.length) { box.appendChild(emptyState()); return; }
  let last = ""; try { last = localStorage.getItem(LAST_KEY) || ""; } catch (e) {}
  const rows = SUBJECTS.map((sj) => ({ sj, st: stats(sj.questions, readProgress(sj)), d: daysTo(sj.exam) }));
  const withQ = rows.filter((r) => r.st.total);
  // The big card is the subject with the nearest exam, or else the one opened last.
  const soon = withQ.filter((r) => r.d != null && r.d >= 0).sort((a, b) => a.d - b.d)[0];
  const hero = soon || withQ.find((r) => r.sj.id === last) || withQ[0];
  if (hero) {
    const c = el("div", "sheet hero");
    const open = button("hero-open", null, () => go(hero.sj.id));
    const names = el("span", "grow");
    names.append(el("span", "eyebrow", t(soon ? "today.nextExam" : "today.continue")), el("span", "hero-name", hero.sj.name));
    open.append(names, icon("chev"));
    c.appendChild(open);
    const mid = el("div", "hero-mid");
    const cd = countdown(hero.sj);
    if (cd) mid.appendChild(cd);
    else mid.appendChild(button("hero-chip", null, () => { enter(hero.sj); openExam(); }));
    if (!cd) mid.firstChild.append(icon("cal"), el("span", null, t("exam.add")));
    mid.appendChild(ring(hero.st.pct, pctLabel(hero.st), "on-hero"));
    c.append(mid, el("p", "hint", t("today.round", { n: Math.min(ROUND, hero.st.total) })));
    const start = button("btn wide", null, () => { enter(hero.sj); learn(); });
    start.append(icon("play"), el("span", null, t("today.start")));
    c.appendChild(start);
    box.appendChild(c);
  }
  const rest = rows.filter((r) => r !== hero).sort((a, b) => (a.d != null && a.d >= 0 ? a.d : 1e9) - (b.d != null && b.d >= 0 ? b.d : 1e9));
  if (rest.length) box.appendChild(el("p", "label", t(hero ? "today.others" : "home.title")));
  rest.forEach((r) => {
    // The row opens the subject; its round button starts a round straight away.
    const row = el("div", "rowcard split");
    const main = button("rc-main", null, () => go(r.sj.id));
    const g = el("span", "grow");
    g.append(el("span", "rc-title", r.sj.name), el("span", "hint" + soonClass(r.sj), examText(r.sj) || (r.st.total ? dueText(r.st) : t("today.read"))));
    main.append(ring(r.st.pct, pctLabel(r.st)), g);
    row.appendChild(main);
    if (r.st.total) {
      const play = button("play", null, () => { enter(r.sj); learn(); });
      play.setAttribute("aria-label", t("today.practise", { name: r.sj.name })); play.appendChild(icon("play"));
      row.appendChild(play);
    } else main.appendChild(icon("chev", "chev"));
    box.appendChild(row);
  });
}
function showToday() { CUR = null; renderToday(); show("today"); }

// ===== Subjects

function subjectRow(sj) {
  const st = stats(sj.questions, readProgress(sj));
  const b = button("rowcard sj", null, () => go(sj.id));
  const g = el("span", "grow");
  g.appendChild(el("span", "rc-title", sj.name));
  const ex = examText(sj);
  if (ex) g.appendChild(el("span", "hint" + soonClass(sj), ex));
  g.appendChild(el("span", "hint", st.total ? dueText(st) : t("home.noQuestions")));
  b.append(ring(st.pct, pctLabel(st)), g, icon("chev", "chev"));
  return b;
}
function showHome() {
  CUR = null;
  const box = $("subjects"); box.innerHTML = ""; $("todayBody").innerHTML = "";
  SUBJECTS.forEach((sj) => box.appendChild(subjectRow(sj)));
  if (!SUBJECTS.length) box.appendChild(emptyState());
  show("home");
}

// ===== One subject

function enter(sj) {
  if (!CUR || CUR.id !== sj.id) { topic = "all"; mode = "all"; list = []; query = ""; tab = "overview"; openTopic = null; }
  CUR = sj; QUESTIONS = sj.questions; TOPICS = sj.topics;
  P = readProgress(sj);
  try { localStorage.setItem(LAST_KEY, sj.id); } catch (e) {}
}
const summaries = () => (CUR.files || []).filter((f) => f.summary);
const topicKeys = () => Object.keys(TOPICS).filter((k) => {
  const it = (CUR.topicInfo || {})[k];
  return QUESTIONS.some((x) => x.t === k) || (it && (it.summary || (it.weakSpots || []).length));
});

function renderSubject() {
  const st = stats(QUESTIONS, P), files = summaries().length;
  $("sName").textContent = CUR.name;
  $("sMeta").textContent = [st.total ? t("today.count", { n: st.total }) : "", files ? t("subject.summaries", { n: files }) : ""].filter(Boolean).join(" · ");
  // Only the tabs that have something to show.
  const has = { overview: topicKeys().length > 0, files: files > 0 };
  const open = Object.keys(has).filter((k) => has[k]);
  $("sCard").hidden = !open.length;
  $("sStat").hidden = !st.total; $("sActions").hidden = !st.total;
  $("sRing").replaceChildren(ring(st.pct, pctLabel(st), "lg"));
  $("sPct").textContent = pctLabel(st);
  $("sDue").textContent = dueText(st);
  $("sExamText").textContent = examText(CUR) || t("exam.add");
  $("sExam").className = "chiprow" + (CUR.exam ? soonClass(CUR) : " unset");
  if (!has[tab]) tab = open[0] || "overview";
  const tabs = [...$("sTabs").children];
  tabs.forEach((b) => { b.hidden = !has[b.dataset.tab]; b.setAttribute("aria-pressed", b.dataset.tab === tab); });
  // The sliding marker under the chosen tab.
  $("sTabs").style.setProperty("--n", open.length || 1);
  $("sTabs").style.setProperty("--i", Math.max(0, open.indexOf(tab)));
  $("sTabs").hidden = open.length < 2;
  $("sEmpty").hidden = open.length > 0;
  $("tabOverview").hidden = tab !== "overview" || !has.overview;
  $("tabFiles").hidden = tab !== "files" || !has.files;
  if (!$("tabOverview").hidden) renderOverview();
  if (!$("tabFiles").hidden) renderFiles();
}
function showSubject() { renderSubject(); show("subject"); }
$("sTabs").onclick = (e) => { const b = e.target.closest("button"); if (b) { tab = b.dataset.tab; renderSubject(); } };
$("sBack").onclick = () => back("subjects");
$("sEmptyAdd").onclick = () => openUpload(CUR.id);

// Topics from the weakest. A topic opens to its summary, weak spots and a button that practises it.
function renderOverview() {
  const info = CUR.topicInfo || {};
  const rows = topicKeys().map((k) => ({ k, st: stats(QUESTIONS.filter((x) => x.t === k), P), it: info[k] || {} }))
    .sort((a, b) => (a.st.total ? a.st.pct : 101) - (b.st.total ? b.st.pct : 101));
  $("tbars").replaceChildren(...rows.map(({ k, st, it }) => {
    const c = el("div", "tcard" + (openTopic === k ? " open" : ""));
    const head = button("tbar", null, () => {
      openTopic = openTopic === k ? null : k;
      [...$("tbars").children].forEach((x) => { const on = x === c && openTopic === k; x.classList.toggle("open", on); x.firstChild.setAttribute("aria-expanded", on); });
    });
    head.setAttribute("aria-expanded", openTopic === k);
    const top = el("span", "tbar-top"); top.append(el("span", null, TOPICS[k]));
    if (st.total) top.append(el("span", "pct", st.pct + " %"));
    top.append(icon("down", "chev"));
    head.appendChild(top);
    if (st.total) head.append(bar(st.pct), el("span", "hint", t("today.count", { n: st.total }) + " · " + dueText(st)));
    const body = el("div", "tbody"), inner = el("div", "tbody-in");
    if (it.summary) inner.appendChild(el("p", null, it.summary));
    const weak = it.weakSpots || [];
    if (weak.length) {
      const ul = el("ul"); weak.forEach((w) => ul.appendChild(el("li", null, w)));
      inner.append(el("p", "label", t("study.weak")), ul);
    }
    if (st.total) {
      const go = button("btn wide ghost", null, () => learn(k));
      go.append(icon("play"), el("span", null, t("study.practise")));
      inner.appendChild(go);
    }
    body.appendChild(inner);
    c.append(head, body);
    return c;
  }));
}

function renderFiles() {
  const files = summaries();
  let rows = files.map((f) => ({ f, name: f.title || f.name, size: +f.pagesBefore || 0 }));
  if (sortBy === "az") rows.sort((x, y) => x.name.localeCompare(y.name, "sk"));
  if (sortBy === "long") rows.sort((x, y) => y.size - x.size);
  $("files").replaceChildren(...rows.map(({ f, name }) => {
    const b = button("rowcard file", null, () => go(CUR.id + "/read/" + CUR.files.indexOf(f)));
    const g = el("span", "grow"), art = el("span", "file-art");
    art.appendChild(icon("doc"));
    g.append(el("span", "rc-title", name), el("span", "hint", t("study.pages", { before: f.pagesBefore, after: String(f.pagesAfter).replace(".", ",") })));
    b.append(art, g, icon("chev", "chev"));
    b.dataset.text = norm([f.title, f.name, f.summary, ...(f.keyTerms || []).map((k) => k.term + " " + k.meaning)].join(" "));
    return b;
  }));
  $("studyTools").hidden = files.length < 2;
  $("studySearch").hidden = files.length < SEARCH_FROM;
  if (files.length < SEARCH_FROM) query = "";
  $("studySearch").value = query;
  $("studySort").value = sortBy;
  $("checked").textContent = CUR.checkedOut ? t("study.checked", { n: CUR.checkedOut }) : "";
  $("checked").hidden = !CUR.checkedOut;
  filterFiles();
}
// Hides the summaries that do not contain the search text (diacritics do not matter).
function filterFiles() {
  const q = norm(query.trim());
  let n = 0;
  [...$("files").children].forEach((b) => { const hit = !q || b.dataset.text.includes(q); b.hidden = !hit; if (hit) n++; });
  $("studyNone").hidden = !q || n > 0;
}
$("studySearch").oninput = () => { query = $("studySearch").value; filterFiles(); };
$("studySort").onchange = () => { sortBy = $("studySort").value; renderFiles(); };

// ===== Summary reader

function showReader(f) {
  $("rTitle").textContent = f.title || f.name;
  $("rMeta").textContent = [f.title && f.title !== f.name ? f.name : "", t("study.pages", { before: f.pagesBefore, after: String(f.pagesAfter).replace(".", ",") })].filter(Boolean).join(" · ");
  const md = renderMarkdown(f.summary);
  const body = $("rBody"); body.innerHTML = "";
  if (f.picturePages) body.appendChild(el("p", "hint", t("study.pictures", { n: f.picturePages })));
  if (f.skippedPictures) body.appendChild(el("p", "hint", t("study.skipped", { n: f.skippedPictures })));
  body.appendChild(md);
  // A row of the summary's headings, to jump around a long one.
  const heads = [...md.querySelectorAll("h3")];
  $("rToc").replaceChildren(...heads.map((h) => button(null, h.textContent, () => h.scrollIntoView({ behavior: "smooth", block: "start" }))));
  $("rToc").hidden = heads.length < 3;
  const terms = f.keyTerms || [];
  $("rTerms").replaceChildren(...terms.flatMap((k) => [el("dt", null, k.term), el("dd", null, k.meaning)]));
  $("rTermsWrap").hidden = !terms.length;
  // Each question's source line ends with its file name, which is how a file finds its questions.
  const qs = QUESTIONS.filter((x) => x.s && x.s.includes("(" + f.name));
  $("rDock").hidden = !qs.length;
  $("rPractise").onclick = () => { roundOf = null; start(smartRound(qs, P)); };
  $("rProg").style.width = "0";
  show("reader");
}
$("rBack").onclick = () => back(CUR.id);
// The thin bar under the reader's title: how far down the summary you are.
window.addEventListener("scroll", () => {
  if ($("reader").hidden) return;
  const max = document.documentElement.scrollHeight - window.innerHeight;
  $("rProg").style.width = (max > 0 ? Math.min(100, (window.scrollY / max) * 100) : 100) + "%";
}, { passive: true });

// ===== Rounds: "learn" and the custom round sheet

function learn(topicKey = null) {
  roundOf = topicKey;
  const qs = topicKey ? QUESTIONS.filter((x) => x.t === topicKey) : QUESTIONS;
  if (qs.length) start(smartRound(qs, P));
}
$("learn").onclick = () => learn();

function pool() {
  let l = topic === "all" ? QUESTIONS : QUESTIONS.filter((x) => x.t === topic);
  if (mode === "new") l = l.filter((x) => !P[x.id]);
  if (mode === "wrong") l = l.filter((x) => P[x.id] && P[x.id].l === 0);
  return l;
}
function updAvail() {
  const n = pool().length;
  $("avail").textContent = n
    ? (count !== "all" && n > +count ? t("setup.availCut", { n, count }) : t("setup.avail", { n }))
    : t(mode === "wrong" ? "setup.noWrong" : "setup.allSeen");
  $("go").disabled = !n;
}
$("custom").onclick = () => {
  const box = $("topics"); box.innerHTML = "";
  const rows = [["all", t("setup.allTopics"), QUESTIONS.length]]
    .concat(Object.keys(TOPICS).map((k) => [k, TOPICS[k], QUESTIONS.filter((x) => x.t === k).length]).filter((r) => r[2]));
  rows.forEach(([k, name, n]) => {
    const lab = el("label", "topic");
    const inp = document.createElement("input"); inp.type = "radio"; inp.name = "topic"; inp.value = k; inp.id = "topic-" + k; inp.checked = k === topic;
    inp.onchange = () => { topic = k; updAvail(); };
    lab.append(inp, el("span", null, name), el("span", "n", n));
    box.appendChild(lab);
  });
  [...$("modes").children].forEach((x) => x.setAttribute("aria-pressed", x.dataset.m === mode));
  updAvail(); openSheet($("roundSheet"));
};
$("modes").onclick = (e) => {
  const b = e.target.closest("button"); if (!b) return;
  mode = b.dataset.m; [...$("modes").children].forEach((x) => x.setAttribute("aria-pressed", x === b)); updAvail();
};
function pressCount(b) { [...$("counts").querySelectorAll("button")].forEach((x) => x.setAttribute("aria-pressed", x === b)); }
$("counts").onclick = (e) => {
  const b = e.target.closest("button"); if (!b) return;
  count = b.dataset.n; pressCount(b); $("customN").value = ""; $("customN").classList.remove("on"); updAvail();
};
$("customN").oninput = () => {
  const v = parseInt($("customN").value, 10);
  if (v >= 1) { count = String(v); pressCount(null); $("customN").classList.add("on"); }
  else { count = "20"; pressCount($("counts").querySelector('[data-n="20"]')); $("customN").classList.remove("on"); }
  updAvail();
};
$("go").onclick = () => {
  let l = shuffle(pool()); if (!l.length) return;
  if (count !== "all") l = l.slice(0, +count);
  roundOf = null; start(l);
};

// ===== The exam date sheet

function openExam() {
  $("examDate").value = CUR.exam || "";
  $("examClear").hidden = !CUR.exam;
  openSheet($("examSheet"));
}
function setExam(v) {
  if (v) CUR.exam = v; else delete CUR.exam;
  saveSubjects(loadSubjects().map((x) => { if (x.id !== CUR.id) return x; const { exam, ...rest } = x; return v ? { ...rest, exam: v } : rest; }));
  $("examClear").hidden = !v;
  const keep = CUR;
  refresh();
  if (!CUR) CUR = keep; // Today has no open subject, but the sheet is still on this one
  toast(t(v ? "exam.saved" : "exam.removed"));
}
$("sExam").onclick = openExam;
$("examDate").onchange = () => setExam($("examDate").value);
$("examClear").onclick = () => { $("examDate").value = ""; setExam(""); closeSheet($("examSheet")); };

// ===== The subject's menu: add files, progress, reset, delete

$("sMore").onclick = () => {
  $("mName").textContent = CUR.name;
  const st = stats(QUESTIONS, P), seen = st.ok + st.bad;
  const box = $("prog"); box.innerHTML = "";
  [["setup.statSeen", seen + " / " + st.total], ["setup.statOk", st.ok], ["setup.statTodo", st.bad]].forEach(([k, v]) => {
    const s = el("div", "tile"); s.append(el("b", null, v), el("span", null, t(k))); box.appendChild(s);
  });
  $("progWrap").hidden = !seen; $("confirm").hidden = true; $("reset").hidden = !seen;
  $("delConfirm").hidden = true; $("delSubj").hidden = false;
  openSheet($("moreSheet"));
};
$("addFiles").onclick = () => openUpload(CUR.id);
$("reset").onclick = () => { $("confirm").hidden = false; $("reset").hidden = true; };
$("no").onclick = () => { $("confirm").hidden = true; $("reset").hidden = false; };
$("yes").onclick = () => { resetProgress(CUR); P = {}; closeSheet($("moreSheet")); renderSubject(); toast(t("setup.resetDone")); };
$("delSubj").onclick = () => { $("delConfirm").hidden = false; $("delSubj").hidden = true; };
$("delNo").onclick = () => { $("delConfirm").hidden = true; $("delSubj").hidden = false; };
$("delYes").onclick = () => {
  saveSubjects(loadSubjects().filter((x) => x.id !== CUR.id));
  go("subjects");
  toast(t("setup.deleted"));
};

// ===== Quiz: one question per screen, the verdict slides up from the bottom

function start(qs) {
  list = qs; i = 0; score = 0; wrong = []; stage = "quiz"; answered = false;
  const h = CUR.id + "/quiz";
  if (here() === h) { dir = "fwd"; route(); } else go(h);
}
function showQuiz() {
  // Coming back to a question that was already answered moves on to the next one.
  if (answered && ++i >= list.length) { stage = "end"; showEnd(); return; }
  show("quiz"); render();
}
// Back to where the round was started from: the subject, a summary or Today.
function leaveQuiz() { list = []; back(CUR.id); }
function setPos() { $("pos").textContent = t("quiz.pos", { i: i + 1, n: list.length }); }
function render() {
  const x = list[i]; answered = false;
  $("qtopic").textContent = TOPICS[x.t] || "";
  setPos();
  $("pg").style.width = (i / list.length) * 100 + "%";
  $("q").textContent = x.q;
  const multi = Array.isArray(x.a); picked = new Set();
  $("multi").hidden = !multi; $("check").hidden = !multi; $("check").disabled = true;
  order = x.o.map((_, k) => k);
  if (!x.o.some((o) => PIN.test(o))) order = shuffle(order);
  const box = $("opts"); box.innerHTML = "";
  order.forEach((oi, k) => {
    const b = el("button", "opt"); b.type = "button";
    if (multi) b.setAttribute("aria-pressed", "false");
    b.append(el("span", "k", L[k]), el("span", "t", x.o[oi]));
    b.onclick = () => answer(k); box.appendChild(b);
  });
  $("fb").hidden = true; $("quiz").style.paddingBottom = "";
  // The new question slides in.
  const body = $("qBody"); body.classList.remove("swap"); void body.offsetWidth; body.classList.add("swap");
  window.scrollTo({ top: 0 });
}
function answer(k) {
  if (answered) return;
  const x = list[i];
  if (Array.isArray(x.a)) {
    const b = $("opts").children[k];
    if (picked.has(k)) picked.delete(k); else picked.add(k);
    b.setAttribute("aria-pressed", picked.has(k)); $("check").disabled = !picked.size;
    return;
  }
  grade(new Set([k]));
}
function grade(sel) {
  answered = true;
  const x = list[i], C = new Set(corr(x).map((a) => order.indexOf(a)));
  const ok = C.size === sel.size && [...sel].every((n) => C.has(n));
  if (ok) score++; else wrong.push(x);
  const r = P[x.id] || { n: 0, c: 0 }; r.n++; if (ok) r.c++; r.l = ok ? 1 : 0; P[x.id] = r;
  logAnswer(CUR, x.id, ok);
  buzz(ok ? 12 : [18, 60, 18]);
  [...$("opts").children].forEach((b, n) => {
    b.setAttribute("aria-disabled", "true"); b.removeAttribute("aria-pressed");
    if (C.has(n)) { b.classList.add("ok"); if (!sel.has(n) && Array.isArray(x.a)) b.classList.add("missed"); }
    else if (sel.has(n)) b.classList.add("no"); else b.classList.add("dim");
  });
  $("check").hidden = true;
  const fb = $("fb"); fb.className = "fb " + (ok ? "good" : "bad");
  const cl = [...C].sort().map((n) => L[n]);
  $("verdict").textContent = ok ? t("quiz.correct")
    : cl.length > 1 ? t("quiz.wrongMany", { list: cl.slice(0, -1).join(", "), last: cl[cl.length - 1] }) : t("quiz.wrongOne", { a: cl[0] });
  const m = $("more"); m.innerHTML = "";
  if (x.e) m.appendChild(el("p", null, x.e));
  if (x.x) { const p = el("p"); p.append(el("strong", null, t("quiz.example")), el("span", null, x.x)); m.appendChild(p); }
  if (x.s) m.appendChild(el("div", "src", t("quiz.source") + x.s));
  m.hidden = !m.childNodes.length;
  $("pg").style.width = ((i + 1) / list.length) * 100 + "%";
  $("next").textContent = t(i === list.length - 1 ? "quiz.toResult" : "quiz.next");
  fb.hidden = false;
  // Room under the options, so the panel never covers them.
  $("quiz").style.paddingBottom = fb.offsetHeight + 16 + "px";
  $("next").focus({ preventScroll: true });
}
$("check").onclick = () => { if (!answered && picked.size) grade(new Set(picked)); };
$("next").onclick = () => { i++; i < list.length ? render() : finish(); };
// ✕ ends the round: with answers it shows the result so far, without any it just leaves.
$("quit").onclick = () => { list = list.slice(0, answered ? i + 1 : i); list.length ? finish() : leaveQuiz(); };

function finish() { stage = "end"; dir = "fwd"; showEnd(); dir = "fade"; window.scrollTo(0, 0); }
function showEnd() {
  show("end");
  const n = list.length, pct = Math.round((score / n) * 100);
  $("endRing").replaceChildren(ring(pct, pct + " %", "xl " + (pct >= 70 ? "good" : "low")));
  $("final").textContent = score + " / " + n;
  $("note").textContent = t(pct >= 90 ? "end.great" : pct >= 70 ? "end.good" : "end.low");
  const ul = $("miss"); ul.innerHTML = "";
  wrong.forEach((x) => {
    const li = el("li");
    li.append(el("div", null, x.q), el("div", "a", t("end.rightAnswer") + corr(x).map((k) => x.o[k]).join(" · ")));
    ul.appendChild(li);
  });
  $("missLabel").textContent = t("end.reviewN", { n: wrong.length });
  $("missWrap").hidden = !wrong.length; $("retry").hidden = !wrong.length;
  // One filled button: repeating the mistakes when there are any, the next round otherwise.
  $("again").classList.toggle("ghost", wrong.length > 0);
}
$("retry").onclick = () => start(shuffle(wrong));
$("again").onclick = () => learn(roundOf);
$("endBack").onclick = leaveQuiz;
document.addEventListener("keydown", (e) => {
  if ($("quiz").hidden || e.metaKey || e.ctrlKey || e.altKey) return;
  const n = "1234".indexOf(e.key) >= 0 ? "1234".indexOf(e.key) : "abcd".indexOf(e.key.toLowerCase());
  if (!answered && n >= 0 && n < order.length) { e.preventDefault(); answer(n); }
  else if (!answered && e.key === "Enter" && !$("check").hidden && picked.size) { e.preventDefault(); $("check").click(); }
  else if (answered && e.key === "Enter") { e.preventDefault(); $("next").click(); }
});

// ===== Profile: account, monthly limit, look (Kocky is the default; a saved choice, even the empty Účtovná kniha, wins)

// The browser's own bars take the page colour of the chosen look.
function paintChrome() {
  const m = document.querySelector('meta[name="theme-color"]');
  if (m) m.content = getComputedStyle(document.body).getPropertyValue("--paper").trim() || m.content;
}
function setLook(l) {
  if (l) document.body.dataset.look = l; else delete document.body.dataset.look;
  [...$("looks").querySelectorAll("button")].forEach((b) => b.setAttribute("aria-pressed", b.dataset.l === l));
  try { localStorage.setItem(LOOK_KEY, l); } catch (e) {}
  // Zošit is light only and Tabuľa dark only.
  const fixed = l === "zosit" || l === "tabula";
  [...$("themes").children].forEach((b) => (b.disabled = fixed));
  $("themeHint").hidden = !fixed;
  paintChrome();
}
function setTheme(th) {
  if (th) document.documentElement.dataset.theme = th; else delete document.documentElement.dataset.theme;
  const all = [...$("themes").children];
  all.forEach((b) => b.setAttribute("aria-pressed", b.dataset.th === th));
  $("themes").style.setProperty("--n", all.length);
  $("themes").style.setProperty("--i", Math.max(0, all.findIndex((b) => b.dataset.th === th)));
  try { localStorage.setItem(THEME_KEY, th); } catch (e) {}
  paintChrome();
}
$("looks").onclick = (e) => { const b = e.target.closest("button"); if (b) setLook(b.dataset.l); };
$("themes").onclick = (e) => { const b = e.target.closest("button"); if (b && !b.disabled) setTheme(b.dataset.th); };
let look0 = null, theme0 = ""; try { look0 = localStorage.getItem(LOOK_KEY); theme0 = localStorage.getItem(THEME_KEY) || ""; } catch (e) {}
setTheme(theme0 === "light" || theme0 === "dark" ? theme0 : "");
setLook(look0 == null ? "kocky" : look0);

// The account lives in Supabase, whose code loads only here and on the upload screen.
async function renderAccount() {
  $("pSign").hidden = true; $("pLimit").hidden = true; $("pWho").textContent = ""; $("pEmail").textContent = ""; $("pAvatar").textContent = "";
  $("pAvatar").classList.add("wait");
  const cloud = await import("../cloud/supabase.js");
  if (!cloud.configured) { $("pAvatar").classList.remove("wait"); $("pWho").textContent = t("upload.off"); return; }
  let s = null; try { s = await cloud.session(); } catch (e) {}
  $("pAvatar").classList.remove("wait");
  $("pSign").hidden = false;
  if (!s) {
    $("pEmail").textContent = t("profile.guest");
    $("pWho").textContent = t("profile.signedOut");
    $("pSign").className = "btn wide";
    $("pSign").textContent = t("upload.verify"); $("pSign").onclick = () => go("signin");
    return;
  }
  const email = s.user.email || "";
  $("pAvatar").textContent = email.slice(0, 1).toUpperCase();
  $("pEmail").textContent = email;
  $("pWho").textContent = t("profile.saved");
  $("pSign").className = "btn wide ghost";
  $("pSign").textContent = t("upload.signOut"); $("pSign").onclick = async () => { await cloud.signOut(); renderAccount(); toast(t("profile.signedOutToast")); };
  try {
    const u = (await cloud.call("usage", {}, getLang())).usage;
    const pct = u.limitUsd > 0 ? Math.min(100, Math.round((u.monthUsd / u.limitUsd) * 100)) : 0;
    $("pLimitBar").style.width = pct + "%"; $("pLimit").classList.toggle("warn", pct >= 80);
    $("pUsage").textContent = t("upload.usage", { pct, spent: "$" + u.monthUsd.toFixed(2), limit: "$" + u.limitUsd.toFixed(2) });
    $("pLimit").hidden = false;
  } catch (e) {}
}
function showProfile() { CUR = null; show("profile"); if (dir !== "none") renderAccount(); }

// ===== Upload

// With a subject id the files go into that subject instead of a new one.
function openUpload(target) { go(typeof target === "string" ? "upload/" + target : "upload"); }
// The upload screen loads its code (pdf.js, Supabase) only when opened. It is also where the student signs in;
// opened from Profile (signIn) it asks only for that and goes back.
function showUpload(target, signIn) {
  const into = target ? SUBJECTS.find((x) => x.id === target) : null;
  $("upTitle").textContent = t(signIn ? "upload.verify" : into ? "upload.addTitle" : "upload.title");
  $("upLede").textContent = t(signIn ? "profile.signedOut" : into ? "upload.addLede" : "upload.lede");
  $("upClose").onclick = () => back(signIn ? "profile" : into ? into.id : "");
  show("upload");
  import("../upload/ui.js").then((m) => m.open({
    target: into ? into.id : null, signIn: !!signIn,
    opened: (id) => { CUR = null; go(id, true); },
    done: () => { go("profile", true); toast(t("profile.signedInToast")); },
  }));
}

route();

// Subjects or progress arrived from the account (another device, or this one after its storage was cleared).
startSync(() => {
  if (!["today", "home", "subject"].includes(screen)) return;
  if (screen === "subject" && !loadSubjects().some((x) => x.id === CUR.id)) { go("subjects", true); return; }
  refresh();
});
