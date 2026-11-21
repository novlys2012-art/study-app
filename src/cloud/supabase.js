// Sign-in and the server function, through Supabase. The Claude key lives only in the server function;
// the browser holds the project's public key, which is safe to publish.
// Set at build time: VITE_SUPABASE_URL and VITE_SUPABASE_KEY (the publishable or anon key).
import { createClient } from "@supabase/supabase-js";

const URL = import.meta.env.VITE_SUPABASE_URL || "";
const KEY = import.meta.env.VITE_SUPABASE_KEY || "";
export const configured = !!(URL && KEY);

let sb;
function client() {
  // PKCE puts ?code= in the sign-in link, which leaves the #subject routing alone.
  if (!sb) sb = createClient(URL, KEY, { auth: { flowType: "pkce", detectSessionInUrl: true, persistSession: true } });
  return sb;
}

export class CloudError extends Error {
  constructor(code, message) { super(message || code); this.code = code; }
}

export async function session() {
  const { data, error } = await client().auth.getSession();
  if (error) throw new CloudError("auth", error.message);
  if (/[?&]code=/.test(location.search)) history.replaceState(null, "", location.pathname + location.hash);
  return data.session;
}

const isNetworkErr = (e) => {
  const m = String((e && e.message) || e || "");
  return (e && e.name === "AuthRetryableFetchError") || /failed to fetch|networkerror|load failed|fetch|offline|timeout/i.test(m);
};

// Sends the sign-in email: a code to type on any device, plus a link that works in this browser.
export async function signIn(email) {
  let error;
  try {
    ({ error } = await client().auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname } }));
  } catch (e) {
    throw new CloudError(isNetworkErr(e) ? "network" : "signIn", e && e.message);
  }
  if (!error) return;
  if (isNetworkErr(error)) throw new CloudError("network", error.message);
  // 429 is either the project's hourly email cap or the one-minute wait between codes for one address.
  if (error.status === 429) throw new CloudError(/seconds/i.test(error.message) ? "wait" : "rate", error.message);
  throw new CloudError("signIn", error.message);
}

export async function verifyCode(email, code) {
  let data, error;
  try {
    ({ data, error } = await client().auth.verifyOtp({ email, token: code, type: "email" }));
  } catch (e) {
    throw new CloudError(isNetworkErr(e) ? "network" : "unknown", e && e.message);
  }
  if (error) {
    if (isNetworkErr(error)) throw new CloudError("network", error.message);
    if (error.status === 429) throw new CloudError("rate", error.message);
    if (/expired/i.test(error.message || "") && !/invalid/i.test(error.message || "")) throw new CloudError("expired", error.message);
    throw new CloudError("code", error.message);
  }
  return data.session;
}

export async function signOut() {
  if (!configured) return;
  const c = client();
  try {
    const { error } = await c.auth.signOut();
    if (error) await c.auth.signOut({ scope: "local" });
  } catch (e) {
    try { await c.auth.signOut({ scope: "local" }); } catch (e2) {}
  }
  try {
    for (let k = localStorage.length - 1; k >= 0; k--) {
      const key = localStorage.key(k);
      if (key && /^sb-.+-auth-token/.test(key)) localStorage.removeItem(key);
    }
  } catch (e) {}
}

// One server task. Returns { result, usage: { monthUsd, limitUsd } }.
export async function call(task, input, lang) {
  const s = await session();
  if (!s) throw new CloudError("auth");
  let res;
  try {
    res = await fetch(`${URL}/functions/v1/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${s.access_token}`, apikey: KEY },
      body: JSON.stringify({ task, input, lang }),
    });
  } catch (e) {
    throw new CloudError("network", e.message);
  }
  let body = {};
  try { body = await res.json(); } catch (e) {}
  if (!res.ok) throw new CloudError(body.error || "server", body.message || res.statusText);
  return body;
}

// ----- The student's own rows in the "subjects", "progress" and "reviews" tables (row level security keeps them apart).
const KEYS = { subjects: "user_id,id", progress: "user_id,subject_id" };
const fail = (error) => new CloudError(error.code ? "db" : "network", error.message);

// Rows of one table; with ids, only those rows (the id column is "id" or "subject_id").
export async function rows(table, columns, ids) {
  let q = client().from(table).select(columns);
  if (ids) q = q.in(table === "progress" ? "subject_id" : "id", ids);
  const { data, error } = await q;
  if (error) throw fail(error);
  return data;
}
export async function upsert(table, list) {
  const { error } = await client().from(table).upsert(list, { onConflict: KEYS[table] });
  if (error) throw fail(error);
}
export async function removeProgress(ids) {
  const { error } = await client().from("progress").delete().in("subject_id", ids);
  if (error) throw fail(error);
}

// The answer log. Rows are only ever added (a row the account already has is skipped) or, with their
// subject, deleted; never changed.
export async function addReviews(list) {
  const { error } = await client().from("reviews").upsert(list, { onConflict: "user_id,id", ignoreDuplicates: true });
  if (error) throw fail(error);
}
// Rows the server stamped after a time (ISO), oldest first, a page at a time.
export async function reviewsSince(since) {
  const out = [], PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    let q = client().from("reviews").select("id,subject_id,question_id,kind,correct,n,c,at,created_at");
    if (since) q = q.gt("created_at", since);
    const { data, error } = await q.order("created_at").order("id").range(from, from + PAGE - 1);
    if (error) throw fail(error);
    out.push(...data);
    if (data.length < PAGE) return out;
  }
}
export async function removeReviews(ids) {
  const { error } = await client().from("reviews").delete().in("subject_id", ids);
  if (error) throw fail(error);
}
