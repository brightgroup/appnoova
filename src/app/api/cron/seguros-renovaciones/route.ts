import { NextRequest, NextResponse } from "next/server";
import { getOrgServiceBlock } from "@/lib/billing/org-service-gate";
import { requireSuperAdmin } from "@/lib/admin-server";
import { adminClient } from "@/lib/voice-agents-server";
import { assertOrgSegurosEnabled } from "@/lib/org-modules";
import { resolveOrgCrmTenantUserId } from "@/lib/org-crm-tenant";
import { listRenovacionRulesPorHora, type RenovacionRule } from "@/lib/insurers/renovacion-rules-db";
import { existeAvisoPara, listAvisosEnviadosSinRespuesta, marcarRespuesta } from "@/lib/insurers/renovacion-avisos-db";
import { listPolizasQueVencenEn, type PolizaRecord } from "@/lib/insurers/polizas-db";
import { enviarAvisoPoliza } from "@/lib/insurers/renovacion-engine";
import { escalarRenovacionALlamada } from "@/lib/insurers/renovacion-llamada";

function bogotaDateKey(offsetDays = 0): string {
  const now = new Date();
  now.setDate(now.getDate() + offsetDays);
  return now.toLocaleDateString("en-CA", { timeZone: "America/Bogota" }); // en-CA => yyyy-mm-dd
}

/**
 * Procesa los avisos de renovación de una organización para un hito
 * (dias_aviso) concreto. Idempotente: existeAvisoPara + el unique(poliza_id,
 * dias_aviso) de la tabla son la doble red — aunque el cron corra dos veces
 * en la misma hora, no se reenvía.
 */
async function procesarHito(
  db: ReturnType<typeof adminClient>,
  rule: RenovacionRule,
  crmUserId: string,
  diasAviso: number,
  channelRow: Record<string, unknown>,
  templateRow: Record<string, unknown>
): Promise<{ enviados: number; omitidos: number; fallidos: number }> {
  const fechaObjetivo = bogotaDateKey(diasAviso);
  const polizas: PolizaRecord[] = await listPolizasQueVencenEn(db, crmUserId, fechaObjetivo);

  let enviados = 0;
  let omitidos = 0;
  let fallidos = 0;

  for (const poliza of polizas) {
    if (await existeAvisoPara(db, poliza.id, diasAviso)) continue;

    const result = await enviarAvisoPoliza(db, {
      organizationId: rule.organizationId,
      poliza,
      diasAviso,
      channelRow,
      templateRow
    });

    if (result.estado === "enviado") enviados++;
    else if (result.estado === "omitido_optout" || result.estado === "sin_telefono") omitidos++;
    else if (result.estado === "fallido") fallidos++;
    // "bloqueado_billing" y "plantilla_no_lista" no cuentan aparte — ya quedan en el log de consola.
  }

  return { enviados, omitidos, fallidos };
}

/** Marca respuesta en avisos previos comparando contra el último inbound del contacto — no hay primitiva de "respondió a este mensaje" en el inbox, así que se compara timestamps. */
async function marcarRespuestas(db: ReturnType<typeof adminClient>, organizationId: string): Promise<void> {
  const pendientes = await listAvisosEnviadosSinRespuesta(db, organizationId);
  for (const aviso of pendientes) {
    if (!aviso.contactId || !aviso.sentAt) continue;
    const { data: contactRow } = await db
      .from("crm_contacts")
      .select("ultimo_inbound_wa")
      .eq("id", aviso.contactId)
      .maybeSingle();
    const ultimoInbound = contactRow?.ultimo_inbound_wa as string | null | undefined;
    if (ultimoInbound && new Date(ultimoInbound) > new Date(aviso.sentAt)) {
      await marcarRespuesta(db, aviso.id, ultimoInbound);
    }
  }
}

async function run(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const provided = req.headers.get("x-cron-secret");

  if (secret) {
    if (provided !== secret) {
      const auth = await requireSuperAdmin(req);
      if (auth instanceof NextResponse) return auth;
    }
  } else {
    const auth = await requireSuperAdmin(req);
    if (auth instanceof NextResponse) return auth;
  }

  const db = adminClient();
  const currentHour = Number(
    new Date().toLocaleString("en-US", { timeZone: "America/Bogota", hour: "2-digit", hour12: false })
  );

  const rules = await listRenovacionRulesPorHora(db, currentHour);
  const results: Record<string, unknown>[] = [];

  for (const rule of rules) {
    const gate = await assertOrgSegurosEnabled(db, rule.organizationId);
    if (!gate.ok) continue;
    if (await getOrgServiceBlock(db, rule.organizationId)) continue;

    const crmUserId = await resolveOrgCrmTenantUserId(rule.organizationId, "");
    if (!crmUserId) continue;

    await marcarRespuestas(db, rule.organizationId);

    if (!rule.whatsappChannelId || !rule.templateId) {
      results.push({ organization_id: rule.organizationId, skipped: "sin_canal_o_plantilla" });
      continue;
    }

    const [{ data: channelRow }, { data: templateRow }] = await Promise.all([
      db.from("whatsapp_channels").select("*").eq("id", rule.whatsappChannelId).maybeSingle(),
      db.from("whatsapp_templates").select("*").eq("id", rule.templateId).maybeSingle()
    ]);
    if (!channelRow || !templateRow) {
      results.push({ organization_id: rule.organizationId, skipped: "canal_o_plantilla_no_encontrados" });
      continue;
    }

    let enviados = 0;
    let omitidos = 0;
    let fallidos = 0;
    for (const dias of rule.diasAviso) {
      const r = await procesarHito(db, rule, crmUserId, dias, channelRow, templateRow);
      enviados += r.enviados;
      omitidos += r.omitidos;
      fallidos += r.fallidos;
    }

    if (rule.escalarALlamada) {
      await escalarRenovacionALlamada(db, rule, crmUserId);
    }

    results.push({ organization_id: rule.organizationId, enviados, omitidos, fallidos });
  }

  return NextResponse.json({ ok: true, hour_checked: currentHour, organizations_checked: rules.length, results });
}

export async function POST(req: NextRequest) {
  return run(req);
}

export async function GET(req: NextRequest) {
  return run(req);
}
