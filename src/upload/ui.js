// The upload screen: sign in, AI consent, pick files, then the pipeline runs and the new subject opens.
// Loaded only when the screen opens, so pdf.js and Supabase stay out of the first page load.
import { t, getLang } from "../i18n/index.js";
import { loadSubjects, saveSubjects } from "../app/subjects.js";
import * as cloud from "../cloud/supabase.js";
import { extractFile, ExtractError, TYPES } from "./extract.js";
import { buildSubject } from "./pipeline.js";

const CONSENT_KEY = "studyapp-ai-consent";
const MAX_FILES = 10;
const $ = (id) => document.getElementById(id);
const PANELS = ["upOff", "upLogin", "upConsent", "upForm", "upWork"];

let ctx, picked = [], busy = false;

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

function showUsage(u) {
  if (u) $("upUsage").textContent = t("upload.usage", { spent: usd(u.monthUsd), limit: usd(u.limitUsd) });
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
  panel("upForm"); renderPicked();
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
  const ok = picked.length && $("upName").value.trim();
  $("upGo").disabled = !ok; $("upGo").style.opacity = ok ? 1 : 0.5;
}

async function run() {
  if (busy) return;
  const name = $("upName").value.trim();
  if (!name || !picked.length) return;
  busy = true; error(""); panel("upWork");
  const bar = $("upBar"), stepText = $("upStep");
  const progress = (done, total, label) => { bar.style.width = Math.round((done / total) * 100) + "%"; stepText.textContent = label; };
  try {
    const docs = [];
    for (const [k, f] of picked.entries()) {
      progress(k, picked.length * 4, t("upload.reading", { name: f.name }));
      try { docs.push(await extractFile(f)); }
      catch (e) { throw new Error(f.name + ": " + message(e)); }
    }
    let usage = null;
    const call = async (task, input) => {
      const out = await cloud.call(task, input, getLang());
      usage = out.usage;
      return out.result;
    };
    const subject = await buildSubject({
      name, docs, call, otherTopic: t("upload.otherTopic"),
      onStep: (done, total) => progress(done, total, t("upload.working", { done, total })),
    });
    if (!subject.questions.length && !subject.files.some((f) => f.summary)) throw new Error(t("upload.err.nothing"));
    saveSubjects([...loadSubjects(), subject]);
    showUsage(usage);
    picked = []; $("upName").value = ""; $("upFiles").value = "";
    ctx.opened(subject.id);
  } catch (e) {
    panel("upForm"); renderPicked();
    error(e instanceof Error && !(e instanceof cloud.CloudError) && !(e instanceof ExtractError) ? e.message : message(e));
  } finally {
    busy = false;
  }
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
  $("upGo").onclick = run;
  $("upOut").onclick = async () => { await cloud.signOut(); refresh(); };
}

// app: { opened(subjectId) } from the home screen.
export function open(app) {
  ctx = app; wire();
  if (!busy) refresh();
}

