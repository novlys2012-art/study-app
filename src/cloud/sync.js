// Keeps the subjects and the answer log on this device and in the student's account the same.
// The device notes each change (src/app/subjects.js); a sync sends what changed here and fetches what
// changed in the account. When both changed a subject, the newer one wins. Answers are separate rows
// that are only ever added, so answers from two devices are all kept.
import * as cloud from "./supabase.js";
import { loadSubjects, loadMeta, saveMeta, unsent, markSent, toRow, applyRemote, clearLocal, decide } from "../app/subjects.js";

const ms = (iso) => Date.parse(iso);
const iso = (at) => new Date(at).toISOString();
// Answers are pulled from a little before the newest one seen, because a row can become visible
// a moment after a newer one; rows seen twice are simply the same entry.
const OVERLAP_MS = 5 * 60 * 1000;
const PUSH_BATCH = 500;

let running = null, again = false;
// Returns true when the device's data changed. Calls made during a sync run once more after it.
export function sync() {
  if (running) { again = true; return running; }
  // A run that fails (offline) still runs again when asked to meanwhile, e.g. by the "online" event.
  running = (async () => {
    let any = false, error = null;
    try {
      do {
        again = false;
        try { any = (await once()) || any; error = null; } catch (e) { error = e; }
      } while (again);
    } finally { running = null; }
    if (error) throw error;
    return any;
  })();
  return running;
}

// Marks are read again after every wait, because the student may have answered a question meanwhile.
const sent = (kind, id, at) => {
  const meta = loadMeta(), m = meta[kind][id];
  if (!m) return;
  m.base = at; if (m.at === at) m.dirty = false;
  saveMeta(meta);
};

async function once() {
  if (!cloud.configured) return false;
  const s = await cloud.session();
  if (!s) return false;
  let meta = loadMeta(), any = false;
  if (meta.user && meta.user !== s.user.id) { clearLocal(); meta = loadMeta(); any = true; }
  if (!meta.user) {
    // First sync on this device: everything made before signing in goes to the account
    // (the answer log's entries are all still unsent).
    const now = Date.now();
    loadSubjects().forEach((sj) => { if (!meta.s[sj.id]) meta.s[sj.id] = { at: now, dirty: true }; });
    meta.user = s.user.id; saveMeta(meta);
  }
  const user_id = s.user.id;

  // ----- Subjects
  const remote = new Map((await cloud.rows("subjects", "id,updated_at,deleted")).map((r) => [r.id, { at: ms(r.updated_at), deleted: r.deleted }]));
  const local = new Map(loadSubjects().map((sj) => [sj.id, sj]));
  const push = [], pull = [];
  new Set([...Object.keys(meta.s), ...remote.keys()]).forEach((id) => {
    const l = meta.s[id], r = remote.get(id);
    let what = decide(l, r);
    if (what === "both") what = l.at >= r.at ? "push" : "pull";
    if (what === "push" && !l.del && !local.has(id)) what = r ? "pull" : "none";
    if (what === "push") push.push({ user_id, id, data: l.del ? null : local.get(id), deleted: !!l.del, updated_at: iso(l.at) });
    if (what === "pull") pull.push(id);
  });
  if (push.length) {
    await cloud.upsert("subjects", push);
    const gone = push.filter((r) => r.deleted).map((r) => r.id);
    if (gone.length) { await cloud.removeReviews(gone); await cloud.removeProgress(gone); }
    push.forEach((r) => sent("s", r.id, ms(r.updated_at)));
  }
  if (pull.length) {
    const got = await cloud.rows("subjects", "id,data,updated_at,deleted", pull);
    meta = loadMeta();
    const subjects = [], removed = [];
    got.forEach((r) => {
      if (meta.s[r.id] && meta.s[r.id].dirty && meta.s[r.id].at >= ms(r.updated_at)) return;
      if (r.deleted || !r.data) removed.push(r.id); else subjects.push({ ...r.data, id: r.id });
      meta.s[r.id] = { at: ms(r.updated_at), base: ms(r.updated_at), dirty: false, del: !!r.deleted };
    });
    applyRemote({ subjects, removed }); saveMeta(meta);
    any = any || subjects.length > 0 || removed.length > 0;
  }

  // ----- Answer log: send the new entries, then fetch what other devices added
  const out = unsent();
  for (let k = 0; k < out.length; k += PUSH_BATCH) {
    const batch = out.slice(k, k + PUSH_BATCH);
    await cloud.addReviews(batch.map(({ sid, e }) => toRow(user_id, sid, e)));
    const bySubject = new Map();
    batch.forEach(({ sid, e }) => (bySubject.get(sid) || bySubject.set(sid, []).get(sid)).push(e.id));
    bySubject.forEach((ids, sid) => markSent(sid, ids));
  }
  meta = loadMeta();
  const got = await cloud.reviewsSince(meta.rc ? iso(ms(meta.rc) - OVERLAP_MS) : null);
  if (got.length) {
    any = applyRemote({ reviews: got }) || any;
    meta = loadMeta();
    meta.rc = got.reduce((m, r) => (!m || ms(r.created_at) > ms(m) ? r.created_at : m), meta.rc);
    saveMeta(meta);
  }
  return any;
}
