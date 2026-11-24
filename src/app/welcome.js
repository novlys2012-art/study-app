// Landing + shared Email/Password Sign In, Sign Up (with email verification), and Password Reset controller.
// Lazy-loads Supabase so first paint stays fast when opening directly into the app.
import { t, getLang } from "../i18n/index.js";
import { syncNow, hasSessionToken } from "./autosync.js";
import { removeSamples } from "./subjects.js";
import { icon } from "./icons.js";
const CLOUD_CONFIGURED = !!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_KEY);
import {
  OTP_LENGTH,
  isPasswordValid,
  extractOtpDigits,
  authMessage as mapAuthMessage,
  readPendingAuth,
  writePendingAuth,
  clearPendingAuth,
} from "./auth-state.js";

const $ = (id) => document.getElementById(id);
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// step: "login" | "signup" | "forgot" | "verify" | "newpass"
let welcomeWired = false, authWired = false, authSeq = 0;
let step = "login", pendingEmail = "", pendingKind = "signup", unconfirmedResent = false;
let busy = false, busyKind = "", signedIn = false, resendLeft = 0, resendTimer = 0;
let hooks = null, activeMount = null;

const FIELDS = ["wEmail", "wPass", "wCode", "wAgree", "wNewPass"];

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

function syncPwToggle(inputId, btnId) {
  const inp = $(inputId), btn = $(btnId);
  if (!inp || !btn) return;
  const shown = inp.type === "text";
  btn.setAttribute("aria-pressed", shown ? "true" : "false");
  btn.setAttribute("aria-label", shown ? t("welcome.hidePass") : t("welcome.showPass"));
  btn.replaceChildren(icon(shown ? "eyeOff" : "eye"));
}

function resetPwField(inputId, btnId, clear = false) {
  const inp = $(inputId);
  if (!inp) return;
  if (clear) inp.value = "";
  inp.type = "password";
  syncPwToggle(inputId, btnId);
}

function isFormVisible() {
  const forms = $("wAuthForms");
  if (!forms || forms.hidden) return false;
  if (forms.closest("#authSheet")) return !!$("authSheet")?.open;
  return !$("upload")?.hidden && !$("upLogin")?.hidden;
}

function focusStepField() {
  if (!isFormVisible()) return;
  if (step === "verify") $("wCode")?.focus();
  else if (step === "newpass") $("wNewPass")?.focus();
  else if (step === "login" && $("wEmail")?.value.trim()) $("wPass")?.focus();
  else $("wEmail")?.focus();
}

function syncButtons() {
  const forms = $("wAuthForms");
  if (forms) forms.setAttribute("aria-busy", busy ? "true" : "false");

  const submit = $("wSubmit");
  if (submit) {
    submit.disabled = busy;
    if (step === "signup") submit.textContent = busy && busyKind === "signup" ? t("welcome.signingUp") : t("welcome.signupBtn");
    else if (step === "forgot") submit.textContent = busy && busyKind === "forgot" ? t("welcome.sending") : t("welcome.sendResetBtn");
    else submit.textContent = busy && busyKind === "login" ? t("welcome.loggingIn") : t("welcome.loginBtn");
  }

  const verify = $("wVerify");
  if (verify) {
    verify.disabled = busy;
    if (busy && busyKind === "verify") verify.textContent = t("welcome.verifying");
    else verify.textContent = pendingKind === "recovery" ? t("welcome.verifyCodeBtn") : t("welcome.verifyEmailBtn");
  }

  const save = $("wSavePass");
  if (save) {
    save.disabled = busy;
    save.textContent = busy && busyKind === "newpass" ? t("welcome.savingPass") : t("welcome.savePassBtn");
  }

  const tabs = $("wModeTabs");
  if (tabs) [...tabs.children].forEach((b) => { b.disabled = busy; });
  ["wForgot", "wBackLogin", "wChangeEmail"].forEach((id) => { const b = $(id); if (b) b.disabled = busy; });
  updateResend();
}

function setBusy(state, kind = "") {
  busy = state;
  busyKind = state ? kind : "";
  syncButtons();
}

