// The app's screens: Today, Subjects, one subject (topics, summaries), the summary reader,
// the multiple-choice quiz and Profile. The upload screen has its own module (src/upload/ui.js).
// How screens should look and behave: docs/design.md.
import { t, getLang, setLang } from "../i18n/index.js";
import { loadSubjects, saveSubjects, createSubject, readProgress, readLog, logAnswer, resetProgress, clearLocal, removeSamples, loadMeta, hasUnsynced, subjectFileCounts } from "./subjects.js";
import { startSync, syncNow, cancelSync, hasSessionToken } from "./autosync.js";
import { renderMarkdown, matchSummaryBlock, highlightMatch, buildWrongStudyPack, sourceFileIndex, stripSourceMeta } from "./md.js";
import { isProblem, correctAnswers, checkNumericAnswer } from "./problems.js";
import { icon } from "./icons.js";
import { rankExams, rankedRound, yearSpan, retagTopic, retagQuestion, matchTopic, FEW_EXAMS } from "./exams.js";
import { daysTo, questionStats, dueRound, dailyPlan } from "./plan.js";
import { renderLimit, limitInfo, getCachedUsage, setCachedUsage, isPlusActive } from "./limit.js";
import { openWelcome, syncAuthCopy } from "./welcome.js";
import { ensureSampleSubject, SAMPLE_ID } from "./sample.js";
import { clearPendingAuth } from "./auth-state.js";
import {
  initNativeShell, isNative, syncNativeChrome, haptic, minimizeApp,
  onHardwareBack, onOpenSubject, reminderPermission, requestReminderPermission,
  scheduleNativeReminders, cancelNativeReminders, registerServiceWorker,
} from "./native.js";
import { loadReminderPrefs, saveReminderPrefs, clearReminderPrefs, buildReminderSchedule } from "./reminders.js";
import { enableSheetSwipe, trackKeyboardViewport } from "./gestures.js";

const THEME_KEY = "studyapp-theme";
const LAST_KEY = "studyapp-last-subject";
const ENTERED_KEY = "studyapp-entered";
const ROUND = 20;      // questions in a "learn" round
const PROBLEM_ROUND = 6; // worked problems in a problem-only round
const SEARCH_FROM = 4; // summaries before the search box shows
const L = "ABCD";
// Options that refer to other options ("none of the above", "a) and b)") keep their order.
const PIN = /žiadn|žádn|všetk|všech|ani jedn|vyššie|výše|predchádzaj|předchoz|uveden.{0,10}možnost|\b[a-dA-D]\)|\b[a-dA-D] (?:aj|a) [a-dA-D]\b/i;

