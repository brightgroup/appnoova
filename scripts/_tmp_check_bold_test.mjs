import { createClient } from "@supabase/supabase-js";
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: reqs } = await db
  .from("bold_payment_requests")
  .select("*")
  .order("created_at", { ascending: false })
  .limit(10);
console.log("bold_payment_requests (last 10):", JSON.stringify(reqs, null, 2));

const { data: unmatched } = await db
  .from("bold_unmatched_events")
  .select("*")
  .order("created_at", { ascending: false })
  .limit(10);
console.log("bold_unmatched_events (last 10):", JSON.stringify(unmatched, null, 2));

const { data: invoices } = await db
  .from("billing_invoices")
  .select("*")
  .not("bold_transaction_id", "is", null)
  .order("created_at", { ascending: false })
  .limit(10);
console.log("billing_invoices with bold_transaction_id:", JSON.stringify(invoices, null, 2));
