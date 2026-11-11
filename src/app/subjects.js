// Subjects, their questions and the answer log on the device. The device copy is what the app reads,
// so it opens fast and works offline; src/cloud/sync.js copies it to and from the student's account.
// A subject: { id, code, name, term, topics: { key: name }, questions: [{ t, q, o, a, e, x, s, id }] }
// Questions use the format the AI layer returns (ai/tasks.js); "a" may be an array for several right answers.
// A question's id is made once, when the question is made, and never changes (re-sorting topics keeps it).
const STORE = "studyapp-subjects-v1";
// What the account has seen: { user, s: { subjectId: mark }, rc: server time of the newest answer pulled }.
// A mark is { at: ms of the last change, base: the account's time at the last sync, dirty: not sent yet, del: deleted }.
const META = "studyapp-sync-v1";
// The answer log of one subject: every answer is its own entry, so answers from two devices simply add up.
const LOG = "studyapp-log:";
// Before the answer log, progress was kept as counts per question; read once and turned into "base" entries.
const LEGACY = "studyapp-progress:";

// The id of questions made before ids were stored. Kept only for those old subjects.
export function hid(s) {
  let h = 5381;
  for (let k = 0; k < s.length; k++) h = ((h << 5) + h + s.charCodeAt(k)) >>> 0;
  return h.toString(36).slice(-5).padStart(5, "0");
}

// A random id: 16 bytes for answers (32 hex digits), shorter for questions (unique within a subject).
export function newId(bytes = 16) {
  return [...crypto.getRandomValues(new Uint8Array(bytes))].map((b) => b.toString(16).padStart(2, "0")).join("");
}
export const questionId = () => "q" + newId(5);

function read(key, fallback) {
  try { const v = JSON.parse(localStorage.getItem(key)); return v == null ? fallback : v; } catch (e) { return fallback; }
}
function write(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {} }
function remove(key) { try { localStorage.removeItem(key); } catch (e) {} }
function keys(prefix) {
  const out = [];
  try { for (let k = 0; k < localStorage.length; k++) { const key = localStorage.key(k); if (key && key.startsWith(prefix)) out.push(key); } } catch (e) {}
  return out;
}

function rawSubjects() {
  const list = read(STORE, []);
  return Array.isArray(list) ? list.filter((sj) => sj && sj.id && Array.isArray(sj.questions)) : [];
}

const tidy = (sj) => ({
  topics: {},
  ...sj,
  questions: sj.questions.map((x) => (x.id ? x : { ...x, id: hid((x.t || "") + "|" + x.q) })),
});
export function loadSubjects() { return rawSubjects().map(tidy); }

export function loadMeta() {
  const m = read(META, {});
  return { user: m.user || null, s: m.s || {}, rc: m.rc || null };
}
export function saveMeta(m) { write(META, { user: m.user, s: m.s, rc: m.rc }); }

let listener = null;
// Called after every change made on this device (not after changes that came from the account).
export function onLocalChange(fn) { listener = fn; }
const changed = () => { if (listener) listener(); };
const touch = (marks, id, extra) => { marks[id] = { ...marks[id], at: Date.now(), dirty: true, ...extra }; };
const sidOf = (sj) => (sj && sj.id) || sj;

// Saves the list and notes which subjects changed or went away, so only those are sent to the account.
export function saveSubjects(list) {
  const before = new Map(rawSubjects().map((sj) => [sj.id, JSON.stringify(tidy(sj))]));
  const meta = loadMeta();
  let any = false;
  list.forEach((sj) => {
    if (before.get(sj.id) !== JSON.stringify(tidy(sj))) { touch(meta.s, sj.id, { del: false }); any = true; }
    before.delete(sj.id);
  });
  before.forEach((_, id) => {
    touch(meta.s, id, { del: true }); any = true;
    remove(LOG + id); remove(LEGACY + id);
  });
  write(STORE, list);
  if (any) { saveMeta(meta); changed(); }
}

// ----- The answer log
// An entry: { id, k, at, u } plus, by kind k:
//   "a" an answer: q (question id), ok (1 right, 0 wrong)
//   "b" a base: q, n (answers), c (right ones), l (1 if the last was right); the counts from before the log
//   "r" a reset: everything before it no longer counts
// at is the device time in ms; u: 1 while the entry is not in the account yet.

// Counts from before the answer log become one base entry per question. The id is the same on every
// device (and in the database migration), so the same counts are never added twice.
const baseId = (sid, qid) => `b:${sid}:${qid}`;
function legacyBases(sid, p, at) {
  if (!p || typeof p !== "object" || Array.isArray(p)) return [];
  return Object.keys(p).filter((qid) => p[qid] && p[qid].n > 0).map((qid) => ({
    id: baseId(sid, qid), k: "b", q: qid, n: p[qid].n | 0, c: p[qid].c | 0, l: p[qid].l === 1 ? 1 : 0, at, u: 1,
  }));
}

export function readLog(sj) {
  const sid = sidOf(sj);
  let log = read(LOG + sid, []);
  if (!Array.isArray(log)) log = [];
  const legacy = read(LEGACY + sid, null);
  if (legacy) {
    const have = new Set(log.map((e) => e.id));
    log = log.concat(legacyBases(sid, legacy, Date.now()).filter((e) => !have.has(e.id)));
    write(LOG + sid, log); remove(LEGACY + sid);
  }
  return log;
}

