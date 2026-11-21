// Landing + passwordless Sign In / Sign Up controller.
// Lazy-loads Supabase so first paint stays fast when opening directly into the app.
import { t, getLang } from "../i18n/index.js";
import { syncNow } from "./autosync.js";

const $ = (id) => document.getElementById(id);
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

let wired = false, mode = "in", pendingEmail = "", resendLeft = 0, resendTimer = 0;
let hooks = null;

function err(msg) {
  const box = $("wErr");
  box.textContent = msg || "";
  box.hidden = !msg;
}

function stopTimer() {
  clearInterval(resendTimer);
  resendTimer = 0;
  resendLeft = 0;
}

function updateResend() {
  const b = $("wResend");
  if (resendLeft > 0) {
    b.disabled = true;
    b.textContent = t("welcome.resendWait", { sec: resendLeft });
  } else {
    b.disabled = false;
    b.textContent = t("welcome.resendNow");
  }
}

function startResend(sec = 60) {
  stopTimer();
  resendLeft = sec;
  updateResend();
  resendTimer = setInterval(() => {
    resendLeft--;
    if (resendLeft <= 0) stopTimer();
    updateResend();
  }, 1000);
}

function setMode(next) {
  mode = next === "up" ? "up" : "in";
  const tabs = [...$("wModeTabs").querySelectorAll("button")];
  tabs.forEach((b) => b.setAttribute("aria-pressed", b.dataset.auth === mode ? "true" : "false"));
  $("wModeTabs").style.setProperty("--n", tabs.length);
  $("wModeTabs").style.setProperty("--i", mode === "up" ? 1 : 0);
  $("wCardTitle").textContent = mode === "up" ? t("welcome.upTitle") : t("welcome.inTitle");
  $("wCardSub").textContent = mode === "up" ? t("welcome.upSub") : t("welcome.inSub");
  $("wSend").textContent = mode === "up" ? t("welcome.sendUp") : t("welcome.sendIn");
  $("wAgreeWrap").hidden = mode !== "up";
  err("");
}

function showCodeStep(on) {
  $("wAsk").hidden = on;
  $("wCodeBox").hidden = !on;
  if (on) $("wCode").focus();
}

function authMessage(e) {
  if (e && e.code) {
    const k = "upload.err." + e.code;
    return t(k) === k ? t("upload.err.server", { msg: e.message || e.code }) : t(k, { msg: e.message || "" });
  }
  return t("upload.err.server", { msg: (e && e.message) || String(e) });
}

function syncLangButtons() {
  const l = getLang();
  [...$("wLangs").querySelectorAll("button")].forEach((b) => b.setAttribute("aria-pressed", b.dataset.lang === l ? "true" : "false"));
}

async function refreshAuthState() {
  err("");
  const cloud = await import("../cloud/supabase.js");
  $("wOffNote").hidden = cloud.configured;
  if (!cloud.configured) {
    $("wSignedBox").hidden = true;
    $("wAuthForms").hidden = false;
    $("wNavCta").textContent = t("welcome.navCta");
    $("wNavCta").dataset.action = "focus";
    return;
  }
  let s = null;
  try { s = await cloud.session(); } catch (e) {}
  if (s && s.user) {
    const email = s.user.email || "";
    $("wAvatar").textContent = email.slice(0, 1).toUpperCase();
    $("wSignedEmail").textContent = email;
    $("wSignedBox").hidden = false;
    $("wAuthForms").hidden = true;
    $("wNavCta").textContent = t("welcome.navOpen");
    $("wNavCta").dataset.action = "app";
  } else {
    $("wSignedBox").hidden = true;
    $("wAuthForms").hidden = false;
    $("wNavCta").textContent = t("welcome.navCta");
    $("wNavCta").dataset.action = "focus";
  }
}

