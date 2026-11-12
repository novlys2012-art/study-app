// Past exam mode on the device: which topics the student's old exams asked about, and how often.
// A subject keeps its exams in the subject itself (sj.exams), so they sync with it:
//   { id, name, year, at, pictures, unreadable, questions: [{ id, n, text, topic, points, manual }] }
// manual: the student chose the topic; sorting the exams again keeps it.
// A question's topic is a name, not a topic key: sorting the subject's topics again renumbers the keys,
// but a name that still exists still matches.

// Newer exams count more: an exam HALF_LIFE years older than the newest one counts half.
export const HALF_LIFE = 3;
// Fewer exams than this and the order is only a rough guess; the screen says so.
export const FEW_EXAMS = 3;

const norm = (s) => String(s || "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

export const examWeight = (year, newest) => (year && newest ? 0.5 ** (Math.max(0, newest - year) / HALF_LIFE) : 1);

// The subject topic an exam topic name belongs to: the same name (ignoring case and accents), or else
// a name that contains the other ("Derivácie" and "Derivácie funkcií"). Returns a topic key or null.
export function matchTopic(name, topics) {
  const n = norm(name); if (!n) return null;
  const keys = Object.keys(topics || {});
  const same = keys.find((k) => norm(topics[k]) === n);
  if (same) return same;
  if (n.length < 4) return null;
  return keys.find((k) => { const m = norm(topics[k]); return m.length >= 4 && (m.includes(n) || n.includes(m)); }) || null;
}

// One row per topic, the most asked first. Exam topics that match the same subject topic are one row.
// Row: { id, name, topic (subject topic key or null), exams (how many exams asked it), of (all exams),
//        questions: [{ ...question, exam: exam id, year }], points, score (exams weighted by year) }.
export function rankExams(exams = [], topics = {}) {
  const years = exams.map((e) => e.year).filter(Boolean);
  const newest = years.length ? Math.max(...years) : null;
  const rows = new Map();
  exams.forEach((ex) => {
    const w = examWeight(ex.year, newest), seen = new Set();
    (ex.questions || []).forEach((q) => {
      const key = matchTopic(q.topic, topics), id = key ? "t:" + key : "n:" + norm(q.topic);
      if (id === "n:") return;
      let r = rows.get(id);
      if (!r) rows.set(id, r = { id, name: key ? topics[key] : q.topic, topic: key, exams: 0, of: exams.length, questions: [], points: 0, score: 0 });
      r.questions.push({ ...q, exam: ex.id, year: ex.year || null });
      r.points += q.points || 0;
      if (!seen.has(id)) { seen.add(id); r.exams++; r.score += w; }
    });
  });
  return [...rows.values()].sort((a, b) => b.score - a.score || b.exams - a.exams || b.questions.length - a.questions.length
    || b.points - a.points || a.name.localeCompare(b.name));
}

// The years the exams come from, for the sample line ("2019–2025"); "" when none has a year.
export function yearSpan(exams = []) {
  const y = exams.map((e) => e.year).filter(Boolean);
  if (!y.length) return "";
  const lo = Math.min(...y), hi = Math.max(...y);
  return lo === hi ? String(lo) : `${lo}–${hi}`;
}

// A round in the order of the ranking. Each topic's questions come mistakes first, then unseen, then
// the known ones with the weakest record; the most asked topic gives up to a third of the round, the
// next ones the same, until the round is full. Known questions only fill what is left.
// questions: the subject's quiz questions ({ id, t }); p: progress by question id.
export function rankedRound(ranking, questions, p, n = 20) {
  const cap = Math.max(1, Math.ceil(n / 3));
  const lists = ranking.filter((r) => r.topic).map((r) => {
    const bad = [], fresh = [], known = [];
    questions.filter((x) => x.t === r.topic).forEach((x) => { const s = p[x.id]; (!s ? fresh : s.l === 1 ? known : bad).push(x); });
    known.sort((a, b) => p[a.id].c / p[a.id].n - p[b.id].c / p[b.id].n);
    return { todo: [...bad, ...fresh], known };
  });
  const out = [];
  const take = (from, max) => { while (out.length < n && from.length && max-- > 0) out.push(from.shift()); };
  lists.forEach((l) => take(l.todo, cap));
  lists.forEach((l) => take(l.todo, Infinity));
  lists.forEach((l) => take(l.known, Infinity));
  return out;
}

// Every question of the exams whose topic is `from` (a name) gets the topic `to`. Returns new exams.
export function retagTopic(exams, from, to, topics = {}) {
  const key = matchTopic(from, topics), n = norm(from);
  const hit = (q) => (key ? matchTopic(q.topic, topics) === key : norm(q.topic) === n);
  return exams.map((ex) => ({ ...ex, questions: ex.questions.map((q) => (hit(q) ? { ...q, topic: to, manual: true } : q)) }));
}
// One question gets the topic `to`.
export function retagQuestion(exams, qid, to) {
  return exams.map((ex) => ({ ...ex, questions: ex.questions.map((q) => (q.id === qid ? { ...q, topic: to, manual: true } : q)) }));
}
