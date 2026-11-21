// Pure helpers for passwordless auth state and error mapping.
export const PENDING_AUTH_KEY = "lekto-pending-auth";
export const PENDING_TTL_MS = 15 * 60 * 1000;
export const OTP_LENGTH = 8;

export function extractOtpDigits(raw) {
  return String(raw || "").replace(/\D+/g, "");
}

// Maps auth/network errors to dedicated auth.err.* keys; never exposes raw server/fetch strings.
export function authMessage(e, t) {
  const code = e && e.code;
  if (code === "code") return t("auth.err.wrongCode");
  if (code === "expired") return t("auth.err.expiredCode");
  if (code === "rate") return t("auth.err.rate");
  if (code === "wait") return t("auth.err.wait");
  if (code === "network") return t("auth.err.network");
  if (code === "email") return t("upload.err.email");
  const msg = String((e && e.message) || e || "");
  if (/failed to fetch|networkerror|load failed|offline|timeout/i.test(msg)) return t("auth.err.network");
  if (/expired/i.test(msg) && !/invalid/i.test(msg)) return t("auth.err.expiredCode");
  return t("auth.err.unknown");
}

export function readPendingAuth(now = Date.now(), store = typeof sessionStorage !== "undefined" ? sessionStorage : null) {
  if (!store) return null;
  try {
    const raw = store.getItem(PENDING_AUTH_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.email !== "string" || typeof parsed.at !== "number") {
      store.removeItem(PENDING_AUTH_KEY);
      return null;
    }
    if (now - parsed.at > PENDING_TTL_MS || now < parsed.at - 60_000) {
      store.removeItem(PENDING_AUTH_KEY);
      return null;
    }
    return { email: parsed.email, at: parsed.at };
  } catch (e) {
    return null;
  }
}

export function writePendingAuth(email, now = Date.now(), store = typeof sessionStorage !== "undefined" ? sessionStorage : null) {
  if (!store || !email) return;
  try { store.setItem(PENDING_AUTH_KEY, JSON.stringify({ email, at: now })); } catch (e) {}
}

export function clearPendingAuth(store = typeof sessionStorage !== "undefined" ? sessionStorage : null) {
  if (!store) return;
  try { store.removeItem(PENDING_AUTH_KEY); } catch (e) {}
}