const $ = (id) => document.getElementById(id);
const corr = (x) => (Array.isArray(x.a) ? x.a : [x.a]);
const norm = (s) => String(s || "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

let SUBJECTS = [];
let CUR = null, QUESTIONS = [], TOPICS = {}, LOG = [];
let picked = new Set();
let list = [], i = 0, score = 0, wrong = [], answered = false, count = "20", topic = "all", mode = "all", kind = "all", order = [];
let probRevealed = false, probHintsShown = 0, probNumOk = null;
let P = {};
let tab = "overview", sortBy = "order", query = "", openTopic = null, subjectKind = "all";
let roundOf = null;   // what "next round" repeats: a topic key, RANKED, or null for the whole subject
const RANKED = "@exams"; // a round in the order of the past exam ranking
let stage = "quiz";   // the quiz entry shows a question ("quiz") or the result ("end")

function shuffle(a) { a = a.slice(); for (let k = a.length - 1; k > 0; k--) { const j = Math.floor(Math.random() * (k + 1)); [a[k], a[j]] = [a[j], a[k]]; } return a; }
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
function button(cls, text, onclick) { const b = el("button", cls, text); b.type = "button"; b.onclick = onclick; return b; }
// Slovak and Czech plurals: base.one (1), base.few (2 to 4), base.many (0, 5 and more).
const plural = (base, n, vars) => t(base + (n === 1 ? ".one" : n >= 2 && n <= 4 ? ".few" : ".many"), { n, ...vars });
const filterKind = (qs, k) => (k === "quiz" ? qs.filter((x) => !isProblem(x)) : k === "problem" ? qs.filter(isProblem) : qs);
const hasBothKinds = (qs) => qs.some(isProblem) && qs.some((x) => !isProblem(x));
const roundLimit = (qs) => (qs.length && qs.every(isProblem) ? PROBLEM_ROUND : ROUND);
function itemCountText(qs) {
  const p = qs.filter(isProblem).length, q = qs.length - p;
  return [q ? plural("exams.q", q) : "", p ? plural("subject.problems", p) : ""].filter(Boolean).join(" · ");
}
function bar(pct) { const b = el("span", "bar"), fill = el("i"); fill.style.width = pct + "%"; b.appendChild(fill); return b; }
initNativeShell();
trackKeyboardViewport();
registerServiceWorker();

// ===== Navigation: every screen is a history entry, so the back button always goes one step back
//
// Hashes: "" Today, "subjects", "profile", "upload", "upload/<subject>", "exams/<subject>", "signin", "<subject>",
// "<subject>/read/<file number>", "<subject>/quiz". history.state.d counts the steps taken inside the app,
// so back() knows whether there is somewhere to go back to. An open bottom sheet is an entry too.

const SCREENS = ["welcome", "today", "home", "subject", "reader", "template", "quiz", "end", "upload", "profile"];
const TAB_OF = { today: "today", home: "home", subject: "home", profile: "profile" };
const scrolls = new Map();
let dir = "fade", shown = null, screen = null, skipPop = false, booted = false, readerHint = null, readerFocus = null;
let tpId = null, tpIdx = 0, tpHintsShown = 0, tpStepsShown = 0, tpAllRevealed = false, tpBusy = false;
const hasEntered = () => {
  if (/[?&]autostart=1\b/.test(location.search)) return true;
  try { return localStorage.getItem(ENTERED_KEY) === "1"; } catch (e) { return false; }
};
const markEntered = () => { try { localStorage.setItem(ENTERED_KEY, "1"); } catch (e) {} };
const clearEntered = () => { try { localStorage.removeItem(ENTERED_KEY); } catch (e) {} };
try { history.scrollRestoration = "manual"; } catch (e) {}
// After a reload the sheet that was open is closed, so its entry is an ordinary one again.
if (history.state && history.state.sheet) history.replaceState({ d: history.state.d || 0 }, "");

const here = () => { try { return decodeURIComponent(location.hash.slice(1)); } catch (e) { return ""; } };
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
  document.body.classList.toggle("is-welcome", id === "welcome");
  $("tabbar").querySelectorAll(".tab").forEach((b) => { if (b.dataset.go === on) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current"); });
  const showAdd = SUBJECTS.length > 0;
  $("todayAdd").hidden = !showAdd;
  $("homeAdd").hidden = !showAdd;
  if (dir !== "none") {
    const s = $(id);
    s.classList.remove("in-fwd", "in-back", "in-fade"); void s.offsetWidth; s.classList.add("in-" + dir);
  }
  if (screen !== id) document.querySelectorAll("dialog[open]").forEach((d) => d.close());
  screen = id;
}

function route() {
  if (shown != null) scrolls.set(shown, window.scrollY);
  // The sign-in link comes back with ?code=..., which the upload screen turns into a session.
  const code = !booted && /[?&]code=/.test(location.search);
  // If local storage holds synced account data with no active session token, clear it so sign-out is clean.
  if (!code && !hasSessionToken() && loadMeta().user) {
    clearLocal(); clearEntered();
    try { localStorage.removeItem(LAST_KEY); } catch (e) {}
  }
  if (hasSessionToken() && removeSamples()) {
    try { if (localStorage.getItem(LAST_KEY) === SAMPLE_ID) localStorage.removeItem(LAST_KEY); } catch (e) {}
  }
  SUBJECTS = loadSubjects();
  const h = here();
  const y = dir === "none" ? window.scrollY : dir === "back" ? scrolls.get(h) || 0 : 0;
  const sj = SUBJECTS.find((x) => h === x.id || h.startsWith(x.id + "/"));
  booted = true;
  if (h === "welcome") showWelcome(false);
  else if (h === "signin" || h === "signup") showWelcome(true, h === "signup" ? "signup" : "login");
  else if (h.startsWith("upload/")) showUpload(h.slice(7));
  else if (h.startsWith("exams/")) showUpload(h.slice(6), false, "exams");
  else if (h.startsWith("templates/")) showUpload(h.slice(10), false, "templates");
  else if (h === "upload" || code) { markEntered(); showUpload(); }
  else if (h === "subjects") { markEntered(); showHome(); }
  else if (h === "profile") { markEntered(); showProfile(); }
  else if (sj) {
    markEntered();
    const [, sub, arg] = h.slice(sj.id.length).split("/");
    enter(sj);
    const file = sub === "read" ? (sj.files || [])[+arg] : null;
    const tpl = sub === "template" ? (sj.templates || []).find((x) => x.id === arg) : null;
    if (sub === "quiz" && !list.length) { go(sj.id, true); return; }
    if (sub === "review" && !wrong.length) { go(sj.id, true); return; }
    if (sub === "quiz") { if (stage === "end") showEnd(); else showQuiz(); }
    else if (sub === "review") showWrongReview();
    else if (tpl) showTemplate(tpl);
    else if (file && (file.summary || (file.context && file.text))) showReader(file, +arg);
    else showSubject();
  } else if (!SUBJECTS.length && !hasEntered() && !hasSessionToken()) showWelcome(false);
  else showToday();
  shown = h; dir = "fade";
  window.scrollTo(0, y);
  if (readerFocus) {
    const targetEl = readerFocus;
    readerFocus = null;
    requestAnimationFrame(() => targetEl.scrollIntoView({ behavior: "smooth", block: "center" }));
  }
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
  haptic("selection");
  if (b.dataset.go === "upload") openUpload();
  else { markEntered(); go({ today: "", home: "subjects", profile: "profile" }[b.dataset.go], true); }
};
const onHeaderAdd = () => { haptic("light"); openUpload(); };
$("todayAdd").onclick = onHeaderAdd;
$("homeAdd").onclick = onHeaderAdd;

// Hardware back button (Android): close sheet first, quit quiz, go back in history, or return to Today / minimize.
onHardwareBack(() => {
  const open = document.querySelector("dialog[open]");
  if (open) { closeSheet(open); return; }
  if (screen === "quiz") { $("quit").click(); return; }
  if (screen === "end") { leaveQuiz(); return; }
  if (depth() > 0) { history.back(); return; }
  if (screen === "reader" || screen === "template" || screen === "upload") { go(CUR ? CUR.id : "", true); return; }
  if (screen === "subject") { go("subjects", true); return; }
  if (screen === "home" || screen === "profile") { go("", true); return; }
  minimizeApp();
});

// Tapping a local study reminder notification opens the targeted subject directly.
onOpenSubject((subjectId) => {
  SUBJECTS = loadSubjects();
  if (SUBJECTS.some((x) => x.id === subjectId)) { markEntered(); go(subjectId, true); }
  else { markEntered(); go("", true); }
});

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
  // A sheet closes with its ✕ button, a tap outside, swipe down on touch, Esc or the back button.
  d.addEventListener("click", (e) => { if (e.target === d || e.target.closest("[data-close]")) closeSheet(d); });
  d.addEventListener("cancel", (e) => { e.preventDefault(); closeSheet(d); });
  d.addEventListener("close", () => {
    d.classList.remove("closing");
    if (history.state && history.state.sheet) { skipPop = true; history.back(); }
  });
  enableSheetSwipe(d, closeSheet);
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

// Stats and rounds follow the answer log's spaced-repetition intervals alongside accuracy.
const stats = (qs, log = []) => questionStats(qs, log);
const examTopicOrder = (sj) => ((sj && sj.exams && sj.exams.length) ? rankExams(sj.exams, sj.topics).map((r) => r.topic).filter(Boolean) : []);
const smartRound = (qs, log = [], n = ROUND, topicOrder = []) => dueRound(qs, log, { limit: n, shuffle, topicOrder });
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

// What an empty app shows: one sentence and the button that fixes it.
const hasReadableFiles = (sj) => (sj.files || []).some((f) => f.summary || (f.context && f.text));
const hasMaterials = (sj) => sj.questions.length > 0 || hasReadableFiles(sj) || (sj.exams || []).length > 0 || (sj.templates || []).length > 0;
function emptyState() {
  const box = el("div", "empty big");
  const art = el("span", "empty-art");
  art.appendChild(icon("up"));
  const actions = el("div", "empty-actions");
  actions.append(
    button("btn wide sj add", t("home.empty.go"), () => openUpload()),
    button("btn wide ghost", t("subject.createEmpty"), () => openNewSubject()),
  );
  box.append(art, el("h2", null, t("home.empty.title")), el("p", null, t("home.empty.text")), actions);
  return box;
}
function countdown(sj) {
  const d = daysTo(sj.exam);
  if (d == null || d < 0) return null;
  const box = el("div", "countdown" + (d <= 7 ? " soon" : ""));
  box.append(el("b", null, d === 0 ? t("today.cdToday") : d === 1 ? t("today.cdTomorrow") : String(d)),
    el("span", null, (d < 2 ? t("today.cdExam") : t(d < 5 ? "today.cdFew" : "today.cdMany")) + " · " + examDate(sj)));
  return box;
}
function renderToday() {
  const box = $("todayBody"); box.innerHTML = ""; $("subjects").innerHTML = "";
  $("todayDate").textContent = new Date().toLocaleDateString(getLang(), { weekday: "long", day: "numeric", month: "long" });
  if (!SUBJECTS.length) { box.appendChild(emptyState()); return; }
  let last = ""; try { last = localStorage.getItem(LAST_KEY) || ""; } catch (e) {}
  const rows = SUBJECTS.map((sj) => {
    const log = readLog(sj);
    return { sj, log, st: stats(sj.questions, log), d: daysTo(sj.exam) };
  });
  const withQ = rows.filter((r) => r.st.total);
  // The big card is the subject with the nearest exam, or else the one opened last.
  const soon = withQ.filter((r) => r.d != null && r.d >= 0).sort((a, b) => a.d - b.d)[0];
  const hero = soon || withQ.find((r) => r.sj.id === last) || withQ[0];
  if (hero) {
    const plan = dailyPlan(hero.sj.questions, hero.log, hero.sj.exam, { roundSize: roundLimit(hero.sj.questions) });
    const c = el("div", "sheet hero");
    const open = button("hero-open", null, () => go(hero.sj.id));
    const names = el("span", "grow");
    names.append(el("span", "hero-name", hero.sj.name));
    open.append(names, icon("chev"));
    c.appendChild(open);
    const mid = el("div", "hero-mid");
    const cd = countdown(hero.sj);
    if (cd) mid.appendChild(cd);
    else {
      const chip = button("hero-chip", null, () => { enter(hero.sj); openExam(); });
      chip.append(icon("cal"), el("span", null, t("exam.add")));
      mid.appendChild(chip);
    }
    const prog = el("div", "hero-prog");
    const progTop = el("div", "hero-prog-top");
    progTop.append(el("b", null, pctLabel(hero.st)));
    prog.append(progTop, bar(hero.st.pct));
    mid.appendChild(prog);
    const topicOrder = examTopicOrder(hero.sj);
    const basePlan = plan.hasExam
      ? (plan.target > 0
        ? (plan.reviewNow > 0 && plan.newToday > 0
          ? t("today.planBoth", { n: plan.target, rev: plan.reviewNow, fresh: plan.newToday })
          : t(plan.reviewNow > 0 ? "today.planReview" : "today.planNew", { n: plan.target }))
        : (plan.nextReviewDays ? t("today.planDoneNext", { days: plan.nextReviewDays }) : t("today.planDone")))
      : (plan.reviewNow > 0
        ? t("today.roundDue", { n: plan.roundCount, rev: plan.reviewNow })
        : hero.st.due === 0 ? t("today.roundAllOk", { n: plan.roundCount }) : t("today.round", { n: plan.roundCount }));
    const planLine = plan.hasExam && plan.target > 0 && topicOrder.length ? basePlan + " " + t("today.examOrder") : basePlan;
    c.append(mid, el("p", "hint", planLine));
    const start = button("btn wide", null, () => { enter(hero.sj); learn(null, plan.roundCount); });
    start.append(icon("play"), el("span", null, t("today.start")));
    c.appendChild(start);
    box.appendChild(c);
  }
  const rest = rows.filter((r) => r !== hero).sort((a, b) => (a.d != null && a.d >= 0 ? a.d : 1e9) - (b.d != null && b.d >= 0 ? b.d : 1e9));
  if (rest.length) {
    box.appendChild(el("p", "label", t(hero ? "today.others" : "home.title")));
    const listBox = el("div", "list");
    rest.forEach((r) => {
      // The row opens the subject; its play button starts a round straight away.
      const row = el("div", "rowcard split");
      const main = button("rc-main", null, () => go(r.sj.id));
      const g = el("span", "grow");
      const head = el("span", "rc-head");
      head.append(el("span", "rc-title", r.sj.name));
      if (r.st.total) head.append(el("span", "rc-pct", r.st.pct + " %"));
      const subLine = examText(r.sj) || (r.st.total ? dueText(r.st) : hasReadableFiles(r.sj) ? t("today.read") : hasMaterials(r.sj) ? t("home.noQuestions") : t("home.noMaterials"));
      g.append(head, el("span", "hint" + soonClass(r.sj), subLine));
      if (r.st.total) g.append(bar(r.st.pct));
      main.append(g);
      row.appendChild(main);
      if (r.st.total) {
        const play = button("play", null, () => { enter(r.sj); learn(); });
        play.setAttribute("aria-label", t("today.practise", { name: r.sj.name })); play.appendChild(icon("play"));
        row.appendChild(play);
      } else main.appendChild(icon("chev", "chev"));
      listBox.appendChild(row);
    });
    box.appendChild(listBox);
  }
}
function showToday() { CUR = null; renderToday(); show("today"); }

// ===== Subjects

function subjectRow(sj) {
  const st = stats(sj.questions, readLog(sj));
  const b = button("rowcard sj", null, () => go(sj.id));
  const g = el("span", "grow");
  const head = el("span", "rc-head");
  head.append(el("span", "rc-title", sj.name));
  if (st.total) head.append(el("span", "rc-pct", st.pct + " %"));
  g.append(head);
  const ex = examText(sj);
  if (ex) g.appendChild(el("span", "hint" + soonClass(sj), ex));
  g.appendChild(el("span", "hint", st.total ? dueText(st) : hasMaterials(sj) ? t("home.noQuestions") : t("home.noMaterials")));
  if (st.total) g.appendChild(bar(st.pct));
  b.append(g, icon("chev", "chev"));
  return b;
}
function showHome() {
  CUR = null;
  const box = $("subjects"); box.innerHTML = ""; $("todayBody").innerHTML = "";
  SUBJECTS.forEach((sj) => box.appendChild(subjectRow(sj)));
  if (!SUBJECTS.length) box.appendChild(emptyState());
  $("homeNew").hidden = !SUBJECTS.length;
  show("home");
}

function clearNewSubjErr() {
  $("newSubjErr").hidden = true;
  $("newSubjErr").textContent = "";
  $("newSubjName").removeAttribute("aria-invalid");
  $("newSubjName").removeAttribute("aria-describedby");
}
function openNewSubject() {
  $("newSubjName").value = "";
  clearNewSubjErr();
  openSheet($("newSubjectSheet"));
  requestAnimationFrame(() => $("newSubjName").focus());
}
$("homeNew").onclick = () => { haptic("light"); openNewSubject(); };
$("newSubjName").oninput = clearNewSubjErr;
$("newSubjForm").onsubmit = (e) => {
  e.preventDefault();
  const name = $("newSubjName").value.trim();
  if (!name) {
    $("newSubjErr").textContent = t("subject.nameRequired");
    $("newSubjErr").hidden = false;
    $("newSubjName").setAttribute("aria-invalid", "true");
    $("newSubjName").setAttribute("aria-describedby", "newSubjErr");
    $("newSubjName").focus();
    return;
  }
  const sj = createSubject(name);
  saveSubjects([...loadSubjects(), sj]);
  markEntered();
  haptic("success");
  go(sj.id);
  toast(t("subject.created"));
};

// ===== One subject

function enter(sj) {
  if (!CUR || CUR.id !== sj.id) { topic = "all"; mode = "all"; kind = "all"; subjectKind = "all"; list = []; query = ""; tab = "overview"; openTopic = null; }
  CUR = sj; QUESTIONS = sj.questions; TOPICS = sj.topics;
  LOG = readLog(sj);
  P = readProgress(sj);
  try { localStorage.setItem(LAST_KEY, sj.id); } catch (e) {}
}
const summaries = () => (CUR.files || []).filter((f) => f.summary || (f.context && f.text));
const topicKeys = () => Object.keys(TOPICS).filter((k) => {
  const it = (CUR.topicInfo || {})[k];
  return QUESTIONS.some((x) => x.t === k) || (it && (it.summary || (it.weakSpots || []).length));
});

function renderSubject() {
  const mixed = hasBothKinds(QUESTIONS);
  if (!mixed) subjectKind = "all";
  const activeQs = filterKind(QUESTIONS, subjectKind);
  const st = stats(activeQs, LOG), files = summaries().length, fc = subjectFileCounts(CUR.files);
  $("sName").textContent = CUR.name;
  const templates = CUR.templates || [];
  $("sMeta").textContent = [
    itemCountText(QUESTIONS),
    fc.summaries ? t("subject.summaries", { n: fc.summaries }) : "",
    fc.context ? t("subject.contextCount", { n: fc.context }) : "",
    templates.length ? plural("templates.count", templates.length) : "",
  ].filter(Boolean).join(" · ");
  // Only the tabs that have something to show.
  const hasAny = hasMaterials(CUR);
  const has = { overview: topicKeys().length > 0, files: files > 0, exams: hasAny, templates: hasAny };
  const open = Object.keys(has).filter((k) => has[k]);
  $("sCard").hidden = false;
  $("sStat").hidden = !QUESTIONS.length; $("sActions").hidden = !QUESTIONS.length;
  $("sKind").hidden = !mixed;
  if (mixed) {
    const btns = [...$("sKind").children];
    btns.forEach((b) => b.setAttribute("aria-pressed", b.dataset.k === subjectKind));
    $("sKind").style.setProperty("--n", btns.length);
    $("sKind").style.setProperty("--i", Math.max(0, btns.findIndex((b) => b.dataset.k === subjectKind)));
  }
  const onlyProbs = subjectKind === "problem" || (QUESTIONS.length > 0 && QUESTIONS.every(isProblem));
  $("learn").lastElementChild.textContent = t(onlyProbs ? "subject.learnProblems" : "subject.learn");
  $("sPct").textContent = pctLabel(st);
  $("sDue").textContent = dueText(st);
  $("sBar").style.width = st.pct + "%";
  $("sExamText").textContent = examText(CUR) || t("exam.add");
  $("sExam").className = "chiprow" + (CUR.exam ? soonClass(CUR) : " unset");
  if (!has[tab]) tab = open[0] || "overview";
  const tabs = [...$("sTabs").children];
  tabs.forEach((b) => {
    const active = b.dataset.tab === tab;
    b.hidden = !has[b.dataset.tab];
    b.setAttribute("aria-selected", active);
    b.setAttribute("aria-pressed", active);
  });
  $("sTabs").hidden = open.length < 2;
  $("sEmpty").hidden = open.length > 0;
  $("tabOverview").hidden = tab !== "overview" || !has.overview;
  $("tabFiles").hidden = tab !== "files" || !has.files;
  $("tabExams").hidden = tab !== "exams" || !has.exams;
  $("tabTemplates").hidden = tab !== "templates" || !has.templates;
  if (!$("tabOverview").hidden) renderOverview();
  if (!$("tabFiles").hidden) renderFiles();
  if (!$("tabExams").hidden) renderExams();
  if (!$("tabTemplates").hidden) renderTemplates();
}
function showSubject() { renderSubject(); show("subject"); }
$("sKind").onclick = (e) => { const b = e.target.closest("button"); if (b && b.dataset.k !== subjectKind) { subjectKind = b.dataset.k; renderSubject(); } };
$("sTabs").onclick = (e) => { const b = e.target.closest("button"); if (b) { tab = b.dataset.tab; renderSubject(); } };
$("sBack").onclick = () => back("subjects");
$("sEmptyAdd").onclick = () => openUpload(CUR.id);
$("sEmptyExams").onclick = () => openUpload(CUR.id, "exams");
$("sEmptyTemplates").onclick = () => openUpload(CUR.id, "templates");

// Topics from the weakest. A topic opens to its summary, weak spots and a button that practises it.
function renderOverview() {
  const info = CUR.topicInfo || {};
  const rows = topicKeys().map((k) => {
    const tQs = filterKind(QUESTIONS.filter((x) => x.t === k), subjectKind);
    return { k, tQs, st: stats(tQs, LOG), it: info[k] || {} };
  }).sort((a, b) => (a.st.total ? a.st.pct : 101) - (b.st.total ? b.st.pct : 101));
  $("tbars").replaceChildren(...rows.map(({ k, tQs, st, it }) => {
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
    if (st.total) head.append(bar(st.pct), el("span", "hint", itemCountText(tQs) + " · " + dueText(st)));
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
  if (sortBy === "az") rows.sort((x, y) => x.name.localeCompare(y.name, getLang()));
  if (sortBy === "long") rows.sort((x, y) => y.size - x.size);
  $("files").replaceChildren(...rows.map(({ f, name }) => {
    const b = button("rowcard file", null, () => { readerHint = null; go(CUR.id + "/read/" + CUR.files.indexOf(f)); });
    const g = el("span", "grow"), art = el("span", "file-art");
    art.appendChild(icon("doc"));
    const pageHint = f.context ? t("study.contextPages", { before: f.pagesBefore }) : t("study.pages", { before: f.pagesBefore, after: String(f.pagesAfter).replace(".", ",") });
    g.append(el("span", "rc-title", name), el("span", "hint", pageHint));
    b.append(art, g, icon("chev", "chev"));
    b.dataset.text = norm([f.title, f.name, f.summary || f.text, ...(f.keyTerms || []).map((k) => k.term + " " + k.meaning)].join(" "));
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

// ===== Past exams: which topics the old exams asked about, how often, and a round in that order

function saveExams(exams, msg) {
  CUR.exams = exams;
  saveSubjects(loadSubjects().map((x) => (x.id === CUR.id ? { ...x, exams } : x)));
  renderSubject();
  if (msg) toast(t(msg));
}
// Topic names a question can be moved to: the subject's topics, then the other names the exams use.
function topicChoices() {
  const out = Object.keys(TOPICS).filter((k) => k !== "t0").map((k) => TOPICS[k]);
  (CUR.exams || []).forEach((ex) => ex.questions.forEach((q) => {
    if (!matchTopic(q.topic, TOPICS) && !out.some((n) => n.toLowerCase() === q.topic.toLowerCase())) out.push(q.topic);
  }));
  return out;
}
function topicSelect(current, onpick, placeholder) {
  const sel = el("select", "search");
  sel.setAttribute("aria-label", t("exams.moveTo"));
  if (placeholder) sel.append(new Option(placeholder, ""));
  topicChoices().forEach((n) => sel.append(new Option(n, n)));
  sel.value = current;
  sel.onchange = () => { if (sel.value) onpick(sel.value); };
  return sel;
}
// Fills the past exam sheet; opens it when it is not open yet (a history entry, so back closes it).
function pastSheet(title, nodes) {
  $("xTitle").textContent = title;
  $("xBody").replaceChildren(...nodes);
  if (!$("pastSheet").open) openSheet($("pastSheet"));
}
const examLine = (q) => [q.year || "", q.n ? t("exams.task", { n: q.n }) : "", q.points ? t("exams.points", { n: q.points }) : ""].filter(Boolean).join(" · ");
// One old exam question: its wording, where it is from, and a choice of topic. after() redraws the sheet.
function examQuestion(q, after) {
  const li = el("li");
  const name = TOPICS[matchTopic(q.topic, TOPICS)] || q.topic;
  li.append(el("div", null, q.text));
  const line = examLine(q); if (line) li.append(el("div", "hint", line));
  li.append(topicSelect(name, (to) => { saveExams(retagQuestion(CUR.exams, q.id, to), "exams.movedToast"); after(); }));
  return li;
}
const askedIn = (r) => (r.of > 1 ? t("exams.inN", { n: r.exams, of: r.of }) : t("exams.inOne"));
function addExamsButton(label, cls) {
  const b = button(cls, null, () => openUpload(CUR.id, "exams"));
  b.append(icon("plus"), el("span", null, t(label)));
  return b;
}

function renderExams() {
  const box = $("tabExams"), exams = CUR.exams || [];
  if (!exams.length) {
    // Empty state: one sentence and the button that fixes it.
    const c = el("div", "empty");
    const art = el("span", "empty-art"); art.appendChild(icon("doc"));
    c.append(art, el("p", null, t("exams.emptyText")), addExamsButton("exams.add", "btn"), el("p", "hint", t("exams.honest")));
    box.replaceChildren(c);
    return;
  }
  const rank = rankExams(exams, TOPICS), top = rank.length ? rank[0].score : 1;
  const span = yearSpan(exams);
  const head = [el("p", "label", t("exams.rankLabel")), el("p", "hint", plural("exams.sample", exams.length, { years: span ? " (" + span + ")" : "" }))];
  if (exams.length < FEW_EXAMS) head.push(el("p", "tipbox", t("exams.few", { n: FEW_EXAMS })));
  const rows = el("div", "stack ranks");
  rank.forEach((r, k) => {
    const b = button("tbar rank", null, () => openExamTopic(r.id));
    const t1 = el("span", "tbar-top");
    t1.append(el("span", null, (k + 1) + ". " + r.name), el("span", "hint", askedIn(r)), icon("chev", "chev"));
    const sub = [plural("exams.q", r.questions.length), r.points ? t("exams.points", { n: r.points }) : "", r.topic ? "" : t("exams.noMaterial")];
    b.append(t1, bar(Math.max(4, Math.round((r.score / top) * 100))), el("span", "hint", sub.filter(Boolean).join(" · ")));
    rows.appendChild(b);
  });
  const out = [...head, rows];
  if (rank.some((r) => r.topic && QUESTIONS.some((x) => x.t === r.topic))) {
    const go = button("btn wide ghost", null, () => learn(RANKED));
    go.append(icon("play"), el("span", null, t("exams.practise")));
    out.push(go);
  }
  out.push(el("p", "hint", t("exams.honest")), el("p", "label", t("exams.listLabel")));
  const exList = el("div", "list");
  exams.slice().sort((a, b) => (b.year || 0) - (a.year || 0) || a.name.localeCompare(b.name)).forEach((ex) => {
    const b = button("rowcard file", null, () => openPastExam(ex.id));
    const g = el("span", "grow"), art = el("span", "file-art");
    art.appendChild(icon("doc"));
    g.append(el("span", "rc-title", ex.name), el("span", "hint", [ex.year || t("exams.noYear"), plural("exams.q", ex.questions.length)].join(" · ")));
    b.append(art, g, icon("chev", "chev"));
    exList.appendChild(b);
  });
  out.push(exList, addExamsButton("exams.addMore", "btn wide ghost"));
  box.replaceChildren(...out);
}

// One topic of the ranking: the old questions it covers, a round on it, or a link to a topic of the materials.
function openExamTopic(id) {
  const r = rankExams(CUR.exams || [], TOPICS).find((x) => x.id === id);
  if (!r) { closeSheet($("pastSheet")); return; }
  const again = () => openExamTopic(id);
  const nodes = [el("p", "hint", [askedIn(r), plural("exams.q", r.questions.length)].join(" · "))];
  if (r.topic && QUESTIONS.some((x) => x.t === r.topic)) {
    const go = button("btn wide", null, () => learn(r.topic));
    go.append(icon("play"), el("span", null, t("exams.practiseTopic")));
    nodes.push(go);
  }
  if (!r.topic) {
    nodes.push(el("p", "tipbox", t("exams.unlinked")));
    if (Object.keys(TOPICS).some((k) => k !== "t0")) {
      nodes.push(el("p", "label", t("exams.linkLabel")),
        topicSelect("", (to) => { saveExams(retagTopic(CUR.exams, r.name, to, TOPICS), "exams.linkedToast"); closeSheet($("pastSheet")); }, t("exams.linkPick")));
    }
  }
  const ul = el("ul", "miss");
  r.questions.forEach((q) => ul.appendChild(examQuestion(q, again)));
  nodes.push(el("p", "label", t("exams.oldQuestions")), ul);
  pastSheet(r.name, nodes);
}

// One uploaded exam: its year, its questions with their topics, and deleting it.
function openPastExam(id) {
  const ex = (CUR.exams || []).find((x) => x.id === id);
  if (!ex) { closeSheet($("pastSheet")); return; }
  const again = () => openPastExam(id);
  const year = el("input", "search");
  Object.assign(year, { type: "number", inputMode: "numeric", min: 1990, max: new Date().getFullYear() + 1, value: ex.year || "", placeholder: t("upload.year") });
  year.id = "xYear";
  year.onchange = () => {
    const y = parseInt(year.value, 10);
    saveExams(CUR.exams.map((x) => (x.id === id ? { ...x, year: y >= 1990 && y <= 2100 ? y : null } : x)), "exams.yearToast");
  };
  const lab = el("label", "label", t("exams.year")); lab.htmlFor = "xYear";
  const nodes = [lab, year];
  if (ex.unreadable) nodes.push(el("p", "tipbox", t("exams.unreadable", { what: ex.unreadable })));
  const ul = el("ul", "miss");
  ex.questions.forEach((q) => ul.appendChild(examQuestion({ ...q, year: null }, again)));
  nodes.push(el("p", "label", plural("exams.q", ex.questions.length)), ul);
  // Deleting asks once, in place, and says what is lost.
  const del = button("btn ghost danger wide", t("exams.delete"), () => { del.hidden = true; sure.hidden = false; });
  const sure = el("div", "confirm"); sure.hidden = true;
  sure.append(el("span", null, t("exams.deleteConfirm")),
    button("tiny danger", t("setup.yes"), () => { closeSheet($("pastSheet")); saveExams(CUR.exams.filter((x) => x.id !== id), "exams.deletedToast"); }),
    button("tiny", t("setup.no"), () => { del.hidden = false; sure.hidden = true; }));
  nodes.push(del, sure);
  pastSheet(ex.name, nodes);
}

// ===== Worked-example templates: upload a workbook or own workings, generate up to 2 similar problems

const MAX_TPL_PROBLEMS = 2;

function saveTemplates(templates, msg) {
  CUR.templates = templates;
  saveSubjects(loadSubjects().map((x) => (x.id === CUR.id ? { ...x, templates } : x)));
  if (msg) toast(t(msg));
}

function addTemplatesButton(label, cls) {
  const b = button(cls, null, () => openUpload(CUR.id, "templates"));
  b.append(icon("plus"), el("span", null, t(label)));
  return b;
}

function renderTemplates() {
  const box = $("tabTemplates"), templates = CUR.templates || [];
  if (!templates.length) {
    const c = el("div", "empty");
    const art = el("span", "empty-art"); art.appendChild(icon("doc"));
    c.append(art, el("p", null, t("templates.emptyText")), addTemplatesButton("templates.add", "btn"));
    box.replaceChildren(c);
    return;
  }
  const listBox = el("div", "list");
  templates.forEach((tpl) => {
    const count = (tpl.problems || []).length;
    const b = button("rowcard file", null, () => go(CUR.id + "/template/" + tpl.id));
    const g = el("span", "grow"), art = el("span", "file-art");
    art.appendChild(icon("doc"));
    const meta = [tpl.topic, tpl.source, t("templates.generated", { n: count, max: MAX_TPL_PROBLEMS })].filter(Boolean).join(" · ");
    g.append(el("span", "rc-title", tpl.title), el("span", "hint", meta));
    b.append(art, g, icon("chev", "chev"));
    listBox.appendChild(b);
  });
  box.replaceChildren(el("p", "label", t("templates.listLabel")), listBox, addTemplatesButton("templates.addMore", "btn wide ghost"));
}

function currentTemplate() {
  return (CUR && (CUR.templates || []).find((x) => x.id === tpId)) || null;
}

function resetTemplateProgress() {
  tpHintsShown = 0; tpStepsShown = 0; tpAllRevealed = false;
  $("tpInput").value = ""; $("tpInput").disabled = false; $("tpInput").removeAttribute("aria-invalid");
  $("tpCheck").disabled = false;
  $("tpCheckNote").hidden = true; $("tpCheckNote").textContent = ""; $("tpCheckNote").className = "hint prob-note";
  $("tpHints").innerHTML = ""; $("tpHints").hidden = true;
}

function renderTemplateProblem(tpl) {
  const probs = tpl.problems || [];
  const hasProbs = probs.length > 0;
  const sw = $("tpSwitch");
  sw.hidden = probs.length < 2;
  if (probs.length >= 2) {
    const btns = [...sw.children];
    btns.forEach((b, k) => b.setAttribute("aria-pressed", k === tpIdx ? "true" : "false"));
    sw.style.setProperty("--n", btns.length);
    sw.style.setProperty("--i", Math.max(0, Math.min(tpIdx, btns.length - 1)));
  }
  $("tpEmpty").hidden = hasProbs;
  $("tpProb").hidden = !hasProbs;

  const genBtn = $("tpGen");
  const atMax = probs.length >= MAX_TPL_PROBLEMS;
  genBtn.hidden = atMax;
  $("tpDoneNote").hidden = !atMax;
  if (!atMax) {
    genBtn.disabled = tpBusy;
    const nextN = probs.length + 1;
    genBtn.textContent = tpBusy
      ? t("templates.generating")
      : nextN === 1
        ? t("templates.genFirst", { max: MAX_TPL_PROBLEMS })
        : t("templates.genSecond", { n: nextN, max: MAX_TPL_PROBLEMS });
  }

  if (!hasProbs) return;
  const p = probs[tpIdx] || probs[0];
  $("tpQ").textContent = p.q;
  const hasCheck = Boolean(p.check && typeof p.check.num === "number" && Number.isFinite(p.check.num));
  $("tpCheckWrap").hidden = !hasCheck;
  $("tpUnit").textContent = p.check?.unit || "";
  $("tpUnit").hidden = !(p.check && p.check.unit);

  const hints = Array.isArray(p.hints) ? p.hints : [];
  const hintBtn = $("tpHintBtn");
  const canHint = !tpAllRevealed && hints.length > 0 && tpHintsShown < hints.length;
  hintBtn.hidden = !canHint;
  if (canHint) {
    hintBtn.textContent = tpHintsShown === 0
      ? t("quiz.probHint", { n: hints.length })
      : t("quiz.probNextHint", { i: tpHintsShown + 1, n: hints.length });
  }

  const steps = Array.isArray(p.steps) ? p.steps : [];
  const stepBtn = $("tpStepBtn");
  const revealBtn = $("tpRevealBtn");
  const moreSteps = !tpAllRevealed && tpStepsShown < steps.length;
  stepBtn.hidden = !moreSteps;
  if (moreSteps) {
    stepBtn.textContent = t("templates.nextStep", { i: tpStepsShown + 1, n: steps.length });
  }
  revealBtn.hidden = tpAllRevealed;
  $("tpActions").hidden = hintBtn.hidden && stepBtn.hidden && revealBtn.hidden;

  const shownSteps = tpAllRevealed ? steps : steps.slice(0, tpStepsShown);
  const ol = $("tpSteps"); ol.innerHTML = "";
  shownSteps.forEach((s) => ol.appendChild(el("li", null, s)));
  $("tpAns").textContent = p.ans || "";
  $("tpAnsWrap").hidden = !tpAllRevealed;
  $("tpExplain").textContent = p.e || "";
  $("tpExplain").hidden = !tpAllRevealed || !p.e;
  $("tpSol").hidden = !shownSteps.length && !tpAllRevealed;
}

function showTemplate(tpl) {
  const changedTpl = tpId !== tpl.id;
  tpId = tpl.id;
  const probs = tpl.problems || [];
  if (changedTpl) {
    tpIdx = Math.max(0, probs.length - 1);
    resetTemplateProgress();
  } else if (tpIdx >= probs.length) {
    tpIdx = Math.max(0, probs.length - 1);
  }
  $("tpTitle").textContent = tpl.title;
  $("tpMeta").textContent = [tpl.topic, tpl.source].filter(Boolean).join(" · ");
  $("tpPrompt").textContent = tpl.prompt || "";
  const method = tpl.method || [];
  $("tpMethod").replaceChildren(...method.map((s) => el("li", null, s)));
  $("tpMethodWrap").hidden = !method.length;
  $("tpExample").textContent = tpl.example || "";
  $("tpExampleWrap").hidden = !tpl.example;
  $("tpUnreadable").textContent = tpl.unreadable ? t("exams.unreadable", { what: tpl.unreadable }) : "";
  $("tpUnreadable").hidden = !tpl.unreadable;
  $("tpRef").open = !probs.length;
  $("tpDel").hidden = false;
  $("tpDelConfirm").hidden = true;
  $("tpErr").hidden = true; $("tpErr").textContent = "";
  renderTemplateProblem(tpl);
  show("template");
}

function templateErrorText(e) {
  if (e && e.code) {
    const k = "upload.err." + e.code;
    if (t(k) !== k) return t(k, { msg: e.message || "" });
  }
  return t("upload.err.server", { msg: (e && e.message) || String(e) });
}

$("tpBack").onclick = () => back(CUR ? CUR.id : "subjects");
$("tpSwitch").onclick = (e) => {
  const b = e.target.closest("button");
  const tpl = currentTemplate();
  if (!b || !tpl) return;
  const next = +b.dataset.v;
  if (next === tpIdx || next < 0 || next >= (tpl.problems || []).length) return;
  tpIdx = next;
  resetTemplateProgress();
  renderTemplateProblem(tpl);
};
$("tpHintBtn").onclick = () => {
  const tpl = currentTemplate();
  const p = tpl && (tpl.problems || [])[tpIdx];
  if (!p || tpAllRevealed) return;
  const hints = Array.isArray(p.hints) ? p.hints : [];
  if (tpHintsShown >= hints.length) return;
  const row = el("div", "prob-hint");
  row.append(el("span", "label", t("quiz.probHintN", { n: tpHintsShown + 1 })), el("p", null, hints[tpHintsShown]));
  $("tpHints").appendChild(row);
  $("tpHints").hidden = false;
  tpHintsShown++;
  renderTemplateProblem(tpl);
};
$("tpStepBtn").onclick = () => {
  const tpl = currentTemplate();
  const p = tpl && (tpl.problems || [])[tpIdx];
  if (!p || tpAllRevealed) return;
  const steps = Array.isArray(p.steps) ? p.steps : [];
  tpStepsShown = Math.min(steps.length, tpStepsShown + 1);
  if (tpStepsShown >= steps.length) tpAllRevealed = true;
  renderTemplateProblem(tpl);
};
$("tpRevealBtn").onclick = () => {
  const tpl = currentTemplate();
  const p = tpl && (tpl.problems || [])[tpIdx];
  if (!p) return;
  tpStepsShown = (p.steps || []).length;
  tpAllRevealed = true;
  renderTemplateProblem(tpl);
};
$("tpCheck").onclick = () => {
  const tpl = currentTemplate();
  const p = tpl && (tpl.problems || [])[tpIdx];
  if (!p || !p.check) return;
  const raw = $("tpInput").value.trim();
  if (!raw) { $("tpRevealBtn").click(); return; }
  const res = checkNumericAnswer(raw, p.check);
  if (res == null) {
    $("tpInput").setAttribute("aria-invalid", "true");
    $("tpCheckNote").textContent = t("quiz.probInvalidNum");
    $("tpCheckNote").className = "hint prob-note bad";
    $("tpCheckNote").hidden = false;
    $("tpInput").focus();
    return;
  }
  $("tpCheckNote").textContent = t(res ? "quiz.probMatch" : "quiz.probMismatch");
  $("tpCheckNote").className = "hint prob-note " + (res ? "good" : "bad");
  $("tpCheckNote").hidden = false;
  haptic(res ? "success" : "error");
};
$("tpInput").oninput = () => { $("tpInput").removeAttribute("aria-invalid"); $("tpCheckNote").hidden = true; };
$("tpInput").onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); $("tpCheck").click(); } };
$("tpDel").onclick = () => { $("tpDel").hidden = true; $("tpDelConfirm").hidden = false; };
$("tpDelNo").onclick = () => { $("tpDel").hidden = false; $("tpDelConfirm").hidden = true; };
$("tpDelYes").onclick = () => {
  if (!CUR || !tpId) return;
  const next = (CUR.templates || []).filter((x) => x.id !== tpId);
  saveTemplates(next, "templates.deletedToast");
  tab = "templates";
  back(CUR.id);
};
$("tpGen").onclick = async () => {
  const tpl = currentTemplate();
  if (!tpl || tpBusy || (tpl.problems || []).length >= MAX_TPL_PROBLEMS) return;
  const sid = CUR.id, tid = tpl.id;
  tpBusy = true;
  $("tpErr").hidden = true; $("tpErr").textContent = "";
  renderTemplateProblem(tpl);
  try {
    const [cloud, mod, pipe] = await Promise.all([
      import("../cloud/supabase.js"),
      import("../upload/templates.js"),
      import("../upload/pipeline.js"),
    ]);
    if (!cloud.configured) throw Object.assign(new Error(t("upload.off")), { uiMsg: t("upload.off") });
    const s = await cloud.session();
    if (!s) throw Object.assign(new Error(t("templates.needSignIn")), { uiMsg: t("templates.needSignIn") });
    const call = async (task, input) => (await cloud.call(task, input, getLang())).result;
    const prob = await mod.generateSimilarProblem({ tpl, context: pipe.contextOf(CUR.files), call });
    // Save against latest subject snapshot so navigating back mid-request never loses the generated problem.
    const all = loadSubjects();
    const updated = all.map((sj) => sj.id !== sid ? sj : {
      ...sj,
      templates: (sj.templates || []).map((x) => x.id !== tid ? x : {
        ...x,
        problems: (x.problems || []).concat(prob).slice(0, MAX_TPL_PROBLEMS),
      }),
    });
    saveSubjects(updated);
    if (CUR && CUR.id === sid) {
      CUR = updated.find((x) => x.id === sid) || CUR;
      if (screen === "template" && tpId === tid) {
        const fresh = currentTemplate();
        if (fresh) {
          tpIdx = Math.max(0, (fresh.problems || []).length - 1);
          resetTemplateProgress();
          $("tpRef").open = false;
          renderTemplateProblem(fresh);
          haptic("success");
        }
      }
    }
  } catch (e) {
    if (screen === "template" && tpId === tid) {
      $("tpErr").textContent = e && e.uiMsg ? e.uiMsg : templateErrorText(e);
      $("tpErr").hidden = false;
      if (e?.code === "plus_required") openPlus("templates");
      else if (e?.code === "user_limit" && !isPlusActive()) openPlus("limit");
    }
  } finally {
    tpBusy = false;
    const latest = currentTemplate();
    if (screen === "template" && latest) renderTemplateProblem(latest);
  }
};

// ===== Summary reader

function showReader(f, fileIndex = -1) {
  $("rTitle").textContent = f.title || f.name;
  const pagesLabel = f.context ? t("study.contextPages", { before: f.pagesBefore }) : t("study.pages", { before: f.pagesBefore, after: String(f.pagesAfter).replace(".", ",") });
  $("rMeta").textContent = [f.title && f.title !== f.name ? f.name : "", pagesLabel].filter(Boolean).join(" · ");
  const body = $("rBody"); body.innerHTML = "";
  if (f.picturePages) body.appendChild(el("p", "hint", t("study.pictures", { n: f.picturePages })));
  if (f.skippedPictures) body.appendChild(el("p", "hint", t("study.skipped", { n: f.skippedPictures })));
  let heads = [];
  if (f.summary) {
    const md = renderMarkdown(f.summary);
    body.appendChild(md);
    heads = [...md.querySelectorAll("h3")];
  } else if (f.text) {
    f.text.split(/\n{2,}/).forEach((p) => body.appendChild(el("p", null, p)));
  }
  readerFocus = null;
  if (readerHint && readerHint.fi === fileIndex) {
    const blocks = [...body.querySelectorAll("p, li")];
    const match = matchSummaryBlock(blocks.map((n) => n.textContent), readerHint);
    if (match) readerFocus = highlightMatch(blocks[match.index], match.phrase);
  }
  // A row of the summary's headings, to jump around a long one.
  $("rToc").replaceChildren(...heads.map((h) => button(null, h.textContent, () => h.scrollIntoView({ behavior: "smooth", block: "start" }))));
  $("rToc").hidden = heads.length < 3;
  const terms = f.keyTerms || [];
  $("rTerms").replaceChildren(...terms.flatMap((k) => [el("dt", null, k.term), el("dd", null, k.meaning)]));
  $("rTermsWrap").hidden = !terms.length;
  // Each question's source line ends with its file name, which is how a file finds its questions.
  const qs = QUESTIONS.filter((x) => x.s && x.s.includes("(" + f.name));
  $("rDock").hidden = !qs.length;
  $("rPractise").lastElementChild.textContent = t("reader.practise");
  $("rPractise").onclick = () => { roundOf = null; start(smartRound(qs, LOG, roundLimit(qs))); };
  $("rProg").style.width = "0";
  show("reader");
}
// Ephemeral, zero-AI study summary assembled from the current round's wrong answers and matching summary excerpts.
function showWrongReview() {
  const pack = buildWrongStudyPack(wrong, CUR.files || [], TOPICS);
  const mistakes = plural("review.mistakes", wrong.length);
  $("rTitle").textContent = t("review.title");
  const singleFile = pack.fileCount === 1 ? pack.sections.find((s) => s.fi >= 0) : null;
  $("rMeta").textContent = singleFile
    ? t("review.metaOneFile", { mistakes, name: singleFile.title })
    : pack.fileCount > 1
      ? t("review.metaFiles", { mistakes, files: pack.fileCount })
      : mistakes;
  const body = $("rBody"); body.innerHTML = "";
  body.appendChild(el("p", "hint rev-note", t("review.ephemeral")));
  const heads = [];
  pack.sections.forEach((sec) => {
    const wrap = el("section", "rev-sec");
    const head = el("div", "rev-head");
    const h = el("h3", null, sec.title || CUR.name);
    heads.push(h);
    head.appendChild(h);
    if (sec.fi >= 0) {
      head.appendChild(button("tiny rev-open", t("review.openFull"), () => {
        readerHint = null;
        go(CUR.id + "/read/" + sec.fi);
      }));
    }
    wrap.appendChild(head);
    sec.items.forEach((it) => {
      const card = el("div", "rev-card");
      if (it.topicName && sec.fi >= 0) card.appendChild(el("span", "eyebrow", it.topicName));
      card.appendChild(el("p", "rev-q", it.q));
      const ans = el("p", "rev-a");
      ans.append(el("strong", null, t("end.rightAnswer")), document.createTextNode(it.correct.join(" · ")));
      card.appendChild(ans);
      if (it.steps && it.steps.length) {
        const ol = el("ol", "prob-steps compact");
        it.steps.forEach((s) => ol.appendChild(el("li", null, s)));
        card.appendChild(ol);
      }
      if (it.explanation) card.appendChild(el("p", "rev-e", it.explanation));
      if (it.example) {
        const ex = el("p", "rev-e");
        ex.append(el("strong", null, t("quiz.example")), document.createTextNode(it.example));
        card.appendChild(ex);
      }
      if (it.excerpt) {
        const box = el("div", "rev-excerpt");
        box.appendChild(el("span", "rev-cap", t("review.fromSummary")));
        const p = el("p", null, it.excerpt);
        if (it.phrase) highlightMatch(p, it.phrase);
        box.appendChild(p);
        card.appendChild(box);
      }
      if (it.fi >= 0) {
        card.appendChild(button("link rev-jump", t("quiz.openSource"), () => {
          readerHint = { fi: it.fi, quote: it.quote, extras: it.extras };
          go(CUR.id + "/read/" + it.fi);
        }));
      }
      wrap.appendChild(card);
    });
    body.appendChild(wrap);
  });
  readerFocus = null;
  $("rToc").replaceChildren(...heads.map((h) => button(null, h.textContent, () => h.scrollIntoView({ behavior: "smooth", block: "start" }))));
  $("rToc").hidden = heads.length < 3;
  $("rTerms").replaceChildren(...pack.keyTerms.flatMap((k) => [el("dt", null, k.term), el("dd", null, k.meaning)]));
  $("rTermsWrap").hidden = !pack.keyTerms.length;
  $("rDock").hidden = !wrong.length;
  $("rPractise").lastElementChild.textContent = t("review.practise");
  $("rPractise").onclick = () => start(shuffle(wrong));
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

function learn(topicKey = null, n = null) {
  roundOf = topicKey;
  const base = filterKind(QUESTIONS, subjectKind);
  if (topicKey === RANKED) {
    const src = base.length ? base : QUESTIONS;
    const qs = rankedRound(rankExams(CUR.exams || [], TOPICS), src, P, n || roundLimit(src));
    if (qs.length) start(qs);
    return;
  }
  const qs = topicKey ? base.filter((x) => x.t === topicKey) : base;
  const src = qs.length ? qs : (topicKey ? QUESTIONS.filter((x) => x.t === topicKey) : QUESTIONS);
  if (src.length) start(smartRound(src, LOG, n || roundLimit(src), topicKey ? [] : examTopicOrder(CUR)));
}
$("learn").onclick = () => learn();

function pool() {
  const byKind = filterKind(QUESTIONS, kind);
  let l = topic === "all" ? byKind : byKind.filter((x) => x.t === topic);
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
function renderCustomTopics() {
  const base = filterKind(QUESTIONS, kind);
  if (topic !== "all" && !base.some((x) => x.t === topic)) topic = "all";
  const box = $("topics"); box.innerHTML = "";
  const rows = [["all", t("setup.allTopics"), base.length]]
    .concat(Object.keys(TOPICS).map((k) => [k, TOPICS[k], base.filter((x) => x.t === k).length]).filter((r) => r[2]));
  rows.forEach(([k, name, n]) => {
    const lab = el("label", "topic");
    const inp = document.createElement("input"); inp.type = "radio"; inp.name = "topic"; inp.value = k; inp.id = "topic-" + k; inp.checked = k === topic;
    inp.onchange = () => { topic = k; updAvail(); };
    lab.append(inp, el("span", null, name), el("span", "n", n));
    box.appendChild(lab);
  });
}
$("custom").onclick = () => {
  const mixed = hasBothKinds(QUESTIONS);
  kind = mixed ? subjectKind : "all";
  $("kindWrap").hidden = !mixed;
  [...$("kinds").children].forEach((x) => x.setAttribute("aria-pressed", x.dataset.k === kind));
  renderCustomTopics();
  [...$("modes").children].forEach((x) => x.setAttribute("aria-pressed", x.dataset.m === mode));
  updAvail(); openSheet($("roundSheet"));
};
$("kinds").onclick = (e) => {
  const b = e.target.closest("button"); if (!b) return;
  kind = b.dataset.k;
  [...$("kinds").children].forEach((x) => x.setAttribute("aria-pressed", x === b));
  renderCustomTopics();
  updAvail();
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
  resyncReminders();
  toast(t(v ? "exam.saved" : "exam.removed"));
}
$("sExam").onclick = openExam;
$("examDate").onchange = () => setExam($("examDate").value);
$("examClear").onclick = () => { $("examDate").value = ""; setExam(""); closeSheet($("examSheet")); };

// ===== The subject's menu: add files, progress, reset, delete

$("sMore").onclick = () => {
  $("mName").textContent = CUR.name;
  const st = stats(QUESTIONS, LOG), seen = st.total - st.fresh;
  const box = $("prog"); box.innerHTML = "";
  [["setup.statSeen", seen + " / " + st.total], ["setup.statOk", st.ok], ["setup.statTodo", st.reviewDue]].forEach(([k, v]) => {
    const s = el("div", "tile"); s.append(el("b", null, v), el("span", null, t(k))); box.appendChild(s);
  });
  $("progWrap").hidden = !seen; $("confirm").hidden = true; $("reset").hidden = !seen;
  $("delConfirm").hidden = true; $("delSubj").hidden = false;
  openSheet($("moreSheet"));
};
$("addFiles").onclick = () => openUpload(CUR.id);
$("reset").onclick = () => { $("confirm").hidden = false; $("reset").hidden = true; };
$("no").onclick = () => { $("confirm").hidden = true; $("reset").hidden = false; };
$("yes").onclick = () => { resetProgress(CUR); LOG = readLog(CUR); P = {}; closeSheet($("moreSheet")); renderSubject(); toast(t("setup.resetDone")); };
$("delSubj").onclick = () => { $("delConfirm").hidden = false; $("delSubj").hidden = true; };
$("delNo").onclick = () => { $("delConfirm").hidden = true; $("delSubj").hidden = false; };
$("delYes").onclick = () => {
  saveSubjects(loadSubjects().filter((x) => x.id !== CUR.id));
  resyncReminders();
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
function updateHintBtn(x) {
  const hints = Array.isArray(x.hints) ? x.hints : [];
  const btn = $("pHintBtn");
  if (!hints.length || probHintsShown >= hints.length) { btn.hidden = true; return; }
  btn.hidden = false;
  btn.textContent = probHintsShown === 0
    ? t("quiz.probHint", { n: hints.length })
    : t("quiz.probNextHint", { i: probHintsShown + 1, n: hints.length });
}

function showNextHint() {
  const x = list[i];
  if (!isProblem(x) || probRevealed || answered) return;
  const hints = Array.isArray(x.hints) ? x.hints : [];
  if (probHintsShown >= hints.length) return;
  const row = el("div", "prob-hint");
  row.append(el("span", "label", t("quiz.probHintN", { n: probHintsShown + 1 })), el("p", null, hints[probHintsShown]));
  $("pHints").appendChild(row);
  $("pHints").hidden = false;
  probHintsShown++;
  updateHintBtn(x);
}

function render() {
  const x = list[i]; answered = false;
  const prob = isProblem(x);
  $("qtopic").textContent = [TOPICS[x.t] || "", prob ? t("quiz.problemBadge") : ""].filter(Boolean).join(" · ");
  setPos();
  $("pg").style.width = (i / list.length) * 100 + "%";
  $("q").textContent = x.q;
  $("q").classList.toggle("is-prob", prob);
  $("qKeys").textContent = t(prob ? "quiz.probKeys" : "quiz.keys");
  const qActions = $("qBody").querySelector(".qactions");
  if (prob) {
    probRevealed = false; probHintsShown = 0; probNumOk = null;
    $("multi").hidden = true; $("opts").hidden = true; $("opts").innerHTML = "";
    $("check").hidden = true; $("idk").hidden = true; qActions.hidden = true;
    $("probBox").hidden = false;
    const hasCheck = Boolean(x.check && typeof x.check.num === "number" && Number.isFinite(x.check.num));
    $("pCheckWrap").hidden = !hasCheck;
    $("pInput").value = ""; $("pInput").disabled = false; $("pInput").removeAttribute("aria-invalid");
    $("pCheck").disabled = false;
    $("pUnit").textContent = x.check?.unit || ""; $("pUnit").hidden = !(x.check && x.check.unit);
    $("pCheckNote").hidden = true; $("pCheckNote").textContent = ""; $("pCheckNote").className = "hint prob-note";
    $("pHints").innerHTML = ""; $("pHints").hidden = true;
    updateHintBtn(x);
    $("pActions").hidden = false;
    $("pSol").hidden = true;
  } else {
    $("probBox").hidden = true; $("opts").hidden = false; qActions.hidden = false;
    const multi = Array.isArray(x.a); picked = new Set();
    $("multi").hidden = !multi; $("check").hidden = !multi; $("check").disabled = true; $("idk").hidden = false;
    order = x.o.map((_, k) => k);
    if (!x.o.some((o) => PIN.test(o))) order = shuffle(order);
    const box = $("opts"); box.innerHTML = "";
    order.forEach((oi, k) => {
      const b = el("button", "opt"); b.type = "button";
      if (multi) b.setAttribute("aria-pressed", "false");
      b.append(el("span", "k", L[k]), el("span", "t", x.o[oi]));
      b.onclick = () => answer(k); box.appendChild(b);
    });
  }
  $("pMissed").hidden = true; $("pGotIt").hidden = true; $("next").hidden = false;
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
const sourceFile = (x) => sourceFileIndex(x, CUR ? CUR.files : []);
function openQuestionSource(x) {
  const fi = sourceFile(x);
  if (fi < 0) return;
  readerHint = { fi, quote: stripSourceMeta(x.s), extras: [x.e, x.q, ...correctAnswers(x)].filter(Boolean) };
  go(CUR.id + "/read/" + fi);
}
function checkProblemInput() {
  const x = list[i];
  if (!isProblem(x) || probRevealed || answered) return;
  const raw = $("pInput").value.trim();
  if (!raw) { revealProblem(); return; }
  const res = checkNumericAnswer(raw, x.check);
  if (res == null) {
    $("pInput").setAttribute("aria-invalid", "true");
    $("pCheckNote").textContent = t("quiz.probInvalidNum");
    $("pCheckNote").className = "hint prob-note bad";
    $("pCheckNote").hidden = false;
    $("pInput").focus();
    return;
  }
  probNumOk = res;
  $("pInput").disabled = true; $("pCheck").disabled = true;
  $("pCheckNote").textContent = t(res ? "quiz.probMatch" : "quiz.probMismatch");
  $("pCheckNote").className = "hint prob-note " + (res ? "good" : "bad");
  $("pCheckNote").hidden = false;
  haptic(res ? "success" : "error");
  revealProblem();
}
function revealProblem() {
  const x = list[i];
  if (!isProblem(x) || probRevealed || answered) return;
  probRevealed = true;
  $("pActions").hidden = true;
  const steps = $("pSteps"); steps.innerHTML = "";
  (x.steps || []).forEach((s) => steps.appendChild(el("li", null, s)));
  $("pAns").textContent = x.ans || "";
  $("pExplain").textContent = x.e || "";
  $("pExplain").hidden = !x.e;
  $("pSrc").textContent = x.s ? t("quiz.source") + x.s : "";
  $("pSrc").hidden = !x.s;
  $("pSol").hidden = false;

  const fb = $("fb");
  fb.className = "fb " + (probNumOk === true ? "good" : probNumOk === false ? "bad" : "grade");
  $("verdict").textContent = t(probNumOk === true ? "quiz.probNumOk" : probNumOk === false ? "quiz.probNumBad" : "quiz.probRate");
  $("more").innerHTML = ""; $("more").hidden = true;
  const fi = sourceFile(x);
  $("openSrc").hidden = fi < 0;
  $("openSrc").onclick = fi >= 0 ? () => openQuestionSource(x) : null;
  $("next").hidden = true;
  $("pMissed").hidden = false;
  $("pGotIt").hidden = false;
  fb.hidden = false;
  $("quiz").style.paddingBottom = fb.offsetHeight + 16 + "px";
  (probNumOk === false ? $("pMissed") : $("pGotIt")).focus({ preventScroll: true });
}
function gradeProblem(ok) {
  if (answered || !probRevealed) return;
  answered = true;
  const x = list[i];
  if (ok) score++; else wrong.push(x);
  const r = P[x.id] || { n: 0, c: 0 }; r.n++; if (ok) r.c++; r.l = ok ? 1 : 0; P[x.id] = r;
  logAnswer(CUR, x.id, ok);
  LOG = readLog(CUR);
  haptic(ok ? "success" : "error");
  i++;
  i < list.length ? render() : finish();
}
function grade(sel) {
  answered = true;
  const x = list[i], C = new Set(corr(x).map((a) => order.indexOf(a)));
  const ok = C.size === sel.size && [...sel].every((n) => C.has(n));
  if (ok) score++; else wrong.push(x);
  const r = P[x.id] || { n: 0, c: 0 }; r.n++; if (ok) r.c++; r.l = ok ? 1 : 0; P[x.id] = r;
  logAnswer(CUR, x.id, ok);
  LOG = readLog(CUR);
  haptic(ok ? "success" : "error");
  [...$("opts").children].forEach((b, n) => {
    b.setAttribute("aria-disabled", "true"); b.removeAttribute("aria-pressed");
    if (C.has(n)) { b.classList.add("ok"); if (!sel.has(n) && sel.size && Array.isArray(x.a)) b.classList.add("missed"); }
    else if (sel.has(n)) b.classList.add("no"); else b.classList.add("dim");
  });
  $("check").hidden = true; $("idk").hidden = true;
  const fb = $("fb"); fb.className = "fb " + (ok ? "good" : "bad");
  const cl = [...C].sort().map((n) => L[n]);
  const key = sel.size ? (cl.length > 1 ? "quiz.wrongMany" : "quiz.wrongOne") : (cl.length > 1 ? "quiz.idkMany" : "quiz.idkOne");
  $("verdict").textContent = ok ? t("quiz.correct")
    : cl.length > 1 ? t(key, { list: cl.slice(0, -1).join(", "), last: cl[cl.length - 1] }) : t(key, { a: cl[0] });
  const m = $("more"); m.innerHTML = "";
  if (x.e) m.appendChild(el("p", null, x.e));
  if (x.x) { const p = el("p"); p.append(el("strong", null, t("quiz.example")), el("span", null, x.x)); m.appendChild(p); }
  if (x.s) m.appendChild(el("div", "src", t("quiz.source") + x.s));
  m.hidden = !m.childNodes.length;
  const fi = ok ? -1 : sourceFile(x);
  $("openSrc").hidden = fi < 0;
  $("openSrc").onclick = fi >= 0 ? () => openQuestionSource(x) : null;
  $("pg").style.width = ((i + 1) / list.length) * 100 + "%";
  $("next").textContent = t(i === list.length - 1 ? "quiz.toResult" : "quiz.next");
  fb.hidden = false;
  // Room under the options, so the panel never covers them.
  $("quiz").style.paddingBottom = fb.offsetHeight + 16 + "px";
  $("next").focus({ preventScroll: true });
}
$("check").onclick = () => { if (!answered && picked.size) grade(new Set(picked)); };
$("idk").onclick = () => { if (!answered) grade(new Set()); };
$("pHintBtn").onclick = showNextHint;
$("pCheck").onclick = checkProblemInput;
$("pInput").oninput = () => { $("pInput").removeAttribute("aria-invalid"); $("pCheckNote").hidden = true; };
$("pReveal").onclick = revealProblem;
$("pGotIt").onclick = () => gradeProblem(true);
$("pMissed").onclick = () => gradeProblem(false);
$("next").onclick = () => { i++; i < list.length ? render() : finish(); };
// ✕ ends the round: with answers it shows the result so far, without any it just leaves.
$("quit").onclick = () => { list = list.slice(0, answered ? i + 1 : i); list.length ? finish() : leaveQuiz(); };

function finish() { stage = "end"; dir = "fwd"; showEnd(); dir = "fade"; window.scrollTo(0, 0); resyncReminders(); }
function showEnd() {
  show("end");
  $("endSubj").textContent = CUR ? CUR.name : "";
  const n = list.length, pct = Math.round((score / n) * 100);
  const tone = pct >= 70 ? "good" : "low";
  $("final").textContent = score + " / " + n;
  $("endPct").textContent = pct + " %";
  $("endPct").className = "result-pct " + tone;
  $("endBar").style.width = pct + "%";
  $("endBar").parentElement.className = "bar result-bar " + tone;
  $("note").textContent = t(pct >= 90 ? "end.great" : pct >= 70 ? "end.good" : "end.low");
  const ul = $("miss"); ul.innerHTML = "";
  wrong.forEach((x) => {
    const li = el("li");
    if (TOPICS[x.t]) li.appendChild(el("span", "eyebrow", TOPICS[x.t]));
    li.append(el("div", "miss-q", x.q), el("div", "a", t("end.rightAnswer") + correctAnswers(x).join(" · ")));
    if (x.e) li.appendChild(el("p", "hint", x.e));
    if (sourceFile(x) >= 0) li.appendChild(button("link miss-src", t("quiz.openSource"), () => openQuestionSource(x)));
    ul.appendChild(li);
  });
  $("missLabel").textContent = t("end.reviewN", { n: wrong.length });
  $("missWrap").hidden = !wrong.length; $("retry").hidden = !wrong.length;
  const hasFiles = summaries().length > 0;
  const studyBtn = $("studyWrong");
  if (wrong.length > 0) {
    studyBtn.hidden = false;
    studyBtn.textContent = t("end.studyWrong");
    studyBtn.onclick = () => go(CUR.id + "/review");
  } else if (hasFiles) {
    studyBtn.hidden = false;
    studyBtn.textContent = t("end.openSummaries");
    studyBtn.onclick = () => { tab = "files"; list = []; go(CUR.id); };
  } else {
    studyBtn.hidden = true;
    studyBtn.onclick = null;
  }
  // One filled button: repeating the mistakes when there are any, the next round otherwise.
  $("again").classList.toggle("ghost", wrong.length > 0);
}
$("retry").onclick = () => start(shuffle(wrong));
$("again").onclick = () => learn(roundOf);
$("endBack").onclick = leaveQuiz;
$("endTopBack").onclick = leaveQuiz;
document.addEventListener("keydown", (e) => {
  if ($("quiz").hidden || e.metaKey || e.ctrlKey || e.altKey || document.querySelector("dialog[open]")) return;
  const x = list[i];
  if (document.activeElement === $("pInput")) {
    if (e.key === "Enter") { e.preventDefault(); checkProblemInput(); }
    else if (e.key === "Escape") { e.preventDefault(); $("pInput").blur(); }
    return;
  }
  if (isProblem(x)) {
    const onBtn = Boolean(e.target && e.target.closest && e.target.closest("button"));
    if (!probRevealed && e.key.toLowerCase() === "h" && !$("pHintBtn").hidden) { e.preventDefault(); showNextHint(); }
    else if (!probRevealed && e.key === "Enter" && !onBtn) { e.preventDefault(); revealProblem(); }
    else if (probRevealed && !answered && e.key === "Enter" && !onBtn) { e.preventDefault(); gradeProblem(probNumOk !== false); }
    else if (probRevealed && !answered && e.key.toLowerCase() === "r") { e.preventDefault(); gradeProblem(false); }
    else if (probRevealed && e.key.toLowerCase() === "s" && !$("openSrc").hidden) { e.preventDefault(); $("openSrc").click(); }
    else if (e.key === "Escape") { e.preventDefault(); $("quit").click(); }
    return;
  }
  const n = "1234".indexOf(e.key) >= 0 ? "1234".indexOf(e.key) : "abcd".indexOf(e.key.toLowerCase());
  if (!answered && n >= 0 && n < order.length) { e.preventDefault(); answer(n); }
  else if (!answered && e.key === "?") { e.preventDefault(); $("idk").click(); }
  else if (!answered && e.key === "Enter" && !$("check").hidden && picked.size) { e.preventDefault(); $("check").click(); }
  else if (answered && e.key === "Enter") { e.preventDefault(); $("next").click(); }
  else if (answered && e.key.toLowerCase() === "s" && !$("openSrc").hidden) { e.preventDefault(); $("openSrc").click(); }
  else if (e.key === "Escape") { e.preventDefault(); $("quit").click(); }
});

// ===== Profile: account, monthly limit, Light / Dark / Auto theme, language

// The browser's own bars and native iOS/Android status & navigation bars take the canvas colour.
function paintChrome() {
  const color = getComputedStyle(document.body).getPropertyValue("--paper").trim();
  const m = document.querySelector('meta[name="theme-color"]');
  if (m && color) m.content = color;
  syncNativeChrome(color);
}
try { matchMedia("(prefers-color-scheme:dark)").addEventListener("change", paintChrome); } catch (e) {}
function setTheme(th) {
  if (th) document.documentElement.dataset.theme = th; else delete document.documentElement.dataset.theme;
  const all = [...$("themes").children];
  all.forEach((b) => b.setAttribute("aria-pressed", b.dataset.th === th));
  $("themes").style.setProperty("--n", all.length);
  $("themes").style.setProperty("--i", Math.max(0, all.findIndex((b) => b.dataset.th === th)));
  try { localStorage.setItem(THEME_KEY, th); } catch (e) {}
  paintChrome();
}
let plusCycle = "annual";
const PLUS_REASONS = {
  exams: "profile.plusReasonExams",
  problems: "profile.plusReasonProblems",
  templates: "profile.plusReasonTemplates",
  limit: "profile.plusReasonLimit",
};
function syncPlusSheet() {
  const isMonthly = plusCycle === "monthly";
  const cycleBox = $("plusCycle");
  if (cycleBox) {
    const btns = [...cycleBox.children];
    btns.forEach((b) => b.setAttribute("aria-pressed", b.dataset.cycle === plusCycle ? "true" : "false"));
    cycleBox.style.setProperty("--n", String(btns.length));
    cycleBox.style.setProperty("--i", isMonthly ? "1" : "0");
  }
  if ($("plusPriceMain")) $("plusPriceMain").textContent = isMonthly ? t("profile.plusMonthlyPrice") : t("welcome.plusPrice");
  if ($("plusSaveBadge")) {
    $("plusSaveBadge").textContent = t("profile.plusSaveBadge");
    $("plusSaveBadge").hidden = isMonthly;
  }
  if ($("plusPriceSub")) $("plusPriceSub").textContent = isMonthly ? t("profile.plusMonthlyNote") : t("profile.plusAnnualNote");
  if ($("plusCta")) $("plusCta").textContent = isMonthly ? t("profile.plusCtaMonthly") : t("profile.plusCtaAnnual");
}
function openPlus(reason = "") {
  const rKey = PLUS_REASONS[reason] || "";
  const rEl = $("plusReason");
  if (rEl) {
    rEl.textContent = rKey ? t(rKey) : "";
    rEl.hidden = !rKey;
  }
  if ($("plusWaitNote")) $("plusWaitNote").hidden = true;
  syncPlusSheet();
  if (!$("plusSheet").open) openSheet($("plusSheet"));
}
$("plusCycle").onclick = (e) => {
  const b = e.target.closest("button[data-cycle]");
  if (!b || b.dataset.cycle === plusCycle) return;
  plusCycle = b.dataset.cycle;
  syncPlusSheet();
};
$("plusCta").onclick = () => {
  const url = String(plusCycle === "monthly"
    ? (import.meta.env.VITE_PLUS_URL_MONTHLY || "")
    : (import.meta.env.VITE_PLUS_URL_ANNUAL || "")).trim();
  if (url && /^https:\/\/[^\s/$.?#].[^\s]*$/i.test(url)) {
    window.location.assign(url);
    return;
  }
  $("plusWaitNote").hidden = false;
  toast(t("profile.plusWaitToast"));
};
$("pUpgrade").onclick = () => {
  const info = limitInfo(getCachedUsage());
  openPlus(info?.state === "full" ? "limit" : "");
};

function setLangUI(l) {
  setLang(l);
  const all = [...$("langs").children];
  all.forEach((b) => b.setAttribute("aria-pressed", b.dataset.lang === l));
  $("langs").style.setProperty("--n", all.length);
  $("langs").style.setProperty("--i", Math.max(0, all.findIndex((b) => b.dataset.lang === l)));
  syncAuthCopy();
  syncPlusSheet();
}
$("themes").onclick = (e) => { const b = e.target.closest("button"); if (b && !b.disabled) setTheme(b.dataset.th); };
$("langs").onclick = (e) => { const b = e.target.closest("button"); if (b) { setLangUI(b.dataset.lang); renderAccount(); renderReminders(); resyncReminders(); } };
let theme0 = ""; try { theme0 = localStorage.getItem(THEME_KEY) || ""; } catch (e) {}
setTheme(theme0 === "light" || theme0 === "dark" ? theme0 : "");
setLangUI(getLang());

// ===== Local exam-countdown study reminders (iOS & Android native local notifications)

async function resyncReminders() {
  if (!isNative()) return;
  const prefs = loadReminderPrefs();
  if (!prefs.enabled) { await cancelNativeReminders(); return; }
  const perm = await reminderPermission();
  if (perm !== "granted") { await cancelNativeReminders(); return; }
  const items = buildReminderSchedule(loadSubjects(), prefs, { readLog, t, roundSize: ROUND });
  if (items.length) await scheduleNativeReminders(items);
  else await cancelNativeReminders();
}

async function renderReminders() {
  const native = isNative();
  const prefs = loadReminderPrefs();
  const btns = [...$("remToggle").children];
  const on = native && prefs.enabled;
  btns.forEach((b) => {
    b.disabled = !native;
    b.setAttribute("aria-pressed", (b.dataset.rem === "1") === on ? "true" : "false");
  });
  $("remToggle").style.setProperty("--n", btns.length);
  $("remToggle").style.setProperty("--i", on ? 1 : 0);
  $("remTime").value = prefs.time;
  $("remTimeRow").hidden = !on;
  if (!native) {
    $("remHint").textContent = t("profile.remindersWebNote");
    return;
  }
  const perm = await reminderPermission();
  if (perm === "denied") $("remHint").textContent = t("profile.remindersDenied");
  else $("remHint").textContent = t("profile.remindersHint");
}

$("remToggle").onclick = async (e) => {
  const b = e.target.closest("button");
  if (!b || b.disabled || !isNative()) return;
  const want = b.dataset.rem === "1";
  const cur = loadReminderPrefs();
  if (want === cur.enabled) return;
  if (want) {
    const state = await requestReminderPermission();
    if (state !== "granted") {
      saveReminderPrefs({ enabled: false, time: cur.time });
      await renderReminders();
      $("remHint").textContent = t("profile.remindersDenied");
      return;
    }
    saveReminderPrefs({ enabled: true, time: $("remTime").value || cur.time });
    await renderReminders();
    await resyncReminders();
    toast(t("profile.remindersSaved"));
  } else {
    saveReminderPrefs({ enabled: false, time: cur.time });
    await renderReminders();
    await cancelNativeReminders();
    toast(t("profile.remindersDisabled"));
  }
};
$("remTime").onchange = async () => {
  const cur = loadReminderPrefs();
  if (!cur.enabled || !isNative()) return;
  saveReminderPrefs({ enabled: true, time: $("remTime").value || cur.time });
  await resyncReminders();
  toast(t("profile.remindersSaved"));
};

let pendingSignOutOpts = null;
async function signOutAccount({ stayOnWelcome = false, force = false } = {}) {
  // Flush pending local answers before wiping the device copy so nothing is lost on sign-out.
  if (!force) {
    try { await syncNow(true); } catch (e) {}
    if (hasUnsynced()) {
      pendingSignOutOpts = { stayOnWelcome };
      openSheet($("signOutSheet"));
      return;
    }
  }
  cancelSync();
  await cancelNativeReminders();
  const cloud = await import("../cloud/supabase.js");
  if (cloud.configured) await cloud.signOut();
  clearLocal();
  clearEntered();
  clearPendingAuth();
  setCachedUsage(null);
  try { localStorage.removeItem(LAST_KEY); } catch (e) {}
  SUBJECTS = []; CUR = null; QUESTIONS = []; TOPICS = {}; LOG = [];
  list = []; wrong = []; stage = "quiz"; readerHint = null; tpId = null; tpIdx = 0; tpBusy = false;
  toast(t("profile.signedOutToast"));
  if (stayOnWelcome) showWelcome(false);
  else go("welcome", true);
}
$("signOutForce").onclick = async () => {
  const opts = pendingSignOutOpts || {};
  pendingSignOutOpts = null;
  if ($("signOutSheet").open) {
    if (history.state && history.state.sheet) { try { history.replaceState({ d: depth() }, ""); } catch (e) {} }
    $("signOutSheet").close();
  }
  await signOutAccount({ ...opts, force: true });
};

// In-app permanent account deletion (App Store 5.1.1(v) & Google Play requirement).
$("pDelete").onclick = () => {
  $("delAcctErr").hidden = true;
  $("delAcctErr").textContent = "";
  $("delAcctConfirm").disabled = false;
  $("delAcctConfirm").textContent = t("profile.deleteConfirm");
  openSheet($("deleteAccountSheet"));
};
$("delAcctConfirm").onclick = async () => {
  const btn = $("delAcctConfirm");
  if (btn.disabled) return;
  btn.disabled = true;
  btn.textContent = t("profile.deleting");
  $("delAcctErr").hidden = true;
  $("delAcctErr").textContent = "";
  try {
    cancelSync();
    const cloud = await import("../cloud/supabase.js");
    await cloud.deleteAccount(getLang());
    await cancelNativeReminders();
    clearReminderPrefs();
    clearPendingAuth();
    setCachedUsage(null);
    clearLocal();
    clearEntered();
    try { localStorage.removeItem(LAST_KEY); } catch (e) {}
    SUBJECTS = []; CUR = null; QUESTIONS = []; TOPICS = {}; LOG = [];
    list = []; wrong = []; stage = "quiz"; readerHint = null; tpId = null; tpIdx = 0; tpBusy = false;
    if ($("deleteAccountSheet").open) {
      if (history.state && history.state.sheet) { try { history.replaceState({ d: depth() }, ""); } catch (e) {} }
      $("deleteAccountSheet").close();
    }
    toast(t("profile.deletedToast"));
    go("welcome", true);
  } catch (e) {
    btn.disabled = false;
    btn.textContent = t("profile.deleteConfirm");
    $("delAcctErr").textContent = t("profile.deleteErr");
    $("delAcctErr").hidden = false;
  }
};

// The account lives in Supabase, whose code loads only here and on the upload screen.
async function renderAccount() {
  $("pSign").hidden = true; $("pLimit").hidden = true; $("pDelete").hidden = true; $("pWho").textContent = ""; $("pEmail").textContent = ""; $("pAvatar").textContent = "";
  $("pAvatar").classList.add("wait");
  const cloud = await import("../cloud/supabase.js");
  if (!cloud.configured) { $("pAvatar").classList.remove("wait"); $("pAvatar").replaceChildren(icon("user")); $("pWho").textContent = t("upload.off"); return; }
  let s = null; try { s = await cloud.session(); } catch (e) {}
  $("pAvatar").classList.remove("wait");
  $("pSign").hidden = false;
  if (!s) {
    $("pAvatar").replaceChildren(icon("user"));
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
  $("pSign").textContent = t("upload.signOut");
  $("pSign").onclick = async () => {
    $("pSign").disabled = true;
    try { await signOutAccount(); } finally { $("pSign").disabled = false; }
  };
  $("pDelete").hidden = false;
  try {
    const u = (await cloud.call("usage", {}, getLang())).usage;
    renderLimit($("pLimit"), u, t);
  } catch (e) {}
}
function showProfile() { CUR = null; show("profile"); renderReminders(); if (dir !== "none") renderAccount(); }
$("pLanding").onclick = () => go("welcome");

function openLegal(kind) {
  const isPrivacy = kind === "privacy";
  $("legalTitle").textContent = isPrivacy ? t("legal.privacyTitle") : t("legal.termsTitle");
  $("legalBody").replaceChildren(
    el("p", null, isPrivacy ? t("legal.privacyBody1") : t("legal.termsBody1")),
    el("p", "hint", isPrivacy ? t("legal.privacyBody2") : t("legal.termsBody2")),
  );
  openSheet($("legalSheet"));
}

function showWelcome(openAuth = false, preferredMode = "login") {
  CUR = null;
  show("welcome");
  openWelcome({
    enterApp: () => { markEntered(); go(""); },
    trySample: () => {
      if (hasSessionToken()) { markEntered(); go(""); return; }
      const id = ensureSampleSubject(getLang());
      markEntered();
      go(id);
    },
    openAuthSheet: () => { if (!$("authSheet").open) openSheet($("authSheet")); },
    closeAuthSheet: () => { if ($("authSheet").open) closeSheet($("authSheet")); },
    openLegal,
    openPlus,
    setLangUI,
    signOut: () => signOutAccount({ stayOnWelcome: true }),
    toast,
  }, openAuth, preferredMode);
}

// ===== Upload

// With a subject id the files go into that subject instead of a new one; mode "exams" or "templates" targets those tabs.
function openUpload(target, mode) {
  const prefix = mode === "exams" ? "exams/" : mode === "templates" ? "templates/" : "upload/";
  go(typeof target === "string" ? prefix + target : "upload");
}
// The upload screen loads its code (pdf.js, Supabase) only when opened. It is also where the student signs in;
// opened from Profile (signIn) it asks only for that and goes back.
function showUpload(target, signIn, mode) {
  const into = target ? SUBJECTS.find((x) => x.id === target) : null;
  const exams = mode === "exams" && !!into;
  const templates = mode === "templates" && !!into;
  $("upTitle").textContent = t(signIn ? "upload.verify" : exams ? "upload.examsTitle" : templates ? "upload.templatesTitle" : into ? "upload.addTitle" : "upload.title");
  $("upLede").textContent = t(signIn ? "profile.signedOut" : exams ? "upload.examsLede" : templates ? "upload.templatesLede" : into ? "upload.addLede" : "upload.lede");
  $("upClose").onclick = () => back(signIn ? "profile" : into ? into.id : "");
  show("upload");
  import("../upload/ui.js").then((m) => m.open({
    target: into ? into.id : null, signIn: !!signIn, mode: exams ? "exams" : templates ? "templates" : "files",
    // tabName: the subject tab to open on ("exams" or "templates").
    opened: (id, tabName, created) => { CUR = null; resyncReminders(); go(id, true); if (tabName) { tab = tabName; refresh(); } if (created) toast(t("subject.created")); },
    done: () => { go("profile", true); toast(t("profile.signedInToast")); },
    onSignOut: () => signOutAccount(),
    openLegal,
    openPlus,
    toast,
  }));
}

route();
resyncReminders();

// Subjects or progress arrived from the account (another device, or this one after its storage was cleared).
startSync(() => {
  resyncReminders();
  if (!["today", "home", "subject"].includes(screen)) return;
  if (screen === "subject" && !loadSubjects().some((x) => x.id === CUR.id)) { go("subjects", true); return; }
  refresh();
});
