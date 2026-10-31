// The upload screen: sign in, AI consent, pick files, then the pipeline runs and the new subject opens.
// Loaded only when the screen opens, so pdf.js and Supabase stay out of the first page load.
import { t, getLang } from "../i18n/index.js";
import { loadSubjects, saveSubjects, progressKey } from "../app/subjects.js";
import * as cloud from "../cloud/supabase.js";
import { extractFile, ExtractError, TYPES } from "./extract.js";
import { buildSubject, DEFAULT_MAKE } from "./pipeline.js";

const CONSENT_KEY = "studyapp-ai-consent";
const MAKE_KEY = "studyapp-make";
const MAX_FILES = 10;
const $ = (id) => document.getElementById(id);
const PANELS = ["upOff", "upLogin", "upConsent", "upForm", "upWork"];

let ctx, picked = [], busy = false, make = { ...DEFAULT_MAKE };
try { make = { ...make, ...JSON.parse(localStorage.getItem(MAKE_KEY)) }; } catch (e) {}

// The subject the files go into, when adding to one that exists.
const target = () => (ctx && ctx.target ? loadSubjects().find((x) => x.id === ctx.target) : null);

function panel(id) { PANELS.forEach((p) => ($(p).hidden = p !== id)); }
function error(msg) { $("upErr").textContent = msg || ""; $("upErr").hidden = !msg; }
function usd(n) { return "$" + (Math.round(n * 100) / 100).toFixed(2); }
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

function message(e) {
  if (e instanceof ExtractError) return t("upload.err." + e.code, e.vars);
  if (e instanceof cloud.CloudError) {
    const k = "upload.err." + e.code;
    return t(k) === k ? t("upload.err.server", { msg: e.message }) : t(k);
  }
  return t("upload.err.server", { msg: e.message || String(e) });
}

// The monthly limit as a bar. The plan counts pages later; for now the cap is in dollars.
function showUsage(u) {
  if (!u) return;
  const pct = u.limitUsd > 0 ? Math.min(100, Math.round((u.monthUsd / u.limitUsd) * 100)) : 0;
  $("upLimitBar").style.width = pct + "%";
  $("upLimit").classList.toggle("warn", pct >= 80);
  $("upUsage").textContent = t("upload.usage", { pct, spent: usd(u.monthUsd), limit: usd(u.limitUsd) });
  $("upLimit").hidden = false;
}

function renderMake() {
  [...$("upMake").children].forEach((b) => b.setAttribute("aria-pressed", !!make[b.dataset.k]));
  [...$("upAmount").querySelectorAll("button")].forEach((b) => b.setAttribute("aria-pressed", +b.dataset.a === make.amount));
  $("upAmount").hidden = !make.quiz;
  $("upMakeHint").hidden = make.summary || make.quiz;
  try { localStorage.setItem(MAKE_KEY, JSON.stringify(make)); } catch (e) {}
}

async function refresh() {
  error("");
  if (!cloud.configured) { panel("upOff"); return; }
  let s;
  try { s = await cloud.session(); } catch (e) { error(message(e)); }
  if (!s) { panel("upLogin"); return; }
  let agreed = false; try { agreed = localStorage.getItem(CONSENT_KEY) === "1"; } catch (e) {}
  if (!agreed) { panel("upConsent"); return; }
  $("upWho").textContent = t("upload.signedIn", { email: s.user.email || "" });
  const into = target();
  $("upNameBox").hidden = !!into; $("upInto").hidden = !into;
  if (into) $("upInto").textContent = t("upload.into", { name: into.name });
  $("upGo").textContent = t(into ? "upload.goAdd" : "upload.go");
  panel("upForm"); renderMake(); renderPicked();
  try { showUsage((await cloud.call("usage", {}, getLang())).usage); } catch (e) { error(message(e)); }
}

