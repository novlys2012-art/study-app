// Keeps the subjects and quiz progress on this device and in the student's account the same.
// The device notes each change (src/app/subjects.js); a sync sends what changed here, fetches what
// changed in the account, and when both changed the newer subject wins and the progress is merged.
import * as cloud from "./supabase.js";
import { loadSubjects, loadMeta, saveMeta, readProgress, applyRemote, clearLocal, decide, mergeProgress } from "../app/subjects.js";

const ms = (iso) => Date.parse(iso);
const iso = (at) => new Date(at).toISOString();

let running = null, again = false;
// Returns true when the device's data changed. Calls made during a sync run once more after it.
export function sync() {
  if (running) { again = true; return running; }
  running = (async () => {
    let any = false;
    try { do { again = false; any = (await once()) || any; } while (again); } finally { running = null; }
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
    // First sync on this device: everything made before signing in goes to the account.
    const now = Date.now();
    loadSubjects().forEach((sj) => {
      if (!meta.s[sj.id]) meta.s[sj.id] = { at: now, dirty: true };
      if (!meta.p[sj.id] && Object.keys(readProgress(sj)).length) meta.p[sj.id] = { at: now, dirty: true };
    });
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
    if (gone.length) await cloud.removeProgress(gone);
    push.forEach((r) => sent("s", r.id, ms(r.updated_at)));
  }
  if (pull.length) {
    const got = await cloud.rows("subjects", "id,data,updated_at,deleted", pull);
    meta = loadMeta();
    const subjects = [], removed = [];
    got.forEach((r) => {
      if (meta.s[r.id] && meta.s[r.id].dirty && meta.s[r.id].at >= ms(r.updated_at)) return;
      if (r.deleted || !r.data) { removed.push(r.id); delete meta.p[r.id]; } else subjects.push({ ...r.data, id: r.id });
      meta.s[r.id] = { at: ms(r.updated_at), base: ms(r.updated_at), dirty: false, del: !!r.deleted };
    });
    applyRemote({ subjects, removed }); saveMeta(meta);
    any = any || subjects.length > 0 || removed.length > 0;
  }

  // ----- Progress, for the subjects that are on the device now
  const rp = new Map((await cloud.rows("progress", "subject_id,updated_at")).map((r) => [r.subject_id, { at: ms(r.updated_at) }]));
  meta = loadMeta();
  const ids = loadSubjects().map((sj) => sj.id);
  const plan = ids.map((id) => [id, decide(meta.p[id], rp.get(id))]);
  const fetchIds = plan.filter(([, what]) => what === "pull" || what === "both").map(([id]) => id);
  const got = new Map((fetchIds.length ? await cloud.rows("progress", "subject_id,data,updated_at", fetchIds) : []).map((r) => [r.subject_id, r]));
  meta = loadMeta();
  const up = [], down = {};
  plan.forEach(([id, what]) => {
    const r = got.get(id), l = meta.p[id];
    if (what === "none" || ((what === "pull" || what === "both") && !r)) return;
    // An answer given while the rows were on their way makes this a merge.
    if (what === "pull" && l && l.dirty) what = "both";
    if (what === "pull") { down[id] = r.data || {}; meta.p[id] = { at: ms(r.updated_at), base: ms(r.updated_at), dirty: false }; return; }
    let data = readProgress(id), at = (l && l.at) || Date.now();
    if (what === "both") { data = mergeProgress(data, r.data); at = Math.max(at, ms(r.updated_at) + 1); down[id] = data; }
    meta.p[id] = { ...l, at, dirty: true };
    up.push({ user_id, subject_id: id, data, updated_at: iso(at) });
  });
  applyRemote({ progress: down }); saveMeta(meta);
  any = any || Object.keys(down).length > 0;
  if (up.length) {
    await cloud.upsert("progress", up);
    up.forEach((r) => sent("p", r.subject_id, ms(r.updated_at)));
  }
  return any;
}
