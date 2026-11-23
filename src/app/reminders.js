// Local exam-countdown study reminder planner and device-local preference storage.
// Pure scheduling logic (no DOM/Capacitor imports) so unit tests run directly in Node.
import { dailyPlan } from "./plan.js";

export const REMINDERS_KEY = "studyapp-reminders-v1";
export const DEFAULT_REMINDER_TIME = "18:00";
export const HORIZON_DAYS = 14;
const BASE_ID = 1001;
const MIN_LEAD_MS = 60_000;

export function parseTime(value) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(value || "").trim());
  if (!m) return { hour: 18, minute: 0 };
  const hour = Math.min(23, Math.max(0, parseInt(m[1], 10)));
  const minute = Math.min(59, Math.max(0, parseInt(m[2], 10)));
  return { hour, minute };
}

export function formatTime(hour, minute) {
  return String(hour).padStart(2, "0") + ":" + String(minute).padStart(2, "0");
}

export function loadReminderPrefs() {
  try {
    const raw = JSON.parse(localStorage.getItem(REMINDERS_KEY) || "null");
    if (!raw || typeof raw !== "object") return { enabled: false, time: DEFAULT_REMINDER_TIME };
    const { hour, minute } = parseTime(raw.time);
    return { enabled: !!raw.enabled, time: formatTime(hour, minute) };
  } catch (e) {
    return { enabled: false, time: DEFAULT_REMINDER_TIME };
  }
}

export function saveReminderPrefs(prefs) {
  const { hour, minute } = parseTime(prefs && prefs.time);
  const next = { enabled: !!(prefs && prefs.enabled), time: formatTime(hour, minute) };
  try { localStorage.setItem(REMINDERS_KEY, JSON.stringify(next)); } catch (e) {}
  return next;
}

export function clearReminderPrefs() {
  try { localStorage.removeItem(REMINDERS_KEY); } catch (e) {}
}

// Build up to HORIZON_DAYS upcoming local notifications based on exam dates and spaced-repetition due counts.
// Sample subjects are excluded so demo data never triggers real OS notifications.
export function buildReminderSchedule(subjects = [], prefs = {}, { now = Date.now(), readLog = () => [], t = (k) => k, roundSize = 20 } = {}) {
  if (!prefs || !prefs.enabled) return [];
  const real = (subjects || []).filter((sj) => sj && !sj.sample && Array.isArray(sj.questions) && sj.questions.length > 0);
  if (!real.length) return [];

  const { hour, minute } = parseTime(prefs.time);
  const logs = new Map(real.map((sj) => [sj.id, readLog(sj) || []]));
  const items = [];

  for (let offset = 0; offset < HORIZON_DAYS; offset++) {
    const target = new Date(now);
    target.setHours(0, 0, 0, 0);
    target.setDate(target.getDate() + offset);
    target.setHours(hour, minute, 0, 0);
    const atMs = target.getTime();
    if (atMs <= now + MIN_LEAD_MS) continue;

    const candidates = real.map((sj) => ({
      sj,
      plan: dailyPlan(sj.questions, logs.get(sj.id), sj.exam, { roundSize, now: atMs }),
    }));

    // Pick nearest upcoming exam first; otherwise pick the subject with the most due items on that day.
    const upcomingExam = candidates
      .filter((c) => c.plan.hasExam && (c.plan.days === 0 || c.plan.target > 0))
      .sort((a, b) => a.plan.days - b.plan.days || b.plan.target - a.plan.target)[0];
    const fallbackDue = candidates
      .filter((c) => c.plan.target > 0)
      .sort((a, b) => b.plan.reviewNow - a.plan.reviewNow || b.plan.target - a.plan.target)[0];
    const pick = upcomingExam || fallbackDue;
    if (!pick) continue;

    const { sj, plan } = pick;
    let title, body;
    if (plan.hasExam && plan.days === 0) {
      title = t("profile.remExamTodayTitle", { name: sj.name });
      body = t("profile.remExamTodayBody");
    } else if (plan.hasExam && plan.days === 1) {
      title = t("profile.remExamTomorrowTitle", { name: sj.name });
      body = t("profile.remPlanBody", { n: Math.max(1, plan.roundCount) });
    } else if (plan.hasExam) {
      title = t(plan.days < 5 ? "profile.remExamDaysFewTitle" : "profile.remExamDaysTitle", { name: sj.name, n: plan.days });
      body = t("profile.remPlanBody", { n: Math.max(1, plan.roundCount) });
    } else {
      title = t("profile.remReviewTitle", { name: sj.name });
      body = t("profile.remPlanBody", { n: Math.max(1, plan.roundCount) });
    }

    items.push({ id: BASE_ID + items.length, subjectId: sj.id, atMs, title, body });
  }

  return items;
}