function renderPicked() {
  const ul = $("upList"); ul.innerHTML = "";
  picked.forEach((f, k) => {
    const li = el("li", "up-file");
    const rm = el("button", "link", t("upload.remove")); rm.type = "button";
    rm.onclick = () => { picked.splice(k, 1); renderPicked(); };
    li.append(el("span", null, f.name), el("span", "qid", Math.max(1, Math.round(f.size / 1024)) + " kB"), rm);
    ul.appendChild(li);
  });
  ul.hidden = !picked.length;
  const ok = picked.length && (ctx.target || $("upName").value.trim()) && (make.summary || make.quiz);
  $("upGo").disabled = !ok; $("upGo").style.opacity = ok ? 1 : 0.5;
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

async function run() {
  if (busy) return;
  const into = target();
  const name = into ? into.name : $("upName").value.trim();
  if (!name || !picked.length || !(make.summary || make.quiz)) return;
  busy = true; error(""); panel("upWork");
  const setFile = fileList(picked.map((f) => f.name));
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
    for (const [k, f] of picked.entries()) {
      progress((k / picked.length) * 10, t("upload.reading", { name: f.name }));
      setFile(k, "reading");
      try { docs.push(await extractFile(f)); }
      catch (e) { setFile(k, "failed"); throw new Error(f.name + ": " + message(e)); }
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
      onStep: (done, total) => {
        progress(10 + (done / total) * 90, t(done === total ? "upload.finishing" : "upload.working", { done, total }));
        if (done >= 2 && done < total) {
          const left = ((Date.now() - began) / done) * (total - done) / 60000;
          $("upEta").textContent = left < 1 ? t("upload.etaSoon") : t("upload.eta", { min: Math.ceil(left) });
        } else $("upEta").textContent = "";
      },
    });
    if (!subject.questions.length && !subject.files.some((f) => f.summary)) throw new Error(t("upload.err.nothing"));
    const { renamed, ...saved } = subject;
    if (into) {
      saveSubjects(loadSubjects().map((x) => (x.id === into.id ? saved : x)));
      moveProgress(saved, renamed || {});
    } else saveSubjects([...loadSubjects(), saved]);
    progress(100);
    picked = []; $("upName").value = ""; $("upFiles").value = "";
    ctx.opened(saved.id);
  } catch (e) {
    panel("upForm"); renderPicked();
    error(e instanceof Error && !(e instanceof cloud.CloudError) && !(e instanceof ExtractError) ? e.message : message(e));
  } finally {
    busy = false;
  }
}

// Topics are sorted again when files are added, which changes question ids; the progress follows them.
function moveProgress(sj, renamed) {
  if (!Object.keys(renamed).length) return;
  const key = progressKey(sj);
  let p = {}; try { p = JSON.parse(localStorage.getItem(key)) || {}; } catch (e) {}
  const out = {};
  Object.keys(p).forEach((id) => { out[renamed[id] || id] = p[id]; });
  try { localStorage.setItem(key, JSON.stringify(out)); } catch (e) {}
}

let wired = false;
function wire() {
  if (wired) return; wired = true;
  $("upFiles").accept = TYPES.join(",");
  const askCode = (on) => { $("upAsk").hidden = on; $("upCodeBox").hidden = !on; if (on) $("upCode").focus(); };
  $("upSend").onclick = async () => {
    const email = $("upEmail").value.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { error(t("upload.err.email")); return; }
    error(""); $("upSend").disabled = true;
    try { await cloud.signIn(email); $("upSent").textContent = t("upload.sent", { email }); $("upCode").value = ""; askCode(true); }
    catch (e) { error(message(e)); }
    finally { $("upSend").disabled = false; }
  };
  $("upVerify").onclick = async () => {
    const code = $("upCode").value.replace(/\s/g, "");
    if (!/^\d{6,10}$/.test(code)) { error(t("upload.err.codeFormat")); return; }
    error(""); $("upVerify").disabled = true;
    try { await cloud.verifyCode($("upEmail").value.trim(), code); askCode(false); await refresh(); }
    catch (e) { error(message(e)); }
    finally { $("upVerify").disabled = false; }
  };
  $("upCode").onkeydown = (e) => { if (e.key === "Enter") $("upVerify").click(); };
  $("upAgain").onclick = () => { error(""); askCode(false); };
  $("upAgree").onclick = () => { try { localStorage.setItem(CONSENT_KEY, "1"); } catch (e) {} refresh(); };
  $("upFiles").onchange = () => {
    error("");
    for (const f of $("upFiles").files) if (!picked.some((p) => p.name === f.name && p.size === f.size)) picked.push(f);
    if (picked.length > MAX_FILES) { picked = picked.slice(0, MAX_FILES); error(t("upload.err.tooMany", { max: MAX_FILES })); }
    $("upFiles").value = "";
    renderPicked();
  };
  $("upName").oninput = renderPicked;
  $("upMake").onclick = (e) => {
    const b = e.target.closest("button"); if (!b) return;
    make[b.dataset.k] = !make[b.dataset.k]; renderMake(); renderPicked();
  };
  $("upAmount").onclick = (e) => {
    const b = e.target.closest("button"); if (!b) return;
    make.amount = +b.dataset.a; renderMake();
  };
  $("upGo").onclick = run;
  $("upOut").onclick = async () => { await cloud.signOut(); refresh(); };
}

// app: { opened(subjectId), target } from the home screen; target is the id of a subject to add files to.
export function open(app) {
  if (!busy) { if (ctx && ctx.target !== app.target) picked = []; ctx = app; }
  wire();
  if (!busy) refresh();
}

