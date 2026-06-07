import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-server";
import { getTelephonyProvider, voiceWebhookUrl } from "@/lib/telephony";
import { adminClient } from "@/lib/voice-agents-server";
import type { TelephonyProvider } from "@/types/phone-number";

interface ProvisionBody {
  user_id: string;
  e164: string;
  country_code?: string;
  voice_agent_id?: string | null;
  friendly_name?: string;
  provider?: TelephonyProvider;
}

/** POST — compra un número y lo asigna a un usuario (y opcionalmente a un agente). */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  let body: ProvisionBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const { user_id, e164, voice_agent_id, friendly_name } = body;
  if (!user_id || !e164) {
    return NextResponse.json({ error: "user_id y e164 son requeridos" }, { status: 400 });
  }

  const country_code = (body.country_code ?? "US").toUpperCase();
  const provider = getTelephonyProvider(body.provider ?? "telnyx");
  if (!provider.isConfigured()) {
    return NextResponse.json(
      { error: `Telnyx no configurado. Agrega TELNYX_API_KEY en .env.local` },
      { status: 503 }
    );
  }

  const db = adminClient();

  const { data: userRow } = await db.from("users").select("id").eq("id", user_id).maybeSingle();
  if (!userRow) {
    return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
  }

  if (voice_agent_id) {
    const { data: agent } = await db
      .from("voice_agents")
      .select("id")
      .eq("id", voice_agent_id)
      .eq("user_id", user_id)
      .maybeSingle();
    if (!agent) {
      return NextResponse.json({ error: "Agente no pertenece a ese usuario" }, { status: 400 });
    }
  }

  const { data: existing } = await db
    .from("phone_numbers")
    .select("id")
    .eq("e164", e164)
    .eq("status", "active")
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ error: "Ese número ya está activo en la plataforma" }, { status: 409 });
  }

  const voiceWebhook = voiceWebhookUrl(provider.id);

  try {
    const purchased = await provider.purchaseNumber({
      e164,
      country_code,
      voice_webhook_url: voiceWebhook,
      friendly_name
    });

    if (voice_agent_id) {
      await db
        .from("phone_numbers")
        .update({ voice_agent_id: null, updated_at: new Date().toISOString() })
        .eq("voice_agent_id", voice_agent_id)
        .eq("status", "active");
    }

    const now = new Date().toISOString();
    const { data: row, error } = await db
      .from("phone_numbers")
      .insert({
        user_id,
        voice_agent_id: voice_agent_id ?? null,
        provider: purchased.provider,
        provider_sid: purchased.provider_sid,
        provider_account_ref: purchased.provider_account_ref,
        e164: purchased.e164,
        friendly_name: purchased.friendly_name ?? friendly_name ?? null,
        country_code: purchased.country_code,
        number_type: "purchased",
        status: "active",
        capabilities: purchased.capabilities,
        inbound_webhook_url: purchased.inbound_webhook_url,
        voice_config: purchased.voice_config,
        monthly_cost_usd: purchased.monthly_cost_usd,
        assigned_by: auth.userId,
        assigned_at: now,
        updated_at: now
      })
      .select("*")
      .single();

    if (error) {
      try {
        await provider.releaseNumber(purchased.provider_sid);
      } catch {
        /* rollback best-effort */
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ phone_number: row }, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error al aprovisionar número";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
