import { NextRequest, NextResponse } from "next/server";
import { notifyLandingLead } from "@/lib/email/notify-landing-lead";
import {
  COMPANY_SIZE_OPTIONS,
  type CompanySize,
  type LandingLeadPayload
} from "@/lib/landing-leads";
import { adminClient } from "@/lib/voice-agents-server";
import { corsPreflight, withCors } from "@/lib/marketing-cors";

const VALID_SIZES = new Set<string>(COMPANY_SIZE_OPTIONS.map(o => o.value));

function cleanStr(v: unknown, max = 500): string {
  return String(v ?? "").trim().slice(0, max);
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function OPTIONS(req: NextRequest) {
  return corsPreflight(req);
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return withCors(req, NextResponse.json({ error: "JSON inválido" }, { status: 400 }));
  }

  const payload: LandingLeadPayload = {
    source: cleanStr(body.source, 120) || "landing",
    plan_interest: cleanStr(body.plan_interest, 80) || null,
    company_name: cleanStr(body.company_name, 200),
    contact_name: cleanStr(body.contact_name, 200),
    email: cleanStr(body.email, 200).toLowerCase(),
    phone: cleanStr(body.phone, 40) || null,
    company_size: cleanStr(body.company_size, 20) as CompanySize,
    message: cleanStr(body.message, 2000) || null
  };

  if (!payload.company_name) {
    return withCors(
      req,
      NextResponse.json({ error: "Nombre de empresa requerido" }, { status: 400 })
    );
  }
  if (!payload.contact_name) {
    return withCors(
      req,
      NextResponse.json({ error: "Nombre de contacto requerido" }, { status: 400 })
    );
  }
  if (!payload.email || !isValidEmail(payload.email)) {
    return withCors(
      req,
      NextResponse.json({ error: "Email corporativo inválido" }, { status: 400 })
    );
  }
  if (!VALID_SIZES.has(payload.company_size)) {
    return withCors(
      req,
      NextResponse.json({ error: "Seleccione el tamaño de su empresa" }, { status: 400 })
    );
  }

  const db = adminClient();
  const { data, error } = await db
    .from("landing_leads")
    .insert({
      source: payload.source,
      plan_interest: payload.plan_interest,
      company_name: payload.company_name,
      contact_name: payload.contact_name,
      email: payload.email,
      phone: payload.phone,
      company_size: payload.company_size,
      message: payload.message,
      metadata: {
        user_agent: req.headers.get("user-agent")?.slice(0, 500) ?? null,
        referer: req.headers.get("referer")?.slice(0, 500) ?? null
      }
    })
    .select("*")
    .single();

  if (error || !data) {
    console.error("[landing/leads] insert:", error);
    return withCors(
      req,
      NextResponse.json({ error: "No se pudo registrar la solicitud" }, { status: 500 })
    );
  }

  const emailResult = await notifyLandingLead(data);

  const devEmailDebug =
    process.env.NODE_ENV !== "production" && emailResult.sent === false
      ? { email_reason: emailResult.reason, email_detail: emailResult.detail }
      : {};

  return withCors(
    req,
    NextResponse.json({
      ok: true,
      id: data.id,
      email_sent: emailResult.sent,
      ...devEmailDebug
    })
  );
}