function syncSentCopy() {
  const box = $("wSent");
  if (!box || !pendingEmail) return;
  if (pendingKind === "recovery") box.textContent = t("welcome.resetSent", { email: pendingEmail });
  else if (unconfirmedResent) box.textContent = t("welcome.unconfirmedSent", { email: pendingEmail });
  else box.textContent = t("upload.sent", { email: pendingEmail });
}

function syncHeaderCopy() {
  const title = $("wCardTitle"), sub = $("wCardSub");
  const inSheet = $("wAuthForms")?.parentElement === $("wAuthCard");
  if (title && inSheet) {
    if (!$("wSignedBox").hidden) title.textContent = t("welcome.signedInTitle");
    else if (!$("wOffBox").hidden) title.textContent = t("welcome.navCta");
    else if (step === "signup") title.textContent = t("welcome.signupTitle");
    else if (step === "forgot") title.textContent = t("welcome.forgotTitle");
    else if (step === "verify") title.textContent = pendingKind === "recovery" ? t("welcome.resetCodeTitle") : t("welcome.codeTitle");
    else if (step === "newpass") title.textContent = t("welcome.newPassTitle");
    else title.textContent = t("welcome.authTitle");
  }
  if (sub) {
    if (step === "signup") sub.textContent = t("welcome.signupSub");
    else if (step === "forgot") sub.textContent = t("welcome.forgotSub");
    else if (step === "verify") sub.textContent = pendingKind === "recovery" ? t("welcome.resetCodeSub") : t("welcome.codeSub");
    else if (step === "newpass") sub.textContent = t("welcome.newPassSub");
    else sub.textContent = t("welcome.authSub");
  }
}

function syncLegalLinks() {
  const prefix = getLang() === "cs" ? "./cs/" : "./";
  document.querySelectorAll("a[data-legal]").forEach((a) => {
    a.href = `${prefix}${a.dataset.legal === "privacy" ? "privacy" : "terms"}.html`;
  });
}

export function syncAuthCopy() {
  syncLegalLinks();
  syncHeaderCopy();
  syncButtons();
  syncPwToggle("wPass", "wPassToggle");
  syncPwToggle("wNewPass", "wNewPassToggle");
  if (step === "verify") syncSentCopy();
}

function setStep(next, { focus = false, keepErr = false } = {}) {
  step = next;
  if (!keepErr) err("");
  const isCred = step === "login" || step === "signup" || step === "forgot";
  const showTabs = step === "login" || step === "signup";

  const tabs = $("wModeTabs");
  if (tabs) {
    tabs.hidden = !showTabs;
    if (showTabs) {
      const idx = step === "signup" ? 1 : 0;
      tabs.style.setProperty("--n", "2");
      tabs.style.setProperty("--i", String(idx));
      [...tabs.children].forEach((b) => b.setAttribute("aria-pressed", b.dataset.authMode === step ? "true" : "false"));
    }
  }

  $("wCredForm").hidden = !isCred;
  $("wPassWrap").hidden = !(step === "login" || step === "signup");
  $("wPassHint").hidden = step !== "signup";
  $("wAgreeWrap").hidden = step !== "signup";
  $("wAuthFoot").hidden = !(step === "login" || step === "forgot");
  $("wForgot").hidden = step !== "login";
  $("wBackLogin").hidden = step !== "forgot";
  $("wCodeBox").hidden = step !== "verify";
  $("wNewPassForm").hidden = step !== "newpass";

  $("wEmail").enterKeyHint = step === "forgot" ? "send" : "next";
  $("wPass").autocomplete = step === "signup" ? "new-password" : "current-password";

  if (step === "verify" || step === "newpass") resetPwField("wPass", "wPassToggle", true);
  if (step === "verify") syncSentCopy();

  syncHeaderCopy();
  syncButtons();
  if (focus) focusStepField();
}

function restorePendingIfFresh(fallback = "login") {
  const saved = readPendingAuth();
  if (!saved) {
    pendingEmail = "";
    pendingKind = "signup";
    unconfirmedResent = false;
    setStep(fallback, { focus: false });
    return false;
  }
  pendingEmail = saved.email;
  pendingKind = saved.kind;
  unconfirmedResent = false;
  $("wEmail").value = saved.email;
  setStep("verify", { focus: false });
  const elapsed = Math.floor((Date.now() - saved.at) / 1000);
  if (elapsed < 60) startResend(60 - elapsed);
  else { stopTimer(); updateResend(); }
  return true;
}

