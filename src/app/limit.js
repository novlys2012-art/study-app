// Monthly quota calculation and shared renderer for the Upload and Profile limit meters.
// shortcut: maps server USD budget at 100 credits/$1 (free tier $1 = 100 credits); switch to server-side credit/page counters when paid tiers launch.
export const CREDITS_PER_USD = 100;

export function limitInfo(u) {
  if (!u || typeof u !== "object") return null;
  const limitUsd = Math.max(0, Number(u.limitUsd) || 0);
  const spentUsd = Math.max(0, Number(u.monthUsd) || 0);
  const limit = Math.round(limitUsd * CREDITS_PER_USD);
  const used = spentUsd <= 0 || limit <= 0 ? 0 : Math.min(limit, Math.max(1, Math.round(spentUsd * CREDITS_PER_USD)));
  const remaining = Math.max(0, limit - used);
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const state = pct >= 100 ? "full" : pct >= 80 ? "warn" : "ok";
  return { pct, state, used, limit, remaining };
}

// Monthly quota resets on the 1st of the next calendar month (UTC, matching Postgres date_trunc('month', now())).
export function nextResetDate(now = new Date()) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return `${d.getUTCDate()}. ${d.getUTCMonth() + 1}. ${d.getUTCFullYear()}`;
}

export function renderLimit(box, u, t, now) {
  const info = limitInfo(u);
  if (!box || !info) return false;
  box.classList.toggle("warn", info.state === "warn");
  box.classList.toggle("full", info.state === "full");
  const fill = box.querySelector("[data-limit-fill]");
  if (fill) fill.style.width = info.pct + "%";
  const track = box.querySelector("[role='progressbar']");
  if (track) track.setAttribute("aria-valuenow", String(info.pct));
  const pctEl = box.querySelector("[data-limit-pct]");
  if (pctEl) pctEl.textContent = info.pct + " %";
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
  box.hidden = false;
  return true;
}
