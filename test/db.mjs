// Applies every migration to a fresh database on a plain Postgres (with a stand-in for Supabase's auth
// schema and default grants, test/db/supabase-stub.sql) and checks who may read and write what (test/db/rls.sql).
// Usage: DATABASE_URL=postgres://user:pass@host:5432/postgres npm run test:db   (needs psql)
import { execFileSync } from "node:child_process";
import { readdirSync, existsSync } from "node:fs";

const url = process.env.DATABASE_URL;
if (!url) { console.error("Set DATABASE_URL to a Postgres server the test may create a database on."); process.exit(1); }
const root = new URL("../", import.meta.url).pathname;
const name = "study_app_test_" + process.pid;
const psql = (db, args) => execFileSync("psql", [db, "-X", "-q", "-v", "ON_ERROR_STOP=1", ...args], { stdio: "inherit", env: { ...process.env, PGOPTIONS: "-c client_min_messages=warning" } });
const at = (db) => { const u = new URL(url); u.pathname = "/" + db; return u.toString(); };

psql(url, ["-c", `create database ${name}`]);
try {
  const db = at(name);
  psql(db, ["-f", root + "test/db/supabase-stub.sql"]);
  for (const f of readdirSync(root + "supabase/migrations").filter((f) => f.endsWith(".sql")).sort()) {
    psql(db, ["-f", root + "supabase/migrations/" + f]);
    const seed = root + "test/db/after-" + f;
    if (existsSync(seed)) psql(db, ["-f", seed]);
  }
  psql(db, ["-f", root + "test/db/rls.sql"]);
} finally {
  psql(url, ["-c", `drop database if exists ${name}`]);
}