async function finishSignIn(toastKind = "signedIn") {
  signedIn = true;
  removeSamples();
  stopTimer();
  clearPendingAuth();
  pendingEmail = "";
  pendingKind = "signup";
  unconfirmedResent = false;
  resetPwField("wPass", "wPassToggle", true);
  resetPwField("wNewPass", "wNewPassToggle", true);
  $("wCode").value = "";
  await syncNow(true);
  setStep("login", { focus: false });
  const msg = toastKind === "passwordSaved" ? t("profile.passwordSavedToast") : t("profile.signedInToast");
  if (activeMount?.onSignedIn) await activeMount.onSignedIn(msg);
}

function mountInto(host, opts) {
  wireAuth();
  activeMount = opts;
  const forms = $("wAuthForms");
  if (host && forms && forms.parentElement !== host) host.appendChild(forms);
  syncLegalLinks();
}

export function mountAuth(host, opts) {
  authSeq++;
  mountInto(host, opts);
  setBusy(false);
  $("wAuthForms").hidden = false;
  restorePendingIfFresh("login");
  requestAnimationFrame(() => focusStepField());
}

async function submitCreds(e) {
  e.preventDefault();
  if (busy) return;
  const email = $("wEmail").value.trim();
  if (!EMAIL_RE.test(email)) { err(t("upload.err.email"), "wEmail"); $("wEmail").focus(); return; }

  const cloud = await import("../cloud/supabase.js");
  if (!cloud.configured) { err(t("welcome.offNote")); return; }

  if (step === "forgot") {
    err("");
    setBusy(true, "forgot");
    try {
      await cloud.requestPasswordReset(email);
      pendingEmail = email;
      pendingKind = "recovery";
      unconfirmedResent = false;
      writePendingAuth(email, "recovery");
      $("wCode").value = "";
      setStep("verify", { focus: true });
      startResend(60);
    } catch (ex) {
      err(authMessage(ex), "wEmail");
    } finally {
      setBusy(false);
    }
    return;
  }

  const password = $("wPass").value;
  if (step === "login") {
    if (!password) { err(t("auth.err.passwordRequired"), "wPass"); $("wPass").focus(); return; }
    err("");
    setBusy(true, "login");
    try {
      await cloud.signInWithPassword(email, password);
      await finishSignIn("signedIn");
    } catch (ex) {
      if (ex && ex.code === "unconfirmed") {
        pendingEmail = email;
        pendingKind = "signup";
        unconfirmedResent = true;
        writePendingAuth(email, "signup");
        $("wCode").value = "";
        try {
          await cloud.resendVerification(email);
          setStep("verify", { focus: true });
          startResend(60);
        } catch (ex2) {
          unconfirmedResent = false;
          setStep("verify", { focus: true, keepErr: true });
          err(authMessage(ex2));
          if (ex2 && ex2.code === "wait") startResend(60);
        }
      } else {
        err(authMessage(ex), ex && ex.code === "credentials" ? "wPass" : "wEmail");
      }
    } finally {
      setBusy(false);
    }
    return;
  }

  // step === "signup"
  if (!isPasswordValid(password)) { err(t("auth.err.passwordShort"), "wPass"); $("wPass").focus(); return; }
  if (!$("wAgree").checked) { err(t("welcome.agreeErr"), "wAgree"); $("wAgree").focus(); return; }
  err("");
  setBusy(true, "signup");
  try {
    const res = await cloud.signUp(email, password);
    if (res.needsVerification) {
      pendingEmail = email;
      pendingKind = "signup";
      unconfirmedResent = false;
      writePendingAuth(email, "signup");
      $("wCode").value = "";
      setStep("verify", { focus: true });
      startResend(60);
    } else {
      await finishSignIn("signedIn");
    }
  } catch (ex) {
    err(authMessage(ex), ex && ex.code === "weakPassword" ? "wPass" : "wEmail");
  } finally {
    setBusy(false);
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
    await cloud.verifyCode(pendingEmail || $("wEmail").value.trim(), code, pendingKind);
    if (pendingKind === "recovery") {
      stopTimer();
      clearPendingAuth();
      $("wCode").value = "";
      resetPwField("wNewPass", "wNewPassToggle", true);
      setStep("newpass", { focus: true });
    } else {
      await finishSignIn("signedIn");
    }
  } catch (ex) {
    err(authMessage(ex), "wCode");
  } finally {
    setBusy(false);
  }
}

