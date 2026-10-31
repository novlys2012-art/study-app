// Home screen and the multiple-choice quiz: topics, round size, unseen questions, mistake review.
import { t } from "../i18n/index.js";
import { loadSubjects, saveSubjects, progressKey } from "./subjects.js";
import { renderMarkdown } from "./md.js";

const LOOK_KEY = "studyapp-look";
const LAST_KEY = "studyapp-last-subject";
const L = "ABCD";
// Options that refer to other options ("none of the above", "a) and b)") keep their order.
const PIN = /žiadn|všetk|ani jedn|vyššie|predchádzaj|uveden.{0,10}možnost|\b[a-dA-D]\)|\b[a-dA-D] aj [a-dA-D]\b/i;

const $ = (id) => document.getElementById(id);
const corr = (x) => (Array.isArray(x.a) ? x.a : [x.a]);
const pad = (n) => String(n).padStart(2, "0");

let SUBJECTS = [];
let CUR = null, QUESTIONS = [], TOPICS = {};
let picked = new Set();
let list = [], i = 0, score = 0, wrong = [], answered = false, count = "20", topic = "all", mode = "all", order = [];
let KEY = "", P = {};

function loadProgress() { KEY = progressKey(CUR); try { P = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { P = {}; } }
function save() { try { localStorage.setItem(KEY, JSON.stringify(P)); } catch (e) {} }
function shuffle(a) { a = a.slice(); for (let k = a.length - 1; k > 0; k--) { const j = Math.floor(Math.random() * (k + 1)); [a[k], a[j]] = [a[j], a[k]]; } return a; }
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

function show(id) {
  ["home", "setup", "quiz", "end", "upload"].forEach((s) => ($(s).hidden = s !== id));
  $("crumb").hidden = id === "home";
  window.scrollTo({ top: 0 });
}

function head(eyebrow, title, lede, foot) {
  $("eyebrow").textContent = eyebrow; $("h1").textContent = title; $("lede").textContent = lede; $("foot").textContent = foot;
}

// ===== Setup

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
function setupProgress() {
  const ids = Object.keys(P).filter((id) => QUESTIONS.some((x) => x.id === id));
  const seen = ids.length, ok = ids.filter((id) => P[id].l === 1).length;
  const box = $("prog"); box.innerHTML = "";
  [["setup.statSeen", seen + " / " + QUESTIONS.length], ["setup.statOk", ok], ["setup.statTodo", seen - ok]].forEach(([k, v]) => {
    const s = el("span"); s.append(el("b", null, v), " " + t(k)); box.appendChild(s);
  });
  $("progWrap").hidden = !seen; $("confirm").hidden = true; $("reset").hidden = false;
}
// Summaries per file and topics with their weak spots, for subjects made from uploads.
// Both lists fold away, can be sorted, and get a search box once there are many cards.
const FOLD_KEY = "studyapp-folds";
const SEARCH_FROM = 6; // cards in both lists together before the search box shows
let sortBy = "order", query = "";
const norm = (s) => String(s || "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

function details(title, meta, cls = "card") {
  const d = el("details", cls); const sm = el("summary");
  sm.append(el("span", null, title)); if (meta) sm.append(el("span", "n", meta));
  d.appendChild(sm); return d;
}
function fileCard(f) {
  const d = details(f.title || f.name, t("study.pages", { before: f.pagesBefore, after: String(f.pagesAfter).replace(".", ",") }));
  const body = el("div", "card-body");
  if (f.title && f.title !== f.name) body.appendChild(el("p", "qid", f.name));
  if (f.picturePages) body.appendChild(el("p", "hint", t("study.pictures", { n: f.picturePages })));
  if (f.skippedPictures) body.appendChild(el("p", "hint", t("study.skipped", { n: f.skippedPictures })));
  body.appendChild(renderMarkdown(f.summary));
  const terms = f.keyTerms || [];
  if (terms.length) {
    const sub = details(t("study.terms"), String(terms.length), "card-sub");
    const dl = el("dl", "terms");
    terms.forEach((k) => dl.append(el("dt", null, k.term), el("dd", null, k.meaning)));
    sub.appendChild(dl); body.appendChild(sub);
  }
  d.appendChild(body);
  d.dataset.text = norm([f.title, f.name, f.summary, ...terms.map((k) => k.term + " " + k.meaning)].join(" "));
  return d;
}
function topicCard(k, it, n) {
  const d = details(TOPICS[k], n ? n + " " + t("home.questions") : "");
  const body = el("div", "card-body");
  if (it.summary) body.appendChild(el("p", null, it.summary));
  const weak = it.weakSpots || [];
  if (weak.length) {
    const sub = details(t("study.weak"), String(weak.length), "card-sub");
    sub.open = true;
    const ul = el("ul"); weak.forEach((w) => ul.appendChild(el("li", null, w))); sub.appendChild(ul);
    body.appendChild(sub);
  }
  if (n) {
    const b = el("button", "btn ghost", t("study.practise")); b.type = "button";
    b.onclick = () => { topic = k; mode = "all"; start(shuffle(pool()).slice(0, count === "all" ? undefined : +count)); };
    body.appendChild(b);
  }
  d.appendChild(body);
  d.dataset.text = norm([TOPICS[k], it.summary, ...weak].join(" "));
  return d;
}
function sorted(rows) {
  // rows: [{ card, name, size }] in upload order
  if (sortBy === "az") return rows.slice().sort((x, y) => x.name.localeCompare(y.name, "sk"));
  if (sortBy === "long") return rows.slice().sort((x, y) => y.size - x.size);
  return rows;
}
function studyMaterial() {
  const files = CUR.files || [], info = CUR.topicInfo || {};
  const fileRows = files.map((f) => ({ card: fileCard(f), name: f.title || f.name, size: +f.pagesBefore || 0 }));
  const topicRows = Object.keys(TOPICS).map((k) => {
    const n = QUESTIONS.filter((x) => x.t === k).length, it = info[k];
    if (!it || (!it.summary && !(it.weakSpots || []).length && !n)) return null;
    return { card: topicCard(k, it, n), name: TOPICS[k], size: n };
  }).filter(Boolean);
  $("files").replaceChildren(...sorted(fileRows).map((r) => r.card));
  $("tinfo").replaceChildren(...sorted(topicRows).map((r) => r.card));
  $("filesN").textContent = files.length; $("tinfoN").textContent = topicRows.length;
  $("checked").textContent = CUR.checkedOut ? t("study.checked", { n: CUR.checkedOut }) : "";
  $("checked").hidden = !CUR.checkedOut;
  $("filesWrap").hidden = !files.length;
  $("tinfoWrap").hidden = !topicRows.length;
  const many = fileRows.length + topicRows.length;
  $("studyTools").hidden = fileRows.length < 2 && topicRows.length < 2;
  $("studySearch").hidden = many < SEARCH_FROM;
  if (many < SEARCH_FROM) query = "";
  $("studySearch").value = query;
  [...$("studySort").children].forEach((b) => b.setAttribute("aria-pressed", b.dataset.s === sortBy));
  let folds = {}; try { folds = JSON.parse(localStorage.getItem(FOLD_KEY)) || {}; } catch (e) {}
  document.querySelectorAll("details.fold").forEach((d) => { d.open = folds[d.dataset.fold] !== false; });
  filterStudy();
}
// Hides cards that do not contain the search text and opens the ones that do.
function filterStudy() {
  const q = norm(query.trim());
  let shown = 0;
  ["files", "tinfo"].forEach((id) => {
    let here = 0;
    $(id).querySelectorAll(":scope > .card").forEach((d) => {
      const hit = !q || d.dataset.text.includes(q);
      d.hidden = !hit; if (hit) here++;
      if (q && hit) { d.open = true; d.dataset.found = "1"; }
      else if (!q && d.dataset.found) { d.open = false; delete d.dataset.found; }
    });
    if (q && here) $(id).closest("details").open = true;
    $(id).closest("details").classList.toggle("none", !here);
    shown += here;
  });
  $("studyNone").hidden = !q || !!shown;
  foldLabels();
}
function foldLabels() {
  document.querySelectorAll(".fold-all").forEach((b) => {
    const cards = [...$(b.dataset.target).querySelectorAll(":scope > .card:not([hidden])")];
    b.hidden = cards.length < 2;
    b.textContent = t(cards.every((d) => d.open) ? "study.closeAll" : "study.openAll");
  });
}
$("studySearch").oninput = () => { query = $("studySearch").value; filterStudy(); };
$("studySort").onclick = (e) => {
  const b = e.target.closest("button"); if (!b) return;
  sortBy = b.dataset.s; studyMaterial();
};
document.querySelectorAll(".fold-all").forEach((b) => {
  b.onclick = () => {
    const cards = [...$(b.dataset.target).querySelectorAll(":scope > .card:not([hidden])")];
    const open = !cards.every((d) => d.open);
    cards.forEach((d) => { d.open = open; });
    foldLabels();
  };
});
document.querySelectorAll("details.fold").forEach((d) => {
  d.addEventListener("toggle", () => {
    let folds = {}; try { folds = JSON.parse(localStorage.getItem(FOLD_KEY)) || {}; } catch (e) {}
    folds[d.dataset.fold] = d.open;
    try { localStorage.setItem(FOLD_KEY, JSON.stringify(folds)); } catch (e) {}
  });
});
// A card opened or closed by hand updates the "open all" link.
["files", "tinfo"].forEach((id) => $(id).addEventListener("toggle", foldLabels, true));
function setup() {
  setupProgress(); studyMaterial();
  $("delConfirm").hidden = true; $("delSubj").hidden = false;
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
  show("setup"); updAvail();
}
$("reset").onclick = () => { $("confirm").hidden = false; $("reset").hidden = true; };
$("no").onclick = () => { $("confirm").hidden = true; $("reset").hidden = false; };
$("yes").onclick = () => { P = {}; save(); setup(); };
$("delSubj").onclick = () => { $("delConfirm").hidden = false; $("delSubj").hidden = true; };
$("delNo").onclick = () => { $("delConfirm").hidden = true; $("delSubj").hidden = false; };
$("delYes").onclick = () => {
  saveSubjects(loadSubjects().filter((x) => x.id !== CUR.id));
  try { localStorage.removeItem(KEY); } catch (e) {}
  goHome();
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
  start(l);
};

// ===== Quiz

function start(qs) { list = qs; i = 0; score = 0; wrong = []; show("quiz"); render(); }
function setPos() { $("pos").textContent = t("quiz.pos", { i: pad(i + 1), n: pad(list.length), score }); }
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
  $("fb").hidden = true; $("more").hidden = true; $("next").hidden = true;
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
  const r = P[x.id] || { n: 0, c: 0 }; r.n++; if (ok) r.c++; r.l = ok ? 1 : 0; P[x.id] = r; save();
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
  m.hidden = true; $("toggle").textContent = t("quiz.show"); $("toggle").hidden = !m.childNodes.length; fb.hidden = false;
  setPos();
  $("next").textContent = t(i === list.length - 1 ? "quiz.toResult" : "quiz.next"); $("next").hidden = false; $("next").focus({ preventScroll: true });
}
$("toggle").onclick = () => { const m = $("more"); m.hidden = !m.hidden; $("toggle").textContent = t(m.hidden ? "quiz.show" : "quiz.hide"); };
$("check").onclick = () => { if (!answered && picked.size) grade(new Set(picked)); };
$("next").onclick = () => { i++; i < list.length ? render() : finish(); };
$("quit").onclick = () => { list = list.slice(0, answered ? i + 1 : i); list.length ? finish() : setup(); };

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
$("again").onclick = setup;
document.addEventListener("keydown", (e) => {
  if ($("quiz").hidden || e.metaKey || e.ctrlKey || e.altKey) return;
  const n = "1234".indexOf(e.key) >= 0 ? "1234".indexOf(e.key) : "abcd".indexOf(e.key.toLowerCase());
  if (!answered && n >= 0 && n < order.length) { e.preventDefault(); answer(n); }
  else if (!answered && e.key === "Enter" && !$("check").hidden && picked.size) { e.preventDefault(); $("check").click(); }
  else if (answered && e.key === "Enter" && document.activeElement !== $("toggle")) { e.preventDefault(); $("next").click(); }
});

// ===== Looks (Kocky is the default; a saved choice, even the empty Účtovná kniha, wins)

function setLook(l) {
  if (l) document.body.dataset.look = l; else delete document.body.dataset.look;
  [...$("looks").querySelectorAll("button")].forEach((b) => b.setAttribute("aria-pressed", b.dataset.l === l));
  try { localStorage.setItem(LOOK_KEY, l); } catch (e) {}
}
$("looks").onclick = (e) => { const b = e.target.closest("button"); if (b) setLook(b.dataset.l); };
let look0 = null; try { look0 = localStorage.getItem(LOOK_KEY); } catch (e) {}
setLook(look0 == null ? "kocky" : look0);

// ===== Home and routing

function setHash(h) { try { history.replaceState(null, "", h ? "#" + h : location.pathname + location.search); } catch (e) {} }

function subjectCard(sj, last) {
  const b = el("button", "sheet subj"); b.type = "button"; b.onclick = () => openSubject(sj.id);
  let p = {}; try { p = JSON.parse(localStorage.getItem(progressKey(sj))) || {}; } catch (e) {}
  const ids = new Set(sj.questions.map((x) => x.id));
  const seen = Object.keys(p).filter((k) => ids.has(k)), ok = seen.filter((k) => p[k].l === 1).length;
  const tn = Object.keys(sj.topics).filter((k) => sj.questions.some((x) => x.t === k)).map((k) => sj.topics[k]);
  const pct = sj.questions.length ? Math.round((seen.length / sj.questions.length) * 100) : 0;
  const top = el("div", "subj-top"); top.append(el("span", "code", sj.code || sj.name.slice(0, 3).toUpperCase()));
  if (last) top.append(el("span", "last", t("home.last")));
  top.append(el("span", "term", sj.term || ""));
  const stats = el("div", "subj-stats");
  [[sj.questions.length, t("home.questions")], [tn.length, t("home.topics")]].forEach(([n, l]) => { const s = el("span"); s.append(el("b", null, n), l); stats.appendChild(s); });
  const bar = el("div", "bar"); bar.setAttribute("aria-hidden", "true"); const fill = el("i"); fill.style.width = pct + "%"; bar.appendChild(fill);
  const foot = el("div", "subj-foot");
  foot.append(
    el("span", null, seen.length ? t("home.seen", { seen: seen.length, total: sj.questions.length, todo: seen.length - ok }) : t("home.notStarted")),
    el("span", "go", t(seen.length ? "home.continue" : "home.start")),
  );
  b.append(top, el("p", "subj-name", sj.name), el("div", "subj-topics", tn.join(" · ")), stats, bar, foot);
  return b;
}

function addCard(title, text) {
  const d = el("button", "sheet subj add"); d.type = "button"; d.onclick = openUpload;
  const top = el("div", "subj-top"); top.append(el("span", "code", "+"));
  d.append(top, el("p", "subj-name", title), el("div", "subj-topics", text));
  return d;
}

function renderHome() {
  let last = ""; try { last = localStorage.getItem(LAST_KEY) || ""; } catch (e) {}
  const box = $("subjects"); box.innerHTML = "";
  SUBJECTS.forEach((sj) => box.appendChild(subjectCard(sj, sj.id === last && SUBJECTS.length > 1)));
  box.appendChild(SUBJECTS.length ? addCard(t("home.add.title"), t("home.add.text")) : addCard(t("home.empty.title"), t("home.empty.text")));
}

function goHome() {
  CUR = null; SUBJECTS = loadSubjects(); renderHome();
  head(t("home.eyebrow"), t("home.title"), t("home.lede"), t("home.foot"));
  show("home"); setHash("");
}

function openSubject(id) {
  const sj = SUBJECTS.find((x) => x.id === id); if (!sj) { goHome(); return; }
  if (CUR !== sj) { CUR = sj; QUESTIONS = sj.questions; TOPICS = sj.topics; loadProgress(); topic = "all"; mode = "all"; list = []; query = ""; }
  try { localStorage.setItem(LAST_KEY, sj.id); } catch (e) {}
  head(sj.name + (sj.term ? " · " + sj.term : ""), t("subject.title"), t("subject.lede", { n: sj.questions.length }), t("home.foot"));
  setup(); setHash(sj.id);
}

// The upload screen loads its code (pdf.js, Supabase) only when opened.
function openUpload() {
  CUR = null;
  head(t("upload.eyebrow"), t("upload.title"), t("upload.lede"), t("upload.foot"));
  show("upload"); setHash("upload");
  import("../upload/ui.js").then((m) => m.open({ opened: (id) => { SUBJECTS = loadSubjects(); openSubject(id); } }));
}

$("crumb").onclick = goHome;
function route() {
  SUBJECTS = loadSubjects();
  const h = decodeURIComponent(location.hash.slice(1));
  // The sign-in link comes back with ?code=..., which the upload screen turns into a session.
  if (h === "upload" || /[?&]code=/.test(location.search)) openUpload();
  else if (SUBJECTS.some((x) => x.id === h)) openSubject(h); else goHome();
}
route();
window.addEventListener("hashchange", route);
