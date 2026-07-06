import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/voice-agents-server";
import { requireOrgModule } from "@/lib/module-auth";
import { toVoiceCampaignRecord } from "@/lib/campaigns/record";
import { triggerCampaignDialerOnActivation } from "@/lib/call-engine/dialer-scheduler";
import {
  mergeOutputFieldsRespectingLock,
  normalizeCrmConfig,
  normalizeOutputFields,
  validateOutputFields,
} from "@/lib/campaigns/output-fields";
import type {
  CampaignCrmConfig,
  CampaignFieldMapping,
  CampaignOutputField,
  CampaignScheduleConfig,
  CampaignTriggerRule,
  CampaignType,
} from "@/types/voice-campaign";

const CAMPAIGN_TYPES: CampaignType[] = ["prospeccion", "seguimiento", "encuesta", "notificacion"];

type RouteCtx = { params: Promise<{ id: string }> };

async function loadCampaign(id: string, organizationId: string) {
  const db = adminClient();
  const { data, error } = await db
    .from("voice_campaigns")
    .select("*")
    .eq("id", id)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function GET(_req: NextRequest, ctx: RouteCtx) {
  const auth = await requireOrgModule(_req, "campaigns", "view");
  if (auth instanceof NextResponse) return auth;

  const { id } = await ctx.params;
  try {
    const row = await loadCampaign(id, auth.organizationId);
    if (!row) return NextResponse.json({ error: "Campaña no encontrada" }, { status: 404 });
    return NextResponse.json({ campaign: toVoiceCampaignRecord(row) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, ctx: RouteCtx) {
  const auth = await requireOrgModule(req, "campaigns", "edit");
  if (auth instanceof NextResponse) return auth;

  const { id } = await ctx.params;
  let body: {
    name?: string;
    goal?: string | null;
    voice_agent_id?: string;
    wizard_step?: number;
    schedule_config?: CampaignScheduleConfig;
    trigger_rule?: CampaignTriggerRule;
    field_mapping?: CampaignFieldMapping;
    prompt_template?: string | null;
    status?: string;
    campaign_type?: CampaignType;
    output_fields?: CampaignOutputField[];
    crm_config?: CampaignCrmConfig;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const existing = await loadCampaign(id, auth.organizationId);
  if (!existing) return NextResponse.json({ error: "Campaña no encontrada" }, { status: 404 });

  if (body.status === "active" && existing.status === "completed") {
    return NextResponse.json(
      {
        error: "Reinicia los contactos antes de reactivar una campaña finalizada.",
        code: "campaign_completed",
      },
      { status: 400 }
    );
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.name !== undefined) patch.name = body.name.trim();
  if (body.goal !== undefined) patch.goal = body.goal?.trim() || null;
  if (body.voice_agent_id !== undefined) patch.voice_agent_id = body.voice_agent_id;
  if (body.wizard_step !== undefined) patch.wizard_step = body.wizard_step;
  if (body.schedule_config !== undefined) patch.schedule_config = body.schedule_config;
  if (body.trigger_rule !== undefined) patch.trigger_rule = body.trigger_rule;
  if (body.field_mapping !== undefined) patch.field_mapping = body.field_mapping;
  if (body.prompt_template !== undefined) {
    patch.prompt_template = body.prompt_template?.trim() ? body.prompt_template : null;
  }

  const locked = existing.status !== "draft";

  if (body.campaign_type !== undefined) {
    if (!CAMPAIGN_TYPES.includes(body.campaign_type)) {
      return NextResponse.json({ error: "Tipo de campaña inválido" }, { status: 400 });
    }
    if (locked && body.campaign_type !== existing.campaign_type) {
      return NextResponse.json(
        { error: "El tipo de campaña no se puede cambiar después de activarla" },
        { status: 400 }
      );
    }
    patch.campaign_type = body.campaign_type;
  }

  if (body.output_fields !== undefined) {
    const incoming = normalizeOutputFields(body.output_fields);
    const validationError = validateOutputFields(incoming);
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });
    // Tras activar: tipos y opciones congelados; la instrucción IA sí se puede ajustar.
    patch.output_fields = mergeOutputFieldsRespectingLock(
      normalizeOutputFields(existing.output_fields),
      incoming,
      locked
    );
  }

  if (body.crm_config !== undefined) {
    const type =
      (patch.campaign_type as CampaignType | undefined) ??
      (CAMPAIGN_TYPES.includes(existing.campaign_type as CampaignType)
        ? (existing.campaign_type as CampaignType)
        : "prospeccion");
    patch.crm_config = normalizeCrmConfig(body.crm_config, type);
  }

  if (body.status !== undefined) {
    if (body.status === "active" && existing.status !== "active") {
      const fields = normalizeOutputFields(
        (patch.output_fields as CampaignOutputField[] | undefined) ?? existing.output_fields
      );
      const activationError = validateOutputFields(fields, {
        requirePrimary: fields.length > 0,
      });
      if (activationError) {
        return NextResponse.json({ error: activationError }, { status: 400 });
      }
      patch.completed_at = null;
    }
    patch.status = body.status;
  }

  const db = adminClient();
  const { data, error } = await db
    .from("voice_campaigns")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (body.status === "active" && existing.status !== "active") {
    triggerCampaignDialerOnActivation();
  }

  return NextResponse.json({ campaign: toVoiceCampaignRecord(data) });
}

export async function DELETE(_req: NextRequest, ctx: RouteCtx) {
  const auth = await requireOrgModule(_req, "campaigns", "edit");
  if (auth instanceof NextResponse) return auth;

  const { id } = await ctx.params;
  const existing = await loadCampaign(id, auth.organizationId);
  if (!existing) return NextResponse.json({ error: "Campaña no encontrada" }, { status: 404 });

  const db = adminClient();
  const { error } = await db.from("voice_campaigns").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