async function submitNewPass(e) {
  e.preventDefault();
  if (busy) return;
  const password = $("wNewPass").value;
  if (!isPasswordValid(password)) { err(t("auth.err.passwordShort"), "wNewPass"); $("wNewPass").focus(); return; }
  err("");
  const cloud = await import("../cloud/supabase.js");
  if (!cloud.configured) { err(t("welcome.offNote")); return; }
  setBusy(true, "newpass");
  try {
    await cloud.updatePassword(password);
    await finishSignIn("passwordSaved");
  } catch (ex) {
    err(authMessage(ex), "wNewPass");
  } finally {
    setBusy(false);
  }
}

function handleLegalClick(e) {
  const leg = e.target.closest("[data-legal]");
  if (!leg) return;
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
  const opener = activeMount?.openLegal || hooks?.openLegal;
  if (!opener) return;
  e.preventDefault();
  opener(leg.dataset.legal);
}

function wireAuth() {
  if (authWired) return;
  authWired = true;

  $("wModeTabs").onclick = (e) => {
    const b = e.target.closest("button[data-auth-mode]");
    if (!b || busy || b.dataset.authMode === step) return;
    setStep(b.dataset.authMode, { focus: true });
  };

  $("wCredForm").onsubmit = submitCreds;
  $("wNewPassForm").onsubmit = submitNewPass;
  $("wVerify").onclick = submitVerify;

  $("wForgot").onclick = () => { if (!busy) setStep("forgot", { focus: true }); };
  $("wBackLogin").onclick = () => { if (!busy) setStep("login", { focus: true }); };

  const togglePw = (inputId, btnId) => () => {
    const inp = $(inputId);
    if (!inp) return;
    inp.type = inp.type === "password" ? "text" : "password";
    syncPwToggle(inputId, btnId);
  };
  $("wPassToggle").onclick = togglePw("wPass", "wPassToggle");
  $("wNewPassToggle").onclick = togglePw("wNewPass", "wNewPassToggle");

  $("wResend").onclick = async () => {
    if (busy || resendLeft > 0 || !pendingEmail) return;
    err("");
    const cloud = await import("../cloud/supabase.js");
    if (!cloud.configured) { err(t("welcome.offNote")); return; }
    setBusy(true, "resend");
    try {
      if (pendingKind === "recovery") await cloud.requestPasswordReset(pendingEmail);
      else await cloud.resendVerification(pendingEmail);
      unconfirmedResent = false;
      writePendingAuth(pendingEmail, pendingKind);
      syncSentCopy();
      startResend(60);
    } catch (ex) {
      err(authMessage(ex));
    } finally {
      setBusy(false);
    }
  };

  $("wChangeEmail").onclick = () => {
    if (busy) return;
    const backTo = pendingKind === "recovery" ? "forgot" : "signup";
    stopTimer();
    clearPendingAuth();
    pendingEmail = "";
    unconfirmedResent = false;
    $("wCode").value = "";
    setStep(backTo, { focus: true });
  };

  $("wCode").onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); submitVerify(); } };
  $("wEmail").oninput = () => clearFieldInvalid("wEmail");
  $("wPass").oninput = () => clearFieldInvalid("wPass");
  $("wNewPass").oninput = () => clearFieldInvalid("wNewPass");
  $("wAgree").onchange = () => clearFieldInvalid("wAgree");
  $("wCode").oninput = () => {
    clearFieldInvalid("wCode");
    const digits = extractOtpDigits($("wCode").value);
    if (digits.length === OTP_LENGTH && !busy) {
      $("wCode").value = digits;
      submitVerify();
    }
  };

  $("wAuthForms").addEventListener("click", handleLegalClick);
}

function syncLangButtons() {
  const l = getLang();
  [...$("wLangs").querySelectorAll("button")].forEach((b) => b.setAttribute("aria-pressed", b.dataset.lang === l ? "true" : "false"));
  syncLegalLinks();
}

