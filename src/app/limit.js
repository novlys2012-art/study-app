// Monthly quota calculation, pricing tier constants, and shared renderer for the Upload and Profile limit meters.
// Maps server USD budget at 100 credits/$1 (Free tier $0.15 = 15 credits; Lekto Plus $1.50 = 150 credits).
export const CREDITS_PER_USD = 100;
export const FREE_CREDITS = 15;
export const PLUS_CREDITS = 150;
export const FREE_LIMIT_USD = FREE_CREDITS / CREDITS_PER_USD;
export const PLUS_LIMIT_USD = PLUS_CREDITS / CREDITS_PER_USD;

export const PRICING = {
  sk: { monthly: "5,99 €", annual: "34,99 €", annualPerMonth: "2,92 €", savePct: 51 },
  cs: { monthly: "149 Kč", annual: "890 Kč", annualPerMonth: "74 Kč", savePct: 51 },
};

let cachedUsage = null;
export const getCachedUsage = () => cachedUsage;
export function setCachedUsage(u) {
  cachedUsage = u && typeof u === "object" ? { ...u } : null;
  return limitInfo(cachedUsage);
}
export function isPlusActive(u = cachedUsage) {
  const info = limitInfo(u);
  return Boolean(info && info.plan === "plus");
}

export function limitInfo(u) {
  if (!u || typeof u !== "object") return null;
  const limitUsd = Math.max(0, Number(u.limitUsd) || 0);
  const spentUsd = Math.max(0, Number(u.monthUsd) || 0);
  const limit = Math.round(limitUsd * CREDITS_PER_USD);
  const used = spentUsd <= 0 || limit <= 0 ? 0 : Math.min(limit, Math.max(1, Math.round(spentUsd * CREDITS_PER_USD)));
  const remaining = Math.max(0, limit - used);
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const state = pct >= 100 ? "full" : pct >= 80 ? "warn" : "ok";
  const plan = u.plan === "plus" || (u.plan !== "free" && limit >= PLUS_CREDITS) ? "plus" : "free";
  return { plan, pct, state, used, limit, remaining };
}

// Monthly quota resets on the 1st of the next calendar month (UTC, matching Postgres date_trunc('month', now())).
export function nextResetDate(now = new Date()) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return `${d.getUTCDate()}. ${d.getUTCMonth() + 1}. ${d.getUTCFullYear()}`;
}

export function renderLimit(box, u, t, now) {
  const info = limitInfo(u);
  if (!box || !info) return false;
  setCachedUsage(u);
  const isPlus = info.plan === "plus";
  box.classList.toggle("warn", info.state === "warn");
  box.classList.toggle("full", info.state === "full");
  box.classList.toggle("is-plus", isPlus);
  const fill = box.querySelector("[data-limit-fill]");
  if (fill) fill.style.width = info.pct + "%";
  const track = box.querySelector("[role='progressbar']");
  if (track) track.setAttribute("aria-valuenow", String(info.pct));
  const pctEl = box.querySelector("[data-limit-pct]");
  if (pctEl) pctEl.textContent = info.pct + " %";
  const planEl = box.querySelector("[data-limit-plan]");
  if (planEl) planEl.textContent = t(isPlus ? "profile.planPlus" : "profile.planFree");
  const stateEl = box.querySelector("[data-limit-state]");
  if (stateEl) {
    const key = info.state === "full" ? "upload.limitFull" : info.state === "warn" ? "upload.limitWarn" : "";
    stateEl.textContent = key ? t(key) : "";
    stateEl.hidden = !key;
  }
  const usageEl = box.querySelector("[data-limit-usage]");
  if (usageEl) usageEl.textContent = t("upload.usage", { used: info.used, limit: info.limit });
  const resetEl = box.querySelector("[data-limit-reset]");
  if (resetEl) resetEl.textContent = t("upload.limitReset", { date: nextResetDate(now) });
  const noteEl = box.querySelector("[data-limit-note]");
  if (noteEl) noteEl.textContent = t(isPlus ? "upload.limitNotePlus" : "upload.limitNote", { limit: info.limit });
  const upgEl = box.querySelector("[data-limit-upgrade]");
  if (upgEl) upgEl.hidden = isPlus;
  box.hidden = false;
  return true;
}
