// The upload screen: sign in, AI consent, pick files, then the pipeline runs and the new subject opens.
// Loaded only when the screen opens, so pdf.js and Supabase stay out of the first page load.
import { t, getLang } from "../i18n/index.js";
import { loadSubjects, saveSubjects, createSubject, loadMeta, removeSamples } from "../app/subjects.js";
import { syncNow } from "../app/autosync.js";
import * as cloud from "../cloud/supabase.js";
import { extractFile, extractPhotos, preloadPdf, ExtractError, TYPES, PHOTO_TYPES, ACCEPT_FILES, ACCEPT_EXAMS, MAX_PICTURES, MAX_FREE_PICTURES, ext } from "./extract.js";
import { buildSubject, DEFAULT_MAKE, contextOf } from "./pipeline.js";
import { readExams, guessYear } from "./exams.js";
import { readTemplates } from "./templates.js";
import { icon } from "../app/icons.js";
import { renderLimit, limitInfo, getCachedUsage, isPlusActive } from "../app/limit.js";
import { mountAuth } from "../app/welcome.js";

const CONSENT_KEY = "studyapp-ai-consent";
const MAKE_KEY = "studyapp-make";
const MAX_FILES = 10;
const $ = (id) => document.getElementById(id);
const PANELS = ["upOff", "upLogin", "upConsent", "upForm", "upWork"];

// Picked course files: [{ file: File, context: boolean }]. Past exam / template mode: [{ files: [File], photos: bool, name, year }].
let ctx, picked = [], busy = false, make = { ...DEFAULT_MAKE };
let exams = [];
const examMode = () => !!(ctx && ctx.mode === "exams");
const templateMode = () => !!(ctx && ctx.mode === "templates");
const photoMode = () => examMode() || templateMode();
const onlyContext = () => !photoMode() && picked.length > 0 && picked.every((x) => x.context);
try { make = { ...make, ...JSON.parse(localStorage.getItem(MAKE_KEY)) }; } catch (e) {}

// The subject the files go into, when adding to one that exists.
const target = () => (ctx && ctx.target ? loadSubjects().find((x) => x.id === ctx.target) : null);

// The three dots at the top: 1 pick files, 2 choose what to make, 3 processing.
function dots(n) {
  $("upDots").hidden = !n;
  [...$("upDots").children].forEach((d, k) => d.classList.toggle("on", k < n));
}
function panel(id) {
  PANELS.forEach((p) => ($(p).hidden = p !== id));
  dots(id === "upWork" ? 3 : id === "upForm" ? ($("upStep2").hidden ? 1 : 2) : 0);
}
function step(n) { $("upStep1").hidden = n !== 1; $("upStep2").hidden = n !== 2; dots(n); }
function error(msg) {
  $("upErr").textContent = msg || "";
  $("upErr").hidden = !msg;
}
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

function message(e) {
  if (e instanceof ExtractError) return t("upload.err." + e.code, e.vars);
  if (e && e.code === "no_questions") return t("upload.err.no_questions");
  if (e && e.code === "no_templates") return t("upload.err.no_templates");
  if (e instanceof cloud.CloudError) {
    const k = "upload.err." + e.code;
    return t(k) === k ? t("upload.err.server", { msg: e.message }) : t(k, { msg: e.message });
  }
  return t("upload.err.server", { msg: e.message || String(e) });
}

// The monthly limit as a structured quota meter.
function showUsage(u) {
  renderLimit($("upLimit"), u, t);
  renderMake();
}

function maybeOpenPlusForError(code) {
  if (!ctx?.openPlus) return;
  if (code === "plus_required") ctx.openPlus(examMode() ? "exams" : templateMode() ? "templates" : "problems");
  else if (code === "user_limit" && !isPlusActive()) ctx.openPlus("limit");
}

function goLabel() {
  if (examMode()) return t("upload.goExams");
  if (templateMode()) return t("upload.goTemplates");
  if (ctx?.target) return t("upload.goAdd");
  if (onlyContext()) return t("upload.goContext");
  if (make.problems && !make.quiz) return t("upload.goProblems");
  return t("upload.go");
}

