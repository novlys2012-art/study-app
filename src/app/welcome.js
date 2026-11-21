// Landing + passwordless Sign In sheet controller.
// Lazy-loads Supabase so first paint stays fast when opening directly into the app.
import { t, getLang } from "../i18n/index.js";
import { syncNow } from "./autosync.js";
import { removeSamples } from "./subjects.js";
import { startRewrite, stopRewrite } from "./rewrite.js";
import {
  OTP_LENGTH,
  extractOtpDigits,
  authMessage as mapAuthMessage,
  readPendingAuth,
  writePendingAuth,
  clearPendingAuth,
} from "./auth-state.js";

const $ = (id) => document.getElementById(id);
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

let wired = false, pendingEmail = "", codeStep = false, busy = false, signedIn = false, resendLeft = 0, resendTimer = 0;
let hooks = null;

const FIELDS = ["wEmail", "wCode", "wAgree"];

export const authMessage = (e) => mapAuthMessage(e, t);

function clearFieldInvalid(id) {
  const f = $(id);
  if (!f) return;
  f.removeAttribute("aria-invalid");
  f.removeAttribute("aria-describedby");
}

function err(msg, fieldId) {
  const box = $("wErr");
  if (!box) return;
  box.textContent = msg || "";
  box.hidden = !msg;
  FIELDS.forEach(clearFieldInvalid);
  if (msg && fieldId && $(fieldId)) {
    $(fieldId).setAttribute("aria-invalid", "true");
    $(fieldId).setAttribute("aria-describedby", "wErr");
  }
}

function stopTimer() {
  clearInterval(resendTimer);
  resendTimer = 0;
  resendLeft = 0;
}

