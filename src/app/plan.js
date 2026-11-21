// Spaced repetition scheduling and day-by-day exam countdown plan derived from the append-only answer log.
// Works across synced devices without extra database columns (replays "a", "b", "r" log entries in time order).
export const DAY_MS = 864e5;
const MAX_INTERVAL_DAYS = 90;

export function daysTo(iso, now = Date.now()) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
  if (!m) return null;
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return Math.round((new Date(+m[1], +m[2] - 1, +m[3]) - start) / DAY_MS);
}

// shortcut: geometric interval schedule from answer log timestamps rather than full FSRS ratings (quiz only records right/wrong); upgrade when graded recall buttons are added.
export function memoryStates(log = []) {
  let reset = -Infinity;
  for (const e of log) if (e && e.k === "r" && e.at > reset) reset = e.at;
  const live = log.filter((e) => e && e.k !== "r" && e.at > reset);
  const states = new Map();

  for (const e of live) {
    if (e.k !== "b") continue;
    const ok = e.l === 1 ? 1 : 0;
    const n = e.n | 0;
    const c = e.c | 0;
    const intervalDays = ok ? 1 : 0;
    states.set(e.q, {
      n, c, l: ok,
      reps: ok,
      lapses: Math.max(0, n - c),
      intervalDays,
      lastAt: e.at,
      dueAt: e.at + intervalDays * DAY_MS,
    });
  }

  live
    .filter((e) => e.k === "a")
    .sort((x, y) => x.at - y.at)
    .forEach((e) => {
      const s = states.get(e.q) || { n: 0, c: 0, l: 0, reps: 0, lapses: 0, intervalDays: 0, lastAt: 0, dueAt: 0 };
      s.n++;
      if (e.ok) {
        s.c++;
        s.l = 1;
        s.reps++;
        s.intervalDays = s.reps === 1 ? 1 : s.reps === 2 ? 3 : Math.min(MAX_INTERVAL_DAYS, Math.round(s.intervalDays * 2.2));
      } else {
        s.l = 0;
        s.reps = 0;
        s.lapses++;
        s.intervalDays = 0;
      }
      s.lastAt = e.at;
      s.dueAt = e.at + s.intervalDays * DAY_MS;
      states.set(e.q, s);
    });

  return states;
}

export function questionStats(qs = [], log = [], now = Date.now()) {
  const states = memoryStates(log);
  let ok = 0, bad = 0, overdue = 0, fresh = 0;
  for (const x of qs) {
    const s = states.get(x.id);
    if (!s) fresh++;
    else if (s.l === 0) bad++;
    else if (s.dueAt <= now) overdue++;
    else ok++;
  }
  const total = qs.length;
  const due = total - ok;
  return { total, ok, bad, overdue, fresh, due, reviewDue: bad + overdue, pct: total ? Math.round((ok / total) * 100) : 0 };
}

// Round order: wrong answers first, then spaced-repetition overdue items (oldest due first),
// then unseen questions, then upcoming known items (soonest due first) to fill the requested size.
// When topicOrder is provided (from past exam ranking), higher-yield exam topics lead each bucket.
export function dueRound(qs = [], log = [], { limit = 20, now = Date.now(), shuffle = (a) => a.slice(), topicOrder = [] } = {}) {
  const states = memoryStates(log);
  const rank = new Map((topicOrder || []).map((k, idx) => [k, idx]));
  const hasRank = rank.size > 0;
  const byRank = (arr) => (hasRank ? arr.sort((a, b) => (rank.get(a.t) ?? 1e9) - (rank.get(b.t) ?? 1e9)) : arr);

  const wrong = [], overdue = [], fresh = [], upcoming = [];
  for (const x of qs) {
    const s = states.get(x.id);
    if (!s) fresh.push(x);
    else if (s.l === 0) wrong.push(x);
    else if (s.dueAt <= now) overdue.push(x);
    else upcoming.push(x);
  }
  overdue.sort((a, b) => {
    const r = hasRank ? (rank.get(a.t) ?? 1e9) - (rank.get(b.t) ?? 1e9) : 0;
    return r || states.get(a.id).dueAt - states.get(b.id).dueAt;
  });
  upcoming.sort((a, b) => {
    const sa = states.get(a.id), sb = states.get(b.id);
    const r = hasRank ? (rank.get(a.t) ?? 1e9) - (rank.get(b.t) ?? 1e9) : 0;
    return r || sa.dueAt - sb.dueAt || (sa.c / (sa.n || 1)) - (sb.c / (sb.n || 1));
  });
  return [...byRank(shuffle(wrong)), ...overdue, ...byRank(shuffle(fresh)), ...upcoming].slice(0, limit);
}

export function dailyPlan(qs = [], log = [], examIso = "", { roundSize = 20, now = Date.now() } = {}) {
  const states = memoryStates(log);
  const st = questionStats(qs, log, now);
  const days = daysTo(examIso, now);
  const hasExam = days != null && days >= 0;
  const reviewNow = st.reviewDue;
  const newToday = hasExam
    ? (st.fresh ? Math.ceil(st.fresh / Math.max(1, days)) : 0)
    : Math.min(st.fresh, Math.max(0, roundSize - reviewNow));
  const target = hasExam ? Math.min(st.total, reviewNow + newToday) : Math.min(st.total, st.due);
  const roundCount = target > 0 ? Math.min(roundSize, target) : Math.min(roundSize, st.total);

  let nextReviewDays = null;
  if (target === 0 && st.ok > 0) {
    let minDue = Infinity;
    for (const x of qs) {
      const s = states.get(x.id);
      if (s && s.l === 1 && s.dueAt > now && s.dueAt < minDue) minDue = s.dueAt;
    }
    if (minDue < Infinity) nextReviewDays = Math.max(1, Math.ceil((minDue - now) / DAY_MS));
  }

  return {
    hasExam, days, total: st.total, ok: st.ok, bad: st.bad, overdue: st.overdue, fresh: st.fresh,
    reviewNow, newToday, target, roundCount, nextReviewDays,
  };
}