function renderMake() {
  const onlyCtx = onlyContext();
  const knownFree = Boolean(getCachedUsage()) && !isPlusActive();
  if (knownFree && make.problems) make.problems = false;
  const probBtn = $("upMake").querySelector('[data-k="problems"]');
  if (probBtn) probBtn.textContent = t(knownFree ? "upload.makeProblemsPlus" : "upload.makeProblems");
  const hasPractice = !!(make.quiz || make.problems);
  [...$("upMake").children].forEach((b) => b.setAttribute("aria-pressed", !!make[b.dataset.k]));
  [...$("upAmount").querySelectorAll("button")].forEach((b) => b.setAttribute("aria-pressed", +b.dataset.a === make.amount));
  $("upMakeBox").hidden = photoMode() || onlyCtx;
  $("upAmount").hidden = !hasPractice;
  $("upMakeHint").hidden = make.summary || hasPractice || onlyCtx;
  try { localStorage.setItem(MAKE_KEY, JSON.stringify(make)); } catch (e) {}
}

async function refresh() {
  error("");
  if (!cloud.configured) { panel("upOff"); return; }
  let s;
  try { s = await cloud.session(); } catch (e) { error(message(e)); }
  if (!s) {
    panel("upLogin");
    mountAuth($("upAuthMount"), {
      openLegal: ctx?.openLegal,
      onSignedIn: async (msg) => {
        if (msg && ctx?.toast) ctx.toast(msg);
        await refresh();
      },
    });
    return;
  }
  // Magic-link (?code=...) sign-in creates a session here without passing through verifyCode.
  if (loadMeta().user !== s.user.id) await syncNow(true);
  removeSamples();
  if (ctx.target && !loadSubjects().some((x) => x.id === ctx.target)) {
    ctx.target = null;
    if (photoMode()) ctx.mode = "files";
    $("upTitle").textContent = t("upload.title");
    $("upLede").textContent = t("upload.lede");
  }
  // Opened from Profile only to sign in: that is done, so go back there.
  if (ctx.signIn) { ctx.done(); return; }
  let agreed = false; try { agreed = localStorage.getItem(CONSENT_KEY) === "1"; } catch (e) {}
  if (!agreed) { panel("upConsent"); return; }
  $("upWho").textContent = t("upload.signedIn", { email: s.user.email || "" });
  $("upFiles").accept = photoMode() ? ACCEPT_EXAMS : ACCEPT_FILES;
  $("upFilesHint").textContent = t(examMode() ? "upload.examsHint" : templateMode() ? "upload.templatesHint" : "upload.filesHint");
  $("upMakeBox").hidden = photoMode();
  renderSubjects(); step(1);
  panel("upForm"); renderMake(); renderPicked();
  const cached = getCachedUsage();
  if (cached) showUsage(cached);
  try {
    showUsage((await cloud.call("usage", {}, getLang())).usage);
    if (photoMode() && getCachedUsage() && !isPlusActive()) error(t("upload.err.plus_required"));
  } catch (e) { error(message(e)); }
}

// The subject the files go into: one that exists, or a new one with a name.
function renderSubjects() {
  const all = loadSubjects(), sel = $("upSubject");
  if (ctx.target && !all.some((x) => x.id === ctx.target)) ctx.target = null;
  sel.replaceChildren(...all.map((x) => new Option(x.name, x.id)), new Option(t("upload.newSubject"), ""));
  sel.value = ctx.target || "";
  $("upSubjectBox").hidden = !all.length || photoMode();
  $("upNameBox").hidden = !!ctx.target;
  $("upGo").textContent = goLabel();
}

// Each exam (with year) or worked-example template source to read.
function renderExams() {
  const ul = $("upList"); ul.innerHTML = "";
  const isExam = examMode();
  exams.forEach((x, k) => {
    const li = el("li", "up-file");
    const name = x.photos ? t("upload.photoExam", { name: x.name, n: x.files.length }) : x.name;
    const rm = el("button", "iconbtn small"); rm.type = "button";
    rm.setAttribute("aria-label", t("upload.remove") + ": " + name); rm.appendChild(icon("x"));
    rm.onclick = () => { exams.splice(k, 1); renderPicked(); };
    const art = el("span", "file-art"); art.appendChild(icon("doc"));
    li.append(art, el("span", "grow", name));
    if (isExam) {
      const year = el("input", "search year");
      Object.assign(year, { type: "number", inputMode: "numeric", min: 1990, max: new Date().getFullYear() + 1, placeholder: t("upload.year"), value: x.year || "" });
      year.setAttribute("aria-label", t("upload.yearOf", { name: x.name }));
      year.oninput = () => { const y = parseInt(year.value, 10); x.year = y >= 1990 && y <= 2100 ? y : null; };
      li.appendChild(year);
    }
    li.appendChild(rm);
    ul.appendChild(li);
  });
  $("upCtxWrap").hidden = true;
  $("upCtxWrap").classList.remove("open");
  $("upCtxTip").setAttribute("aria-expanded", "false");
  ul.hidden = !exams.length;
  $("upFilesLabel").textContent = t("upload.filesLabel");
  $("upNext").textContent = t("upload.next");
  const ready = exams.length > 0 && !!target();
  $("upNext").disabled = !ready;
  $("upGo").disabled = !ready;
}