function updateResend() {
  const b = $("wResend");
  if (!b) return;
  if (resendLeft > 0) {
    b.disabled = true;
    b.textContent = t("welcome.resendWait", { sec: resendLeft });
  } else {
    b.disabled = busy;
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

function setBusy(state, kind = "") {
  busy = state;
  const card = $("wAuthCard");
  if (card) card.setAttribute("aria-busy", state ? "true" : "false");
  const sendBtn = $("wSend"), verifyBtn = $("wVerify");
  if (sendBtn) {
    sendBtn.disabled = state;
    sendBtn.textContent = state && kind === "send" ? t("welcome.sending") : t("welcome.sendEmail");
  }
  if (verifyBtn) {
    verifyBtn.disabled = state;
    verifyBtn.textContent = state && kind === "verify" ? t("welcome.verifying") : t("welcome.verifyBtn");
  }
  updateResend();
}

function syncHeaderCopy() {
  const title = $("wCardTitle"), sub = $("wCardSub");
  if (!title || !sub) return;
  if (!$("wSignedBox").hidden) {
    title.textContent = t("welcome.signedInTitle");
    return;
  }
  if (!$("wOffBox").hidden) {
    title.textContent = t("welcome.navCta");
    return;
  }
  title.textContent = codeStep ? t("welcome.codeTitle") : t("welcome.authTitle");
  sub.textContent = codeStep ? t("welcome.codeSub") : t("welcome.authSub");
}

function showCodeStep(on, focus = true) {
  codeStep = on;
  $("wAsk").hidden = on;
  $("wCodeBox").hidden = !on;
  if (on && pendingEmail) {
    $("wSent").textContent = t("upload.sent", { email: pendingEmail });
  }
  syncHeaderCopy();
  if (focus && $("authSheet")?.open) {
    if (on) $("wCode").focus();
    else $("wEmail").focus();
  }
}

function syncLangButtons() {
  const l = getLang();
  [...$("wLangs").querySelectorAll("button")].forEach((b) => b.setAttribute("aria-pressed", b.dataset.lang === l ? "true" : "false"));
  const prefix = l === "cs" ? "./cs/" : "./";
  document.querySelectorAll("a[data-legal]").forEach((a) => {
    a.href = `${prefix}${a.dataset.legal === "privacy" ? "privacy" : "terms"}.html`;
  });
}

function restorePendingIfFresh() {
  const saved = readPendingAuth();
  if (!saved) {
    pendingEmail = "";
    showCodeStep(false, false);
    return false;
  }
  pendingEmail = saved.email;
  $("wEmail").value = saved.email;
  showCodeStep(true, false);
  const elapsed = Math.floor((Date.now() - saved.at) / 1000);
  if (elapsed < 60) startResend(60 - elapsed);
  else { stopTimer(); updateResend(); }
  return true;
}

async function refreshAuthState() {
  err("");
  const cloud = await import("../cloud/supabase.js");
  if (!cloud.configured) {
    signedIn = false;
    $("wOffBox").hidden = false;
    $("wSignedBox").hidden = true;
    $("wAuthForms").hidden = true;
    $("wNavCta").textContent = t("welcome.navCta");
    $("wGuest").textContent = t("welcome.guest");
    syncHeaderCopy();
    return;
  }
  $("wOffBox").hidden = true;
  let s = null;
  try { s = await cloud.session(); } catch (e) {}
  if (s && s.user) {
    signedIn = true;
    removeSamples();
    clearPendingAuth();
    const email = s.user.email || "";
    $("wAvatar").textContent = email.slice(0, 1).toUpperCase();
    $("wSignedEmail").textContent = email;
    $("wSignedBox").hidden = false;
    $("wAuthForms").hidden = true;
    $("wNavCta").textContent = t("welcome.signedInTitle");
    $("wGuest").textContent = t("welcome.continueApp");
    syncHeaderCopy();
  } else {
    signedIn = false;
    $("wSignedBox").hidden = true;
    $("wAuthForms").hidden = false;
    $("wNavCta").textContent = t("welcome.navCta");
    $("wGuest").textContent = t("welcome.guest");
    restorePendingIfFresh();
  }
}

async function submitVerify() {
  if (busy) return;
  const code = extractOtpDigits($("wCode").value);
  if (!/^\d{6,10}$/.test(code)) { err(t("upload.err.codeFormat"), "wCode"); $("wCode").focus(); return; }
  err("");
  const cloud = await import("../cloud/supabase.js");
  if (!cloud.configured) { err(t("welcome.offNote")); return; }
  setBusy(true, "verify");
  try {
    await cloud.verifyCode(pendingEmail || $("wEmail").value.trim(), code);
    signedIn = true;
    removeSamples();
    stopTimer();
    clearPendingAuth();
    pendingEmail = "";
    showCodeStep(false, false);
    await syncNow(true);
    hooks.closeAuthSheet();
    hooks.toast(t("profile.signedInToast"));
    hooks.enterApp();
  } catch (e) {
    err(authMessage(e), "wCode");
  } finally {
    setBusy(false);
  }
}

function handleLegalClick(e) {
  const leg = e.target.closest("[data-legal]");
  if (!leg) return;
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
  e.preventDefault();
  hooks.openLegal(leg.dataset.legal);
}

function wire() {
  if (wired) return;
  wired = true;

  $("wBrand").onclick = () => window.scrollTo({ top: 0, behavior: "smooth" });

  $("wNavLinks").onclick = (e) => {
    const a = e.target.closest("a[data-jump]");
    if (!a) return;
    e.preventDefault();
    const target = $(a.dataset.jump);
    if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  $("wNavCta").onclick = () => openAuthDialog();

  $("wGuest").onclick = () => (signedIn ? hooks.enterApp() : hooks.trySample());
  $("wOffEnter").onclick = () => { hooks.closeAuthSheet(); hooks.trySample(); };
  $("wFootOpen").onclick = () => hooks.enterApp();
  $("wContinue").onclick = () => { hooks.closeAuthSheet(); hooks.enterApp(); };

  $("wSignOut").onclick = async () => {
    $("wSignOut").disabled = true;
    try {
      clearPendingAuth();
      hooks.closeAuthSheet();
      await hooks.signOut();
    } finally { $("wSignOut").disabled = false; }
  };

  $("wSend").onclick = async () => {
    if (busy) return;
    const email = $("wEmail").value.trim();
    if (!EMAIL_RE.test(email)) { err(t("upload.err.email"), "wEmail"); $("wEmail").focus(); return; }
    if (!$("wAgree").checked) { err(t("welcome.agreeErr"), "wAgree"); $("wAgree").focus(); return; }
    err("");
    const cloud = await import("../cloud/supabase.js");
    if (!cloud.configured) { err(t("welcome.offNote")); return; }
    setBusy(true, "send");
    try {
      await cloud.signIn(email);
      pendingEmail = email;
      writePendingAuth(email);
      $("wCode").value = "";
      showCodeStep(true);
      startResend(60);
    } catch (e) {
      err(authMessage(e), "wEmail");
    } finally {
      setBusy(false);
    }
  };

  $("wVerify").onclick = submitVerify;

  $("wResend").onclick = async () => {
    if (busy || resendLeft > 0 || !pendingEmail) return;
    err("");
    const cloud = await import("../cloud/supabase.js");
    if (!cloud.configured) { err(t("welcome.offNote")); return; }
    setBusy(true, "send");
    try {
      await cloud.signIn(pendingEmail);
      writePendingAuth(pendingEmail);
      $("wSent").textContent = t("upload.sent", { email: pendingEmail });
      startResend(60);
    } catch (e) {
      err(authMessage(e));
    } finally {
      setBusy(false);
    }
  };

  $("wChangeEmail").onclick = () => {
    stopTimer();
    clearPendingAuth();
    pendingEmail = "";
    err("");
    showCodeStep(false);
  };

  $("wEmail").onkeydown = (e) => { if (e.key === "Enter") $("wSend").click(); };
  $("wCode").onkeydown = (e) => { if (e.key === "Enter") submitVerify(); };
  $("wEmail").oninput = () => clearFieldInvalid("wEmail");
  $("wAgree").onchange = () => clearFieldInvalid("wAgree");
  $("wCode").oninput = () => {
    clearFieldInvalid("wCode");
    const digits = extractOtpDigits($("wCode").value);
    if (digits.length === OTP_LENGTH && !busy) {
      $("wCode").value = digits;
      submitVerify();
    }
  };

  $("welcome").addEventListener("click", handleLegalClick);
  $("authSheet").addEventListener("click", handleLegalClick);

  $("wLangs").onclick = (e) => {
    const b = e.target.closest("button[data-lang]");
    if (!b || b.dataset.lang === getLang()) return;
    stopRewrite();
    hooks.setLangUI(b.dataset.lang);
    syncLangButtons();
    syncHeaderCopy();
    if (codeStep && pendingEmail) $("wSent").textContent = t("upload.sent", { email: pendingEmail });
    if (signedIn) {
      $("wNavCta").textContent = t("welcome.signedInTitle");
      $("wGuest").textContent = t("welcome.continueApp");
    }
    updateResend();
    startRewrite($("welcome"));
  };
}

export async function openAuthDialog() {
  if (!hooks) return;
  stopRewrite();
  await refreshAuthState();
  hooks.openAuthSheet();
  requestAnimationFrame(() => {
    if (!$("wAuthForms").hidden) {
      if (codeStep) $("wCode").focus();
      else $("wEmail").focus();
    }
  });
}

export function openWelcome(nextHooks, openAuth = false) {
  hooks = nextHooks;
  stopRewrite();
  wire();
  syncLangButtons();
  setBusy(false);
  refreshAuthState().then(() => {
    if (openAuth) {
      hooks.openAuthSheet();
      requestAnimationFrame(() => {
        if (!$("wAuthForms").hidden) {
          if (codeStep) $("wCode").focus();
          else $("wEmail").focus();
        }
      });
    }
  });
}