// Counts per question, worked out from the log: { questionId: { n: answers, c: right ones, l: 1 if the last one was right } }.
export function progressFrom(log) {
  let reset = -Infinity;
  log.forEach((e) => { if (e.k === "r" && e.at > reset) reset = e.at; });
  const out = {};
  const live = log.filter((e) => e.k !== "r" && e.at > reset);
  live.filter((e) => e.k === "b").forEach((e) => { out[e.q] = { n: e.n, c: e.c, l: e.l }; });
  live.filter((e) => e.k === "a")
    .sort((x, y) => x.at - y.at) // stable: answers in the same millisecond keep the log's order
    .forEach((e) => {
      const r = out[e.q] || (out[e.q] = { n: 0, c: 0 });
      r.n++; if (e.ok) r.c++; r.l = e.ok ? 1 : 0;
    });
  return out;
}
export const readProgress = (sj) => progressFrom(readLog(sj));

function append(sj, entry) {
  const sid = sidOf(sj);
  write(LOG + sid, readLog(sid).concat({ id: newId(), at: Date.now(), u: 1, ...entry }));
  changed();
}
export function logAnswer(sj, qid, ok) { append(sj, { k: "a", q: qid, ok: ok ? 1 : 0 }); }
// Starts the subject's counts again. The entries before it are dropped here to keep the device copy small;
// the account keeps them, and the reset entry tells every device to skip them.
export function resetProgress(sj) {
  const sid = sidOf(sj);
  readLog(sid); write(LOG + sid, []);
  append(sid, { k: "r" });
}

// For sync: every entry not yet in the account, and marking entries as sent.
export function unsent() {
  return loadSubjects().flatMap((sj) => readLog(sj).filter((e) => e.u).map((e) => ({ sid: sj.id, e })));
}
export function markSent(sid, ids) {
  const set = new Set(ids);
  write(LOG + sid, readLog(sid).map((e) => (set.has(e.id) ? (({ u, ...rest }) => rest)(e) : e)));
}

// One entry as a row of the "reviews" table, and back.
const KIND = { a: "answer", b: "base", r: "reset" }, KIND_BACK = { answer: "a", base: "b", reset: "r" };
export function toRow(user_id, sid, e) {
  return {
    user_id, id: e.id, subject_id: sid, kind: KIND[e.k], at: new Date(e.at).toISOString(),
    question_id: e.k === "r" ? null : e.q,
    correct: e.k === "a" ? !!e.ok : e.k === "b" ? e.l === 1 : null,
    n: e.k === "b" ? e.n : null, c: e.k === "b" ? e.c : null,
  };
}
export function fromRow(r) {
  const k = KIND_BACK[r.kind], e = { id: r.id, k, at: Date.parse(r.at) };
  if (k === "a") Object.assign(e, { q: r.question_id, ok: r.correct ? 1 : 0 });
  if (k === "b") Object.assign(e, { q: r.question_id, n: r.n | 0, c: r.c | 0, l: r.correct ? 1 : 0 });
  return e;
}

// For sync only: put what came from the account on the device without marking it as a local change.
// reviews: rows of the "reviews" table; an entry the device already has is replaced by the account's copy.
// Returns true when the counts on the device changed.
export function applyRemote({ subjects = [], removed = [], reviews = [] }) {
  if (subjects.length || removed.length) {
    const gone = new Set(removed), fresh = new Map(subjects.map((sj) => [sj.id, sj]));
    const list = rawSubjects().filter((sj) => !gone.has(sj.id)).map((sj) => fresh.get(sj.id) || sj);
    const have = new Set(list.map((sj) => sj.id));
    subjects.forEach((sj) => { if (!have.has(sj.id)) list.push(sj); });
    write(STORE, list);
    removed.forEach((id) => { remove(LOG + id); remove(LEGACY + id); });
  }
  const bySubject = new Map();
  reviews.forEach((r) => { if (KIND_BACK[r.kind]) (bySubject.get(r.subject_id) || bySubject.set(r.subject_id, []).get(r.subject_id)).push(r); });
  const marks = loadMeta().s;
  const deleted = new Set(Object.keys(marks).filter((id) => marks[id].del));
  let any = false;
  bySubject.forEach((rows, sid) => {
    if (deleted.has(sid)) return;
    const log = readLog(sid), at = new Map(log.map((e, k) => [e.id, k]));
    const before = JSON.stringify(progressFrom(log));
    rows.forEach((r) => { const e = fromRow(r); if (at.has(e.id)) log[at.get(e.id)] = e; else { at.set(e.id, log.length); log.push(e); } });
    write(LOG + sid, log);
    if (JSON.stringify(progressFrom(log)) !== before) any = true;
  });
  return any;
}

// Another account signed in on this device: its subjects replace the ones here.
export function clearLocal() {
  keys(LOG).concat(keys(LEGACY)).forEach(remove);
  write(STORE, []); saveMeta({ user: null, s: {}, rc: null });
}

// ----- Sync decisions (used by src/cloud/sync.js)

// What to do with one subject. local: its mark on the device (or undefined); remote: { at, deleted } (or undefined).
export function decide(local, remote) {
  const here = !!local && (local.dirty || (!remote && !local.del));
  const there = !!remote && (!local || local.base !== remote.at);
  if (here && there) return "both";
  return here ? "push" : there ? "pull" : "none";
}