function renderPicked() {
  if (photoMode()) { renderExams(); return; }
  const ul = $("upList"); ul.innerHTML = "";
  const tip = t("upload.contextHint");
  picked.forEach((item, k) => {
    const li = el("li", "up-file");
    const ctxBtn = el("button", "tiny up-ctx", t("upload.context"));
    ctxBtn.type = "button";
    ctxBtn.dataset.tip = tip;
    ctxBtn.setAttribute("aria-pressed", item.context ? "true" : "false");
    ctxBtn.onclick = () => { item.context = !item.context; renderMake(); renderPicked(); };
    const rm = el("button", "iconbtn small"); rm.type = "button";
    rm.setAttribute("aria-label", t("upload.remove") + ": " + item.file.name); rm.appendChild(icon("x"));
    rm.onclick = () => { picked.splice(k, 1); renderMake(); renderPicked(); };
    const art = el("span", "file-art"); art.appendChild(icon("doc"));
    li.append(art, el("span", "grow", item.file.name), el("span", "qid", Math.max(1, Math.round(item.file.size / 1024)) + " kB"), ctxBtn, rm);
    ul.appendChild(li);
  });
  ul.hidden = !picked.length;
  $("upCtxWrap").hidden = !picked.length;
  if (!picked.length) {
    $("upCtxWrap").classList.remove("open");
    $("upCtxTip").setAttribute("aria-expanded", "false");
  }
  const onlyCtx = onlyContext();
  $("upGo").textContent = goLabel();
  const name = $("upName").value.trim();
  const newSubject = !ctx.target;
  const canCreateEmpty = newSubject && !picked.length;
  $("upFilesLabel").textContent = t(newSubject ? "upload.filesOptional" : "upload.filesLabel");
  $("upNext").textContent = t(canCreateEmpty ? "subject.createEmpty" : "upload.next");
  const ready = canCreateEmpty ? !!name : (picked.length && (ctx.target || name));
  const ok = picked.length && (ctx.target || name) && (make.summary || make.quiz || make.problems || onlyCtx);
  $("upNext").disabled = !ready;
  $("upGo").disabled = !ok;
}

const STATE = {
  wait: "upload.state.wait", reading: "upload.state.reading", read: "upload.state.read",
  ai: "upload.state.ai", done: "upload.state.done", failed: "upload.state.failed",
};
function fileList(names) {
  const ul = $("upSteps"); ul.innerHTML = "";
  names.forEach((n) => { const li = el("li"); li.append(el("span", "st", ""), el("span", null, n)); li.dataset.state = "wait"; ul.appendChild(li); });
  return (k, state) => {
    const li = ul.children[k]; if (!li) return;
    li.dataset.state = state; li.firstChild.textContent = t(STATE[state]);
  };
}

