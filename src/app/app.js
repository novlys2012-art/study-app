// The app's screens: Today, Subjects, one subject (overview, summaries, topics), the summary reader,
// the multiple-choice quiz and Profile. The upload screen has its own module (src/upload/ui.js).
import { t, getLang } from "../i18n/index.js";
import { loadSubjects, saveSubjects, readProgress, logAnswer, resetProgress } from "./subjects.js";
import { startSync } from "./autosync.js";
import { renderMarkdown } from "./md.js";

const LOOK_KEY = "studyapp-look";
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
let tab = "overview", sortBy = "order", query = "";
let roundOf = null; // what "next round" repeats: a topic key, or null for the whole subject

function shuffle(a) { a = a.slice(); for (let k = a.length - 1; k > 0; k--) { const j = Math.floor(Math.random() * (k + 1)); [a[k], a[j]] = [a[j], a[k]]; } return a; }
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
function button(cls, text, onclick) { const b = el("button", cls, text); b.type = "button"; b.onclick = onclick; return b; }
function setHash(h) { try { history.replaceState(null, "", h ? "#" + h : location.pathname + location.search); } catch (e) {} }

// ===== Screens and the tab bar

const SCREENS = ["today", "home", "subject", "reader", "quiz", "end", "upload", "profile"];
const TAB_OF = { today: "today", home: "home", subject: "home", reader: "home", profile: "profile" };

