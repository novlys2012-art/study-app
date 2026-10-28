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

export async function signIn(email) {
  const { error } = await client().auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname } });
  if (error) throw new CloudError(error.status === 429 ? "rate" : "signIn", error.message);
}

export const signOut = () => client().auth.signOut();

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