async function runExams() {
  const into = target();
  if (busy || !into || !exams.length) return;
  if (getCachedUsage() && !isPlusActive()) {
    error(t("upload.err.plus_required"));
    maybeOpenPlusForError("plus_required");
    return;
  }
  busy = true; error(""); panel("upWork");
  const setFile = fileList(exams.map((x) => x.name));
  exams.forEach((_, k) => setFile(k, "wait"));
  const progress = (pct, label) => {
    pct = Math.max(0, Math.min(100, Math.round(pct)));
    $("upBar").style.width = pct + "%"; $("upPct").textContent = pct + " %";
    if (label) $("upStep").textContent = label;
  };
  $("upEta").textContent = "";
  try {
    const items = [];
    for (const [k, x] of exams.entries()) {
      progress((k / exams.length) * 10, t("upload.reading", { name: x.name }));
      setFile(k, "reading");
      let doc;
      try { doc = x.photos ? await extractPhotos(x.files) : await extractFile(x.files[0], { minChars: 40 }); }
      catch (e) { setFile(k, "failed"); throw new Error(x.name + ": " + message(e)); }
      setFile(k, "read");
      items.push({ doc, name: x.name, year: x.year });
    }
    const call = async (task, input) => {
      const out = await cloud.call(task, input, getLang());
      showUsage(out.usage);
      return out.result;
    };
    const knownTopics = Object.keys(into.topics || {}).filter((k) => k !== "t0").map((k) => into.topics[k]);
    const { exams: all, added, failed } = await readExams({
      items, knownTopics, earlier: into.exams || [], context: contextOf(into.files), call,
      onFile: (k, phase) => setFile(k, phase),
      onRetry: () => { $("upStep").textContent = t("upload.retrying"); },
      onStep: (done, total) => progress(10 + (done / total) * 90, t(done === total ? "upload.finishing" : "upload.examsWorking", { done, total })),
    });
    saveSubjects(loadSubjects().map((x) => (x.id === into.id ? { ...x, exams: all } : x)));
    progress(100);
    $("upFiles").value = "";
    if (failed.length) {
      const left = new Set(failed.map((f) => f.index));
      exams = exams.filter((_, k) => left.has(k));
      step(2); panel("upForm"); renderPicked();
      error(t("upload.partialExams", { done: added, failed: failed.map((f) => f.name).join(", "), reason: message(failed[0].error) }));
      maybeOpenPlusForError(failed[0].code);
      return;
    }
    exams = [];
    ctx.opened(into.id, "exams");
  } catch (e) {
    step(2); panel("upForm"); renderPicked();
    error(e instanceof Error && !(e instanceof cloud.CloudError) && !(e instanceof ExtractError) && !e.code ? e.message : message(e));
    maybeOpenPlusForError(e?.code);
  } finally {
    busy = false;
  }
}

async function runTemplates() {
  const into = target();
  if (busy || !into || !exams.length) return;
  if (getCachedUsage() && !isPlusActive()) {
    error(t("upload.err.plus_required"));
    maybeOpenPlusForError("plus_required");
    return;
  }
  busy = true; error(""); panel("upWork");
  const setFile = fileList(exams.map((x) => x.name));
  exams.forEach((_, k) => setFile(k, "wait"));
  const progress = (pct, label) => {
    pct = Math.max(0, Math.min(100, Math.round(pct)));
    $("upBar").style.width = pct + "%"; $("upPct").textContent = pct + " %";
    if (label) $("upStep").textContent = label;
  };
  $("upEta").textContent = "";
  try {
    const items = [];
    for (const [k, x] of exams.entries()) {
      progress((k / exams.length) * 10, t("upload.reading", { name: x.name }));
      setFile(k, "reading");
      let doc;
      try { doc = x.photos ? await extractPhotos(x.files) : await extractFile(x.files[0], { minChars: 40, preferImages: true }); }
      catch (e) { setFile(k, "failed"); throw new Error(x.name + ": " + message(e)); }
      setFile(k, "read");
      items.push({ doc, name: x.name });
    }
    const call = async (task, input) => {
      const out = await cloud.call(task, input, getLang());
      showUsage(out.usage);
      return out.result;
    };
    const knownTopics = Object.keys(into.topics || {}).filter((k) => k !== "t0").map((k) => into.topics[k]);
    const { templates: all, added, failed } = await readTemplates({
      items, knownTopics, earlier: into.templates || [], context: contextOf(into.files), call,
      onFile: (k, phase) => setFile(k, phase),
      onRetry: () => { $("upStep").textContent = t("upload.retrying"); },
      onStep: (done, total) => progress(10 + (done / total) * 90, t(done === total ? "upload.finishing" : "upload.templatesWorking", { done, total })),
    });
    saveSubjects(loadSubjects().map((x) => (x.id === into.id ? { ...x, templates: all } : x)));
    progress(100);
    $("upFiles").value = "";
    if (failed.length) {
      const left = new Set(failed.map((f) => f.index));
      exams = exams.filter((_, k) => left.has(k));
      step(2); panel("upForm"); renderPicked();
      error(t("upload.partialTemplates", { done: added, failed: failed.map((f) => f.name).join(", "), reason: message(failed[0].error) }));
      maybeOpenPlusForError(failed[0].code);
      return;
    }
    exams = [];
    ctx.opened(into.id, "templates");
  } catch (e) {
    step(2); panel("upForm"); renderPicked();
    error(e instanceof Error && !(e instanceof cloud.CloudError) && !(e instanceof ExtractError) && !e.code ? e.message : message(e));
    maybeOpenPlusForError(e?.code);
  } finally {
    busy = false;
  }
}