function show(id) {
  SCREENS.forEach((s) => ($(s).hidden = s !== id));
  const on = TAB_OF[id];
  $("tabbar").hidden = !on;
  document.body.classList.toggle("has-tabbar", !!on);
  $("tabbar").querySelectorAll(".tab").forEach((b) => { if (b.dataset.go === on) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current"); });
  document.querySelectorAll("dialog[open]").forEach((d) => d.close());
  window.scrollTo({ top: 0 });
}
$("tabbar").onclick = (e) => {
  const b = e.target.closest(".tab"); if (!b) return;
  ({ today: goToday, home: goHome, upload: () => openUpload(), profile: goProfile })[b.dataset.go]();
};
// Bottom sheets close with their ✕ button or a tap outside.
document.querySelectorAll("dialog.bsheet").forEach((d) => {
  d.addEventListener("click", (e) => { if (e.target === d || e.target.closest("[data-close]")) d.close(); });
});

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
function examText(sj) {
  const d = daysTo(sj.exam); if (d == null) return "";
  const [y, m, day] = sj.exam.split("-").map(Number);
  const date = new Date(y, m - 1, day).toLocaleDateString(getLang(), { day: "numeric", month: "numeric" });
  if (d < 0) return t("exam.past", { date });
  const when = d === 0 ? t("exam.today") : d === 1 ? t("exam.tomorrow") : t(d < 5 ? "exam.daysFew" : "exam.days", { n: d });
  return t("exam.on", { date, when });
}
const dueText = (st) => (st.due ? t("home.due", { n: st.due }) : t("home.allOk"));
// The line under a subject's name: its exam countdown, or else how many questions it has.
const metaText = (sj, st) => examText(sj) || (st.total ? t("today.count", { n: st.total }) : t("home.noQuestions"));

const NS = "http://www.w3.org/2000/svg";
function ring(pct) {
  const s = document.createElementNS(NS, "svg");
  s.setAttribute("viewBox", "0 0 56 56"); s.setAttribute("class", "ring"); s.setAttribute("role", "img");
  s.setAttribute("aria-label", t("subject.mastered", { pct }));
  const circle = (cls) => { const c = document.createElementNS(NS, "circle"); c.setAttribute("cx", 28); c.setAttribute("cy", 28); c.setAttribute("r", 22); c.setAttribute("class", cls); return c; };
  const fg = circle("ring-fg");
  fg.setAttribute("stroke-dasharray", ((pct / 100) * 138.2).toFixed(1) + " 138.2"); fg.setAttribute("transform", "rotate(-90 28 28)");
  const tx = document.createElementNS(NS, "text");
  tx.setAttribute("x", 28); tx.setAttribute("y", 33); tx.setAttribute("text-anchor", "middle"); tx.textContent = pct + "%";
  s.append(circle("ring-bg"), fg, tx);
  return s;
}

// ===== Today

function addCard(title, text) {
  const d = button("drop sj add", null, () => openUpload());
  d.append(el("b", null, title), el("span", null, text));
  return d;
}
function renderToday() {
  const box = $("todayBody"); box.innerHTML = "";
  $("todayDate").textContent = new Date().toLocaleDateString(getLang(), { weekday: "long", day: "numeric", month: "long" });
  if (!SUBJECTS.length) { box.appendChild(addCard(t("home.empty.title"), t("home.empty.text"))); return; }
  let last = ""; try { last = localStorage.getItem(LAST_KEY) || ""; } catch (e) {}
  const rows = SUBJECTS.map((sj) => ({ sj, st: stats(sj.questions, readProgress(sj)), d: daysTo(sj.exam) }));
  const withQ = rows.filter((r) => r.st.total);
  // The big card is the subject with the nearest exam, or else the one opened last.
  const soon = withQ.filter((r) => r.d != null && r.d >= 0).sort((a, b) => a.d - b.d)[0];
  const hero = soon || withQ.find((r) => r.sj.id === last) || withQ[0];
  if (hero) {
    const c = el("div", "sheet hero");
    const top = el("div", "hero-top"), names = el("div", "grow");
    names.append(el("div", "eyebrow", t(soon ? "today.nextExam" : "today.continue")), el("p", "hero-name", hero.sj.name));
    const ex = examText(hero.sj); if (ex) names.append(el("p", "hint", ex));
    top.append(names, el("span", "pill", t("subject.mastered", { pct: hero.st.pct })));
    const bar = el("div", "bar"), fill = el("i"); fill.style.width = hero.st.pct + "%"; bar.appendChild(fill);
    c.append(top, bar, el("p", "hint", t("today.round", { n: Math.min(ROUND, hero.st.total) })),
      button("btn wide", t("today.go"), () => { enter(hero.sj); learn(); }));
    box.appendChild(c);
  }
  const rest = rows.filter((r) => r !== hero);
  if (rest.length) box.appendChild(el("p", "label", t("today.others")));
  rest.forEach((r) => {
    const b = button("rowcard", null, () => { enter(r.sj); if (r.st.total) learn(); else openSubject(r.sj.id); });
    const g = el("span", "grow");
    g.append(el("span", "rc-title", r.sj.name), el("span", "hint", examText(r.sj) || (r.st.total ? dueText(r.st) : t("today.read"))));
    b.append(g);
    if (r.st.total) b.append(el("span", "pill", t("today.count", { n: Math.min(ROUND, r.st.total) })));
    box.appendChild(b);
  });
}
function goToday() { CUR = null; SUBJECTS = loadSubjects(); renderToday(); show("today"); setHash(""); }

// ===== Subjects

function subjectRow(sj) {
  const st = stats(sj.questions, readProgress(sj));
  const b = button("rowcard sj", null, () => openSubject(sj.id));
  const g = el("span", "grow");
  g.append(el("span", "rc-title", sj.name), el("span", "hint", metaText(sj, st)));
  b.append(ring(st.pct), g);
  if (st.total) b.append(el("span", "pill", dueText(st)));
  return b;
}
function goHome() {
  CUR = null; SUBJECTS = loadSubjects();
  const box = $("subjects"); box.innerHTML = "";
  SUBJECTS.forEach((sj) => box.appendChild(subjectRow(sj)));
  box.appendChild(SUBJECTS.length ? addCard(t("home.add.title"), t("home.add.text")) : addCard(t("home.empty.title"), t("home.empty.text")));
  show("home"); setHash("subjects");
}

// ===== One subject

function enter(sj) {
  if (CUR !== sj) { CUR = sj; QUESTIONS = sj.questions; TOPICS = sj.topics; topic = "all"; mode = "all"; list = []; query = ""; tab = "overview"; }
  P = readProgress(sj);
  try { localStorage.setItem(LAST_KEY, sj.id); } catch (e) {}
}
function openSubject(id) {
  const sj = SUBJECTS.find((x) => x.id === id); if (!sj) { goToday(); return; }
  enter(sj); renderSubject(); show("subject"); setHash(sj.id);
}
const summaries = () => (CUR.files || []).filter((f) => f.summary);
const topicKeys = () => Object.keys(TOPICS).filter((k) => {
  const it = (CUR.topicInfo || {})[k];
  return QUESTIONS.some((x) => x.t === k) || (it && (it.summary || (it.weakSpots || []).length));
});

function renderSubject() {
  const st = stats(QUESTIONS, P);
  $("sName").textContent = CUR.name;
  $("sMeta").textContent = metaText(CUR, st);
  $("sCard").hidden = !st.total;
  $("sPct").textContent = t("subject.mastered", { pct: st.pct });
  $("sDue").textContent = dueText(st);
  $("sBar").style.width = st.pct + "%";
  // Only the tabs that have something to show.
  const has = { overview: st.total > 0, files: summaries().length > 0, topics: topicKeys().length > 0 };
  const open = Object.keys(has).filter((k) => has[k]);
  if (!has[tab]) tab = open[0] || "overview";
  [...$("sTabs").children].forEach((b) => { b.hidden = !has[b.dataset.tab]; b.setAttribute("aria-pressed", b.dataset.tab === tab); });
  $("sTabs").hidden = open.length < 2;
  $("sEmpty").hidden = open.length > 0;
  $("tabOverview").hidden = tab !== "overview" || !has.overview;
  $("tabFiles").hidden = tab !== "files" || !has.files;
  $("tabTopics").hidden = tab !== "topics" || !has.topics;
  if (!$("tabOverview").hidden) renderOverview();
  if (!$("tabFiles").hidden) renderFiles();
  if (!$("tabTopics").hidden) renderTopics();
}
$("sTabs").onclick = (e) => { const b = e.target.closest("button"); if (b) { tab = b.dataset.tab; renderSubject(); } };
$("sBack").onclick = goHome;

// Topics from the weakest, each a button that starts a round on that topic.
function renderOverview() {
  const rows = Object.keys(TOPICS).map((k) => ({ k, st: stats(QUESTIONS.filter((x) => x.t === k), P) })).filter((r) => r.st.total)
    .sort((a, b) => a.st.pct - b.st.pct);
  $("tbars").replaceChildren(...rows.map((r) => {
    const b = button("tbar", null, () => learn(r.k));
    const top = el("span", "tbar-top"); top.append(el("span", null, TOPICS[r.k]), el("span", "hint", r.st.pct + " %"));
    const bar = el("span", "bar"), fill = el("i"); fill.style.width = r.st.pct + "%"; bar.appendChild(fill);
    b.append(top, bar);
    return b;
  }));
}

function renderFiles() {
  const files = summaries();
  let rows = files.map((f) => ({ f, name: f.title || f.name, size: +f.pagesBefore || 0 }));
  if (sortBy === "az") rows.sort((x, y) => x.name.localeCompare(y.name, "sk"));
  if (sortBy === "long") rows.sort((x, y) => y.size - x.size);
  $("files").replaceChildren(...rows.map(({ f, name }) => {
    const b = button("rowcard card", null, () => openReader(f));
    const g = el("span", "grow");
    g.append(el("span", "rc-title", name), el("span", "hint", t("study.pages", { before: f.pagesBefore, after: String(f.pagesAfter).replace(".", ",") })));
    b.append(g, el("span", "chev", "›"));
    b.dataset.text = norm([f.title, f.name, f.summary, ...(f.keyTerms || []).map((k) => k.term + " " + k.meaning)].join(" "));
    return b;
  }));
  $("studyTools").hidden = files.length < 2;
  $("studySearch").hidden = files.length < SEARCH_FROM;
  if (files.length < SEARCH_FROM) query = "";
  $("studySearch").value = query;
  [...$("studySort").children].forEach((b) => b.setAttribute("aria-pressed", b.dataset.s === sortBy));
  $("checked").textContent = CUR.checkedOut ? t("study.checked", { n: CUR.checkedOut }) : "";
  $("checked").hidden = !CUR.checkedOut;
  filterFiles();
}
// Hides the summaries that do not contain the search text (diacritics do not matter).
function filterFiles() {
  const q = norm(query.trim());
  let shown = 0;
  [...$("files").children].forEach((b) => { const hit = !q || b.dataset.text.includes(q); b.hidden = !hit; if (hit) shown++; });
  $("studyNone").hidden = !q || shown > 0;
}
$("studySearch").oninput = () => { query = $("studySearch").value; filterFiles(); };
$("studySort").onclick = (e) => { const b = e.target.closest("button"); if (b) { sortBy = b.dataset.s; renderFiles(); } };

function renderTopics() {
  const info = CUR.topicInfo || {};
  $("tinfo").replaceChildren(...topicKeys().map((k) => {
    const it = info[k] || {}, n = QUESTIONS.filter((x) => x.t === k).length;
    const c = el("div", "sheet card tcard");
    const head = el("div", "meta"); head.append(el("h3", null, TOPICS[k]));
    if (n) head.append(el("span", "count", n + " " + t("home.questions")));
    c.appendChild(head);
    if (it.summary) c.appendChild(el("p", null, it.summary));
    const weak = it.weakSpots || [];
    if (weak.length) {
      const ul = el("ul"); weak.forEach((w) => ul.appendChild(el("li", null, w)));
      c.append(el("p", "label", t("study.weak")), ul);
    }
    if (n) c.appendChild(button("btn ghost wide", t("study.practise"), () => learn(k)));
    return c;
  }));
}

// ===== Summary reader

function openReader(f) {
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
  $("rPractise").hidden = !qs.length;
  $("rPractise").onclick = () => { roundOf = null; start(smartRound(qs, P)); };
  show("reader");
}
$("rBack").onclick = () => { renderSubject(); show("subject"); };

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
  $("go").disabled = !n; $("go").style.opacity = n ? 1 : 0.5;
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
  updAvail(); $("roundSheet").showModal();
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

// ===== The subject's menu: exam date, add files, reset progress, delete

$("sMore").onclick = () => {
  $("mName").textContent = CUR.name;
  $("examDate").value = CUR.exam || "";
  const st = stats(QUESTIONS, P), seen = st.ok + st.bad;
  const box = $("prog"); box.innerHTML = "";
  [["setup.statSeen", seen + " / " + st.total], ["setup.statOk", st.ok], ["setup.statTodo", st.bad]].forEach(([k, v]) => {
    const s = el("span"); s.append(el("b", null, v), " " + t(k)); box.appendChild(s);
  });
  $("progWrap").hidden = !seen; $("confirm").hidden = true; $("reset").hidden = false;
  $("delConfirm").hidden = true; $("delSubj").hidden = false;
  $("moreSheet").showModal();
};
$("examDate").onchange = () => {
  const v = $("examDate").value;
  if (v) CUR.exam = v; else delete CUR.exam;
  saveSubjects(loadSubjects().map((x) => { if (x.id !== CUR.id) return x; const { exam, ...rest } = x; return v ? { ...rest, exam: v } : rest; }));
  renderSubject();
};
$("addFiles").onclick = () => openUpload(CUR.id);
$("reset").onclick = () => { $("confirm").hidden = false; $("reset").hidden = true; };
$("no").onclick = () => { $("confirm").hidden = true; $("reset").hidden = false; };
$("yes").onclick = () => { resetProgress(CUR); P = {}; $("moreSheet").close(); renderSubject(); };
$("delSubj").onclick = () => { $("delConfirm").hidden = false; $("delSubj").hidden = true; };
$("delNo").onclick = () => { $("delConfirm").hidden = true; $("delSubj").hidden = false; };
$("delYes").onclick = () => {
  saveSubjects(loadSubjects().filter((x) => x.id !== CUR.id));
  goHome();
};

// ===== Quiz: one question per screen, the verdict slides up from the bottom

function start(qs) { list = qs; i = 0; score = 0; wrong = []; show("quiz"); render(); }
function setPos() { $("pos").textContent = t("quiz.pos", { i: i + 1, n: list.length }); }
function render() {
  const x = list[i]; answered = false;
  $("qtopic").textContent = TOPICS[x.t] || "";
  setPos();
  $("pg").style.width = (i / list.length) * 100 + "%";
  $("q").textContent = x.q;
  const multi = Array.isArray(x.a); picked = new Set();
  $("multi").hidden = !multi; $("check").hidden = !multi; $("check").disabled = true; $("check").style.opacity = 0.5;
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
  window.scrollTo({ top: 0 });
}
function answer(k) {
  if (answered) return;
  const x = list[i];
  if (Array.isArray(x.a)) {
    const b = $("opts").children[k];
    if (picked.has(k)) picked.delete(k); else picked.add(k);
    b.setAttribute("aria-pressed", picked.has(k)); $("check").disabled = !picked.size; $("check").style.opacity = picked.size ? 1 : 0.5;
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
$("quit").onclick = () => { list = list.slice(0, answered ? i + 1 : i); list.length ? finish() : openSubject(CUR.id); };

function finish() {
  show("end");
  const n = list.length, pct = Math.round((score / n) * 100);
  $("final").innerHTML = ""; $("final").append(score + " / " + n, el("small", null, " " + pct + " %"));
  $("note").textContent = t(pct >= 90 ? "end.great" : pct >= 70 ? "end.good" : "end.low");
  const ul = $("miss"); ul.innerHTML = "";
  wrong.forEach((x) => {
    const li = el("li");
    li.append(el("div", null, x.q), el("div", "a", t("end.rightAnswer") + corr(x).map((k) => x.o[k]).join(" · ")));
    ul.appendChild(li);
  });
  $("missWrap").hidden = !wrong.length; $("retry").hidden = !wrong.length;
}
$("retry").onclick = () => start(shuffle(wrong));
$("again").onclick = () => learn(roundOf);
$("endBack").onclick = () => openSubject(CUR.id);
document.addEventListener("keydown", (e) => {
  if ($("quiz").hidden || e.metaKey || e.ctrlKey || e.altKey) return;
  const n = "1234".indexOf(e.key) >= 0 ? "1234".indexOf(e.key) : "abcd".indexOf(e.key.toLowerCase());
  if (!answered && n >= 0 && n < order.length) { e.preventDefault(); answer(n); }
  else if (!answered && e.key === "Enter" && !$("check").hidden && picked.size) { e.preventDefault(); $("check").click(); }
  else if (answered && e.key === "Enter") { e.preventDefault(); $("next").click(); }
});

// ===== Profile: account, monthly limit, looks (Kocky is the default; a saved choice, even the empty Účtovná kniha, wins)

function setLook(l) {
  if (l) document.body.dataset.look = l; else delete document.body.dataset.look;
  [...$("looks").querySelectorAll("button")].forEach((b) => b.setAttribute("aria-pressed", b.dataset.l === l));
  try { localStorage.setItem(LOOK_KEY, l); } catch (e) {}
}
$("looks").onclick = (e) => { const b = e.target.closest("button"); if (b) setLook(b.dataset.l); };
let look0 = null; try { look0 = localStorage.getItem(LOOK_KEY); } catch (e) {}
setLook(look0 == null ? "kocky" : look0);

// The account lives in Supabase, whose code loads only here and on the upload screen.
async function renderAccount() {
  $("pSign").hidden = true; $("pLimit").hidden = true; $("pWho").textContent = "";
  const cloud = await import("../cloud/supabase.js");
  if (!cloud.configured) { $("pWho").textContent = t("upload.off"); return; }
  let s = null; try { s = await cloud.session(); } catch (e) {}
  $("pSign").hidden = false;
  if (!s) {
    $("pWho").textContent = t("profile.signedOut");
    $("pSign").textContent = t("upload.verify"); $("pSign").onclick = () => openUpload();
    return;
  }
  $("pWho").textContent = t("upload.signedIn", { email: s.user.email || "" }) + " " + t("profile.saved");
  $("pSign").textContent = t("upload.signOut"); $("pSign").onclick = async () => { await cloud.signOut(); renderAccount(); };
  try {
    const u = (await cloud.call("usage", {}, getLang())).usage;
    const pct = u.limitUsd > 0 ? Math.min(100, Math.round((u.monthUsd / u.limitUsd) * 100)) : 0;
    $("pLimitBar").style.width = pct + "%"; $("pLimit").classList.toggle("warn", pct >= 80);
    $("pUsage").textContent = t("upload.usage", { pct, spent: "$" + u.monthUsd.toFixed(2), limit: "$" + u.limitUsd.toFixed(2) });
    $("pLimit").hidden = false;
  } catch (e) {}
}
function goProfile() { CUR = null; show("profile"); setHash("profile"); renderAccount(); }

// ===== Upload and routing

// The upload screen loads its code (pdf.js, Supabase) only when opened.
// With a subject id it starts on that subject instead of a new one.
function openUpload(target) {
  const into = typeof target === "string" ? SUBJECTS.find((x) => x.id === target) : null;
  const back = CUR ? CUR.id : null;
  $("upTitle").textContent = t(into ? "upload.addTitle" : "upload.title");
  $("upLede").textContent = t(into ? "upload.addLede" : "upload.lede");
  $("upClose").onclick = () => { SUBJECTS = loadSubjects(); if (back && SUBJECTS.some((x) => x.id === back)) openSubject(back); else goToday(); };
  show("upload"); setHash(into ? "upload/" + into.id : "upload");
  import("../upload/ui.js").then((m) => m.open({ target: into ? into.id : null, opened: (id) => { SUBJECTS = loadSubjects(); CUR = null; openSubject(id); } }));
}

function route() {
  SUBJECTS = loadSubjects();
  const h = decodeURIComponent(location.hash.slice(1));
  // The sign-in link comes back with ?code=..., which the upload screen turns into a session.
  if (h.startsWith("upload/")) openUpload(h.slice(7));
  else if (h === "upload" || /[?&]code=/.test(location.search)) openUpload();
  else if (h === "subjects") goHome();
  else if (h === "profile") goProfile();
  else if (SUBJECTS.some((x) => x.id === h)) openSubject(h);
  else goToday();
}
route();
window.addEventListener("hashchange", route);

// Subjects or progress arrived from the account (another device, or this one after its storage was cleared).
startSync(() => {
  SUBJECTS = loadSubjects();
  const sj = CUR && SUBJECTS.find((x) => x.id === CUR.id);
  if (sj) P = readProgress(sj);
  if (!$("today").hidden) goToday();
  else if (!$("home").hidden) goHome();
  else if (!$("subject").hidden) {
    if (!sj) { goHome(); return; }
    const keep = tab; CUR = null; enter(sj); tab = keep; renderSubject();
  }
});
