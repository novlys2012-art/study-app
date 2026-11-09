// Subjects, their questions and the quiz progress on the device. The device copy is what the app reads,
// so it opens fast and works offline; src/cloud/sync.js copies it to and from the student's account.
// A subject: { id, code, name, term, topics: { key: name }, questions: [{ t, q, o, a, e, x, s }] }
// Questions use the format the AI layer returns (ai/tasks.js); "a" may be an array for several right answers.
const STORE = "studyapp-subjects-v1";
// What the account has seen: { user, s: { subjectId: mark }, p: { subjectId: mark } }.
// A mark is { at: ms of the last change, base: the account's time at the last sync, dirty: not sent yet, del: deleted }.
const META = "studyapp-sync-v1";

// Stable question id from its text, so progress survives adding new questions.
export function hid(s) {
  let h = 5381;
  for (let k = 0; k < s.length; k++) h = ((h << 5) + h + s.charCodeAt(k)) >>> 0;
  return h.toString(36).slice(-5).padStart(5, "0");
}

function read(key, fallback) {
  try { const v = JSON.parse(localStorage.getItem(key)); return v == null ? fallback : v; } catch (e) { return fallback; }
}
function write(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {} }

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
  return { user: m.user || null, s: m.s || {}, p: m.p || {} };
}
export function saveMeta(m) { write(META, m); }

let listener = null;
// Called after every change made on this device (not after changes that came from the account).
export function onLocalChange(fn) { listener = fn; }
const changed = () => { if (listener) listener(); };
const touch = (marks, id, extra) => { marks[id] = { ...marks[id], at: Date.now(), dirty: true, ...extra }; };

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
    touch(meta.s, id, { del: true }); delete meta.p[id]; any = true;
    try { localStorage.removeItem(progressKey(id)); } catch (e) {}
  });
  write(STORE, list);
  if (any) { saveMeta(meta); changed(); }
}

// Quiz progress of one subject: { questionId: { n: answers, c: right ones, l: 1 if the last one was right } }.
export const progressKey = (sj) => "studyapp-progress:" + (sj.id || sj);
export function readProgress(sj) {
  const p = read(progressKey(sj), {});
  return p && typeof p === "object" && !Array.isArray(p) ? p : {};
}
export function writeProgress(sj, p) {
  write(progressKey(sj), p);
  const meta = loadMeta();
  touch(meta.p, sj.id || sj);
  saveMeta(meta); changed();
}

// For sync only: put what came from the account on the device without marking it as a local change.
export function applyRemote({ subjects = [], removed = [], progress = {} }) {
  if (subjects.length || removed.length) {
    const gone = new Set(removed), fresh = new Map(subjects.map((sj) => [sj.id, sj]));
    const list = rawSubjects().filter((sj) => !gone.has(sj.id)).map((sj) => fresh.get(sj.id) || sj);
    const have = new Set(list.map((sj) => sj.id));
    subjects.forEach((sj) => { if (!have.has(sj.id)) list.push(sj); });
    write(STORE, list);
    removed.forEach((id) => { try { localStorage.removeItem(progressKey(id)); } catch (e) {} });
  }
  Object.keys(progress).forEach((id) => write(progressKey(id), progress[id]));
}

// Another account signed in on this device: its subjects replace the ones here.
export function clearLocal() {
  rawSubjects().forEach((sj) => { try { localStorage.removeItem(progressKey(sj)); } catch (e) {} });
  write(STORE, []); saveMeta({ user: null, s: {}, p: {} });
}

// ----- Sync decisions (used by src/cloud/sync.js)

// What to do with one item. local: its mark on the device (or undefined); remote: { at, deleted } (or undefined).
export function decide(local, remote) {
  const here = !!local && (local.dirty || (!remote && !local.del));
  const there = !!remote && (!local || local.base !== remote.at);
  if (here && there) return "both";
  return here ? "push" : there ? "pull" : "none";
}

// Two devices answered questions since the last sync: per question, the record with more answers is kept.
export function mergeProgress(a, b) {
  const out = { ...a };
  Object.keys(b || {}).forEach((id) => { if (!out[id] || (b[id].n || 0) > (out[id].n || 0)) out[id] = b[id]; });
  return out;
}
