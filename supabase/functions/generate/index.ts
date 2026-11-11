// Supabase Edge Function: the only place that holds the Claude key (secret ANTHROPIC_API_KEY).
// Shared code is copied into ../_shared by `npm run fn:prepare` before serving or deploying.
import { createClient } from "@supabase/supabase-js";
import { getProvider } from "../_shared/ai/index.js";
import { handle, HttpError } from "../_shared/server/generate.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "method" });
  const env = Deno.env.toObject();
  const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  try {
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const { data } = token ? await admin.auth.getUser(token) : { data: { user: null } };
    const user = data?.user ? { id: data.user.id, email: data.user.email } : null;
    let body: unknown;
    try { body = await req.json(); } catch { return json(400, { error: "bad_input" }); }
    const out = await handle(body, {
      user, env, ai: getProvider(env),
      async spend(uid: string) {
        const { data, error } = await admin.rpc("ai_spend", { uid });
        if (error) throw error;
        const row = (Array.isArray(data) ? data[0] : data) || {};
        return { month: Number(row.user_month || 0), today: Number(row.all_today || 0), minute: Number(row.user_minute || 0) };
      },
      async record(row: Record<string, unknown>) {
        const { error } = await admin.from("ai_usage").insert(row);
        if (error) throw error;
      },
      // Answers stored by content hash (table ai_cache, service role only), so a repeated request is free.
      cache: {
        async get(key: string) {
          const { data, error } = await admin.from("ai_cache").select("result").eq("key", key).maybeSingle();
          if (error) throw error;
          return data ? data.result : null;
        },
        async put(row: Record<string, unknown>) {
          const { error } = await admin.from("ai_cache").upsert(row, { onConflict: "key", ignoreDuplicates: true });
          if (error) throw error;
        },
      },
    });
    return json(200, out);
  } catch (e) {
    if (e instanceof HttpError) return json(e.status, { error: e.code, message: e.message });
    // Details stay in the function's log; the app only gets a code.
    console.error(e);
    return json(500, { error: "server_error" });
  }
});
