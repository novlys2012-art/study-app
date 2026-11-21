// Monthly quota calculation and shared renderer for the Upload and Profile limit meters.

const usd = (n) => "$" + (Math.round(n * 100) / 100).toFixed(2);

export function limitInfo(u) {
  if (!u || typeof u !== "object") return null;
  const limit = Math.max(0, Number(u.limitUsd) || 0);
  const spent = Math.max(0, Number(u.monthUsd) || 0);
  const pct = limit > 0 ? Math.min(100, Math.round((spent / limit) * 100)) : 0;
  const state = pct >= 100 ? "full" : pct >= 80 ? "warn" : "ok";
  return { pct, state, spent: usd(spent), limit: usd(limit), remaining: usd(Math.max(0, limit - spent)) };
}

export function renderLimit(box, u, t) {
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
  if (usageEl) usageEl.textContent = t("upload.usage", { spent: info.spent, limit: info.limit });
  const resetEl = box.querySelector("[data-limit-reset]");
  if (resetEl) resetEl.textContent = t("upload.limitReset");
  box.hidden = false;
  return true;
}