async function run() {
  if (examMode()) return runExams();
  if (templateMode()) return runTemplates();
  if (busy) return;
  const into = target();
  const name = into ? into.name : $("upName").value.trim();
  const onlyCtx = onlyContext();
  if (!name || !picked.length || !(make.summary || make.quiz || make.problems || onlyCtx)) return;
  busy = true; error(""); panel("upWork");
  const setFile = fileList(picked.map((x) => x.file.name));
  picked.forEach((_, k) => setFile(k, "wait"));
  // Reading the files on the device is the first tenth of the bar, the AI work the rest.
  const progress = (pct, label) => {
    pct = Math.max(0, Math.min(100, Math.round(pct)));
    $("upBar").style.width = pct + "%"; $("upPct").textContent = pct + " %";
    if (label) $("upStep").textContent = label;
  };
  $("upEta").textContent = "";
  try {
    const docs = [];
    const maxPictures = !getCachedUsage() || isPlusActive() ? MAX_PICTURES : MAX_FREE_PICTURES;
    for (const [k, item] of picked.entries()) {
      progress((k / picked.length) * 10, t("upload.reading", { name: item.file.name }));
      setFile(k, "reading");
      try { docs.push({ ...(await extractFile(item.file, { maxPictures })), context: !!item.context }); }
      catch (e) { setFile(k, "failed"); throw new Error(item.file.name + ": " + message(e)); }
      setFile(k, "read");
    }
    let usage = null;
    const call = async (task, input) => {
      const out = await cloud.call(task, input, getLang());
      usage = out.usage; showUsage(usage);
      return out.result;
    };
    const began = Date.now();
    const subject = await buildSubject({
      name, docs, call, make, existing: into, otherTopic: t("upload.otherTopic"),
      onFile: (k, phase) => setFile(k, phase),
      onRetry: () => { $("upStep").textContent = t("upload.retrying"); },
      onStep: (done, total) => {
        progress(10 + (done / total) * 90, t(done === total ? "upload.finishing" : "upload.working", { done, total }));
        if (done >= 2 && done < total) {
          const left = ((Date.now() - began) / done) * (total - done) / 60000;
          $("upEta").textContent = left < 1 ? t("upload.etaSoon") : t("upload.eta", { min: Math.ceil(left) });
        } else $("upEta").textContent = "";
      },
    });
    if (!subject.questions.length && !subject.files.some((f) => f.summary || (f.context && f.text))) throw new Error(t("upload.err.nothing"));
    const { failed = [], ...saved } = subject;
    if (into) saveSubjects(loadSubjects().map((x) => (x.id === into.id ? saved : x)));
    else saveSubjects([...loadSubjects(), saved]);
    progress(100);
    $("upName").value = ""; $("upFiles").value = "";
    if (failed.length) {
      // The finished files are saved; the failed ones stay picked, ready to be added to the same subject.
      const left = new Set(failed.map((f) => f.index));
      picked = picked.filter((_, k) => left.has(k));
      ctx.target = saved.id;
      step(2); panel("upForm"); renderSubjects(); renderPicked();
      const reason = message(failed[0].error);
      error(t("upload.partial", { done: saved.files.length - (into?.files?.length || 0), failed: failed.map((f) => f.name).join(", "), reason }));
      maybeOpenPlusForError(failed[0].code);
      return;
    }
    picked = [];
    ctx.opened(saved.id);
  } catch (e) {
    step(2); panel("upForm"); renderPicked();
    error(e instanceof Error && !(e instanceof cloud.CloudError) && !(e instanceof ExtractError) ? e.message : message(e));
    maybeOpenPlusForError(e?.code);
  } finally {
    busy = false;
  }
}