function wire() {
  if (wired) return;
  wired = true;

  $("wModeTabs").onclick = (e) => {
    const b = e.target.closest("button[data-auth]");
    if (b) setMode(b.dataset.auth);
  };

  $("wBrand").onclick = () => window.scrollTo({ top: 0, behavior: "smooth" });

  $("wNavLinks").onclick = (e) => {
    const a = e.target.closest("a[data-jump]");
    if (!a) return;
    e.preventDefault();
    const target = $(a.dataset.jump);
    if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  $("wNavCta").onclick = () => {
    if ($("wNavCta").dataset.action === "app") {
      hooks.enterApp();
      return;
    }
    $("wAuthCard").scrollIntoView({ behavior: "smooth", block: "center" });
    if (!$("wAsk").hidden) $("wEmail").focus({ preventScroll: true });
    else if (!$("wCodeBox").hidden) $("wCode").focus({ preventScroll: true });
  };

  $("wGuest").onclick = () => hooks.enterApp();
  $("wFootOpen").onclick = () => hooks.enterApp();
  $("wContinue").onclick = () => hooks.enterApp();

  $("wSignOut").onclick = async () => {
    $("wSignOut").disabled = true;
    try { await hooks.signOut(); } finally { $("wSignOut").disabled = false; }
  };

  $("wSend").onclick = async () => {
    const email = $("wEmail").value.trim();
    if (!EMAIL_RE.test(email)) { err(t("upload.err.email")); $("wEmail").focus(); return; }
    if (mode === "up" && !$("wAgree").checked) { err(t("welcome.agreeErr")); $("wAgree").focus(); return; }
    err("");
    const cloud = await import("../cloud/supabase.js");
    if (!cloud.configured) { err(t("welcome.offNote")); return; }
    $("wSend").disabled = true;
    try {
      await cloud.signIn(email);
      pendingEmail = email;
      $("wSent").textContent = t("upload.sent", { email });
      $("wCode").value = "";
      showCodeStep(true);
      startResend(60);
    } catch (e) {
      err(authMessage(e));
    } finally {
      $("wSend").disabled = false;
    }
  };

  $("wVerify").onclick = async () => {
    const code = $("wCode").value.replace(/\s/g, "");
    if (!/^\d{6,10}$/.test(code)) { err(t("upload.err.codeFormat")); $("wCode").focus(); return; }
    err("");
    const cloud = await import("../cloud/supabase.js");
    if (!cloud.configured) { err(t("welcome.offNote")); return; }
    $("wVerify").disabled = true;
    try {
      await cloud.verifyCode(pendingEmail || $("wEmail").value.trim(), code);
      stopTimer();
      showCodeStep(false);
      await syncNow(true);
      hooks.toast(t("profile.signedInToast"));
      hooks.enterApp();
    } catch (e) {
      err(authMessage(e));
    } finally {
      $("wVerify").disabled = false;
    }
  };

  $("wResend").onclick = async () => {
    if (resendLeft > 0 || !pendingEmail) return;
    err("");
    const cloud = await import("../cloud/supabase.js");
    if (!cloud.configured) { err(t("welcome.offNote")); return; }
    $("wResend").disabled = true;
    try {
      await cloud.signIn(pendingEmail);
      $("wSent").textContent = t("upload.sent", { email: pendingEmail });
      startResend(60);
    } catch (e) {
      err(authMessage(e));
      updateResend();
    }
  };

  $("wChangeEmail").onclick = () => {
    stopTimer();
    err("");
    showCodeStep(false);
    $("wEmail").focus();
  };

  $("wEmail").onkeydown = (e) => { if (e.key === "Enter") $("wSend").click(); };
  $("wCode").onkeydown = (e) => { if (e.key === "Enter") $("wVerify").click(); };

  $("welcome").addEventListener("click", (e) => {
    const leg = e.target.closest("[data-legal]");
    if (leg) hooks.openLegal(leg.dataset.legal);
  });

  $("wLangs").onclick = (e) => {
    const b = e.target.closest("button[data-lang]");
    if (!b) return;
    hooks.setLangUI(b.dataset.lang);
    syncLangButtons();
    setMode(mode);
    updateResend();
    refreshAuthState();
  };
}

export function openWelcome(nextHooks, initialMode = "in") {
  hooks = nextHooks;
  wire();
  syncLangButtons();
  setMode(initialMode);
  showCodeStep(false);
  stopTimer();
  refreshAuthState();
}
