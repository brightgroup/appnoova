import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/admin-server";
import { adminClient } from "@/lib/voice-agents-server";
import { VOICE_RECORDINGS_BUCKET, recordingPathFromUrl } from "@/lib/voice-call-storage";

/** Retención de grabaciones de llamadas (Política de Privacidad / Tratamiento de Datos). */
const RETENTION_DAYS = 365;
const BATCH = 200;
const MAX_BATCHES = 25;

/**
 * Job diario: borra del Storage las grabaciones con más de 12 meses y limpia
 * `audio_url` en `voice_agent_calls`. La transcripción y el resumen se conservan
 * con el resto del historial de la cuenta.
 *
 * Auth: header `x-cron-secret` == CRON_SECRET, o superadmin autenticado.
 */
async function run(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("x-cron-secret") !== secret) {
    const auth = await requireSuperAdmin(req);
    if (auth instanceof NextResponse) return auth;
  }

  const db = adminClient();
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  let purged = 0;

  for (let i = 0; i < MAX_BATCHES; i++) {
    const { data: calls, error } = await db
      .from("voice_agent_calls")
      .select("id, audio_url")
      .not("audio_url", "is", null)
      .lt("created_at", cutoff)
      .limit(BATCH);
    if (error) {
      console.error("[cron/purge-recordings] consulta:", error.message);
      return NextResponse.json({ error: error.message, purged }, { status: 500 });
    }
    if (!calls?.length) break;

    const paths = calls
      .map(c => recordingPathFromUrl(String(c.audio_url)))
      .filter((p): p is string => Boolean(p));
    if (paths.length) {
      const { error: rmErr } = await db.storage.from(VOICE_RECORDINGS_BUCKET).remove(paths);
      if (rmErr) {
        console.error("[cron/purge-recordings] storage:", rmErr.message);
        return NextResponse.json({ error: rmErr.message, purged }, { status: 500 });
      }
    }

    const { error: upErr } = await db
      .from("voice_agent_calls")
      .update({ audio_url: null })
      .in("id", calls.map(c => c.id));
    if (upErr) {
      console.error("[cron/purge-recordings] update:", upErr.message);
      return NextResponse.json({ error: upErr.message, purged }, { status: 500 });
    }
    purged += calls.length;
    if (calls.length < BATCH) break;
  }

  return NextResponse.json({ ok: true, purged, cutoff });
}

export const GET = run;
export const POST = run;