let wired = false;
function wire() {
  if (wired) return; wired = true;
  $("upAgree").onclick = () => { try { localStorage.setItem(CONSENT_KEY, "1"); } catch (e) {} refresh(); };
  $("upFiles").onchange = () => {
    error("");
    if ([...$("upFiles").files].some((f) => ext(f.name) === ".pdf")) preloadPdf();
    if (photoMode()) {
      // Every file is one exam/workbook; photos picked together are the pages of one item, in name order.
      const files = [...$("upFiles").files];
      const photos = files.filter((f) => PHOTO_TYPES.includes(ext(f.name))).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
      files.filter((f) => !photos.includes(f)).forEach((f) => {
        if (!exams.some((x) => !x.photos && x.files[0].name === f.name && x.files[0].size === f.size)) {
          exams.push({ files: [f], photos: false, name: f.name.replace(/\.[^.]+$/, ""), year: guessYear(f.name) });
        }
      });
      if (photos.length) exams.push({ files: photos, photos: true, name: photos[0].name.replace(/\.[^.]+$/, ""), year: guessYear(photos[0].name) });
      if (exams.length > MAX_FILES) { exams = exams.slice(0, MAX_FILES); error(t("upload.err.tooMany", { max: MAX_FILES })); }
      $("upFiles").value = "";
      renderPicked();
      return;
    }
    for (const f of $("upFiles").files) if (!picked.some((p) => p.file.name === f.name && p.file.size === f.size)) picked.push({ file: f, context: false });
    if (picked.length > MAX_FILES) { picked = picked.slice(0, MAX_FILES); error(t("upload.err.tooMany", { max: MAX_FILES })); }
    $("upFiles").value = "";
    renderMake(); renderPicked();
  };
  $("upName").oninput = renderPicked;
  $("upName").onkeydown = (e) => { if (e.key === "Enter" && !$("upNext").disabled) $("upNext").click(); };
  $("upSubject").onchange = () => { ctx.target = $("upSubject").value || null; renderSubjects(); renderPicked(); };
  $("upNext").onclick = () => {
    error("");
    if (!photoMode() && !ctx.target && !picked.length) {
      const name = $("upName").value.trim();
      if (!name) return;
      const saved = createSubject(name);
      saveSubjects([...loadSubjects(), saved]);
      $("upName").value = "";
      ctx.opened(saved.id, null, true);
      return;
    }
    step(2);
  };
  $("upPrev").onclick = () => { error(""); step(1); };
  $("upMake").onclick = (e) => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.k === "problems" && getCachedUsage() && !isPlusActive()) {
      if (ctx?.openPlus) ctx.openPlus("problems");
      else error(t("upload.err.plus_required"));
      return;
    }
    make[b.dataset.k] = !make[b.dataset.k]; renderMake(); renderPicked();
  };
  $("upAmount").onclick = (e) => {
    const b = e.target.closest("button"); if (!b) return;
    make.amount = +b.dataset.a; renderMake();
  };
  $("upGo").onclick = run;
  $("upUpgrade").onclick = () => {
    const info = limitInfo(getCachedUsage());
    if (ctx?.openPlus) ctx.openPlus(info?.state === "full" ? "limit" : "");
  };
  $("upOut").onclick = async () => {
    if (ctx && ctx.onSignOut) await ctx.onSignOut();
    else { await cloud.signOut(); refresh(); }
  };
  const setTip = (on) => { $("upCtxWrap").classList.toggle("open", on); $("upCtxTip").setAttribute("aria-expanded", on ? "true" : "false"); };
  $("upCtxTip").onclick = () => setTip(!$("upCtxWrap").classList.contains("open"));
  document.addEventListener("click", (e) => { if ($("upCtxWrap").classList.contains("open") && !$("upCtxWrap").contains(e.target)) setTip(false); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && $("upCtxWrap").classList.contains("open")) setTip(false); });
}

// app: { opened(subjectId, tab), target, mode, signIn, done() }; target is the id of a subject to add files to,
// mode "exams" reads old exams into that subject instead of course files,
// signIn means the screen was opened only to sign in and done() goes back.
export function open(app) {
  if (!busy) {
    if (ctx && (ctx.target !== app.target || ctx.mode !== app.mode)) { picked = []; exams = []; }
    ctx = app;
  }
  wire();
  if (!busy) refresh();
}

