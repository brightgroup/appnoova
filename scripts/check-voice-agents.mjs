import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => l.split("=").map((s) => s.trim()))
);

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await db.from("voice_agents").select("id, template_id, name, user_id, calls_count");
console.log(error ? `ERROR: ${error.message}` : `ROWS: ${data?.length ?? 0}`);
(data ?? []).forEach((r) => console.log(`- ${r.name} | ${r.template_id} | calls=${r.calls_count}`));
