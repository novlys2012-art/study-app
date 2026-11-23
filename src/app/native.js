// Native Capacitor bridge (iOS & Android via first-party LektoNative plugin) with safe Web/PWA fallbacks.
// Never throws in plain browsers, headless tests, or offline environments.
import { Capacitor, registerPlugin } from "@capacitor/core";

const Plugin = registerPlugin("LektoNative");

export function isNative() {
  try { return !!Capacitor.isNativePlatform(); } catch (e) { return false; }
}

export function platform() {
  try { return Capacitor.getPlatform() || "web"; } catch (e) { return "web"; }
}

// Mark the root element so platform-specific CSS (e.g. safe-area & native scroll polish) can adapt cleanly.
export function initNativeShell() {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.dataset.platform = platform();
  root.classList.toggle("is-native", isNative());
}

// Compute perceived luminance of a hex/rgb CSS colour so native status/navigation bar icons always stay legible.
export function isDarkColor(cssColor) {
  const s = String(cssColor || "").trim();
  let r = 247, g = 247, b = 245;
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s);
  if (hex) {
    const h = hex[1].length === 3 ? hex[1].split("").map((c) => c + c).join("") : hex[1];
    r = parseInt(h.slice(0, 2), 16);
    g = parseInt(h.slice(2, 4), 16);
    b = parseInt(h.slice(4, 6), 16);
  } else {
    const rgb = /^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i.exec(s);
    if (rgb) { r = +rgb[1]; g = +rgb[2]; b = +rgb[3]; }
  }
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return lum < 0.5;
}

export function syncNativeChrome(color) {
  if (!isNative() || !color) return;
  const dark = isDarkColor(color);
  Plugin.setChrome({ color, dark }).catch(() => {});
}

// style: "light" | "selection" | "success" | "error"
export function haptic(style = "light") {
  if (isNative()) {
    Plugin.haptic({ style }).catch(() => {});
    return;
  }
  try {
    if (!navigator.vibrate) return;
    navigator.vibrate(style === "error" ? [18, 60, 18] : style === "success" ? 14 : 8);
  } catch (e) {}
}

export function minimizeApp() {
  if (!isNative()) return;
  Plugin.minimizeApp().catch(() => {});
}

export function onHardwareBack(fn) {
  if (typeof window === "undefined") return;
  window.addEventListener("lekto:back", fn);
}

export function onNativeResume(fn) {
  if (typeof window === "undefined") return;
  window.addEventListener("lekto:resume", fn);
}

export function onOpenSubject(fn) {
  if (typeof window === "undefined") return;
  window.addEventListener("lekto:open-subject", (e) => {
    const id = e && e.detail && e.detail.subjectId;
    if (id) fn(id);
  });
  if (window.__lektoLaunchSubject) {
    const id = window.__lektoLaunchSubject;
    delete window.__lektoLaunchSubject;
    fn(id);
  }
}

export function reminderSupport() {
  if (isNative()) return "native";
  return "web";
}

export async function reminderPermission() {
  if (!isNative()) return "unsupported";
  try {
    const res = await Plugin.reminderPermission();
    return (res && res.state) || "prompt";
  } catch (e) {
    return "denied";
  }
}

export async function requestReminderPermission() {
  if (!isNative()) return "unsupported";
  try {
    const res = await Plugin.requestReminderPermission();
    return (res && res.state) || "denied";
  } catch (e) {
    return "denied";
  }
}

export async function scheduleNativeReminders(items) {
  if (!isNative()) return;
  try { await Plugin.scheduleReminders({ items }); } catch (e) {}
}

export async function cancelNativeReminders() {
  if (!isNative()) return;
  try { await Plugin.cancelReminders(); } catch (e) {}
}

// Register the offline app-shell Service Worker on web/PWA only (native Capacitor already bundles files locally).
export function registerServiceWorker() {
  if (isNative() || typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  if (location.protocol !== "https:" && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }, { once: true });
}
