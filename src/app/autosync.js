// Decides when to sync with the account: at start, after each change (a moment later, so a quiz round
// goes up as a few requests), when the app comes back to the front or goes online, and after sign-in.
// Supabase's code loads only for a signed-in student, so the first page load stays light.
import { onLocalChange } from "./subjects.js";

let onPulled = () => {}, timer = 0;

// Supabase keeps the session in localStorage under "sb-<project>-auth-token".
function signedIn() {
  try { for (let k = 0; k < localStorage.length; k++) if (/^sb-.+-auth-token$/.test(localStorage.key(k))) return true; } catch (e) {}
  return false;
}

// force: sync even when no session was seen yet (right after signing in).
export async function syncNow(force) {
  clearTimeout(timer);
  if (!force && !signedIn()) return;
  try {
    const { sync } = await import("../cloud/sync.js");
    if (await sync()) onPulled();
  } catch (e) { /* offline or the server is down: the changes stay marked and go up next time */ }
}

// pulled() runs when a sync changed what is on the device, so the screen can show it.
export function startSync(pulled) {
  onPulled = pulled;
  onLocalChange(() => { clearTimeout(timer); timer = setTimeout(syncNow, 1500); });
  document.addEventListener("visibilitychange", () => syncNow());
  window.addEventListener("online", () => syncNow());
  syncNow();
}