async function refreshAuthState(preferredMode = "login") {
  const seq = ++authSeq;
  err("");
  mountInto($("wAuthCard"), {
    openLegal: hooks?.openLegal,
    onSignedIn: async (msg) => {
      hooks.closeAuthSheet();
      hooks.toast(msg);
      hooks.enterApp();
    },
  });
  if (!CLOUD_CONFIGURED) {
    signedIn = false;
    $("wOffBox").hidden = false;
    $("wSignedBox").hidden = true;
    $("wAuthForms").hidden = true;
    $("wNavCta").textContent = t("welcome.navCta");
    $("wGuest").textContent = t("welcome.guest");
    syncHeaderCopy();
    return true;
  }
  $("wOffBox").hidden = true;
  // Skip downloading @supabase/supabase-js on guest landing visits until a session token exists or the user submits auth.
  if (!hasSessionToken() && !/[?&]code=/.test(location.search)) {
    signedIn = false;
    $("wSignedBox").hidden = true;
    $("wAuthForms").hidden = false;
    $("wNavCta").textContent = t("welcome.navCta");
    $("wGuest").textContent = t("welcome.guest");
    restorePendingIfFresh(preferredMode === "signup" ? "signup" : "login");
    return true;
  }
  const cloud = await import("../cloud/supabase.js");
  let s = null;
  try { s = await cloud.session(); } catch (e) {}
  // Ignore stale async checks if the user navigated away (e.g. to #upload) before session() resolved.
  if (seq !== authSeq || $("welcome")?.hidden) return false;
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
    restorePendingIfFresh(preferredMode === "signup" ? "signup" : "login");
  }
  return true;
}

function wireWelcome() {
  if (welcomeWired) return;
  welcomeWired = true;
  wireAuth();

  $("wBrand").onclick = () => window.scrollTo({ top: 0, behavior: "smooth" });

  $("wNavLinks").onclick = (e) => {
    const a = e.target.closest("a[data-jump]");
    if (!a) return;
    e.preventDefault();
    const target = $(a.dataset.jump);
    if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  $("wNavCta").onclick = () => openAuthDialog("login");

  $("wGuest").onclick = () => (signedIn ? hooks.enterApp() : hooks.trySample());
  if ($("wFreeCta")) $("wFreeCta").onclick = () => (signedIn ? hooks.enterApp() : openAuthDialog("signup"));
  if ($("wPlusCta")) $("wPlusCta").onclick = () => (signedIn && hooks.openPlus ? hooks.openPlus("") : openAuthDialog("signup"));
  $("wOffEnter").onclick = () => { hooks.closeAuthSheet(); hooks.trySample(); };
  $("wFootOpen").onclick = () => hooks.enterApp();
  $("wContinue").onclick = () => { hooks.closeAuthSheet(); hooks.enterApp(); };

  $("wSignOut").onclick = async () => {
    $("wSignOut").disabled = true;
    try {
      clearPendingAuth();
      resetPwField("wPass", "wPassToggle", true);
      resetPwField("wNewPass", "wNewPassToggle", true);
      hooks.closeAuthSheet();
      await hooks.signOut();
    } finally { $("wSignOut").disabled = false; }
  };

  $("welcome").addEventListener("click", handleLegalClick);

  $("wLangs").onclick = async (e) => {
    const b = e.target.closest("button[data-lang]");
    if (!b || b.dataset.lang === getLang()) return;
    await hooks.setLangUI(b.dataset.lang);
    syncLangButtons();
    syncAuthCopy();
    if (signedIn) {
      $("wNavCta").textContent = t("welcome.signedInTitle");
      $("wGuest").textContent = t("welcome.continueApp");
    }
  };
}

export async function openAuthDialog(preferredMode = "login") {
  if (!hooks) return;
  if (!(await refreshAuthState(preferredMode)) || $("welcome")?.hidden) return;
  hooks.openAuthSheet();
  requestAnimationFrame(() => focusStepField());
}

export function openWelcome(nextHooks, openAuth = false, preferredMode = "login") {
  hooks = nextHooks;
  wireWelcome();
  syncLangButtons();
  setBusy(false);
  refreshAuthState(preferredMode).then((ok) => {
    if (ok && openAuth && !$("welcome")?.hidden) {
      hooks.openAuthSheet();
      requestAnimationFrame(() => focusStepField());
    }
  });
}
