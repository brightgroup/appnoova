import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/admin-server";
import { adminClient } from "@/lib/voice-agents-server";
import {
  CALL_RULES_KEY,
  DEFAULT_CALL_RULES,
  getCallEngineRules,
  saveSetting,
  type CallEngineRules,
} from "@/lib/call-engine/platform-config";

export async function GET(req: NextRequest) {
  const auth = await requireSuperAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const db = adminClient();
  const rules = await getCallEngineRules(db);
  return NextResponse.json({ rules, defaults: DEFAULT_CALL_RULES });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireSuperAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => ({}));
  const db = adminClient();
  const current = await getCallEngineRules(db);

  const clampNum = (v: unknown, fallback: number, min: number, max: number) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, Math.round(n)));
  };

  const next: CallEngineRules = {
    tick_minutes: clampNum(body.tick_minutes, current.tick_minutes, 1, 1440),
    batch_size: clampNum(body.batch_size, current.batch_size, 1, 1000),
    max_concurrent: clampNum(body.max_concurrent, current.max_concurrent, 1, 500),
    retry_gap_minutes: clampNum(body.retry_gap_minutes, current.retry_gap_minutes, 1, 10080),
    ring_timeout_seconds: clampNum(body.ring_timeout_seconds, current.ring_timeout_seconds, 5, 120),
    enabled: typeof body.enabled === "boolean" ? body.enabled : current.enabled,
  };

  await saveSetting(db, CALL_RULES_KEY, next, auth.userId);
  return NextResponse.json({ rules: next });
}
