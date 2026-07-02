import { NextRequest, NextResponse } from "next/server";
import { textAgentsAdminClient } from "@/lib/text-agents-server";
import { getCrmUserId } from "@/lib/crm-auth";
import {
  documentProvenanceEntry,
  extractContactFieldsFromDocument,
  suggestionsToPatch
} from "@/lib/crm-ai-extract";
import { toCrmContact } from "@/lib/crm-record";
import type { CrmFieldProvenance } from "@/types/crm";

type Ctx = { params: Promise<{ id: string }> };

const ALLOWED_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp"
]);

export async function POST(req: NextRequest, ctx: Ctx) {
  const userId = await getCrmUserId(req, "edit");
  if (userId instanceof NextResponse) return userId;

  const { id } = await ctx.params;
  const form = await req.formData();
  const file = form.get("file");
  const applyFieldsRaw = form.get("apply_fields");
  const applyFields = applyFieldsRaw ? String(applyFieldsRaw).split(",").map(s => s.trim()).filter(Boolean) : [];

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file es requerido" }, { status: 400 });
  }

  const mimeType = file.type || "application/pdf";
  if (!ALLOWED_TYPES.has(mimeType)) {
    return NextResponse.json({ error: "Tipo de archivo no soportado (PDF o imagen)" }, { status: 400 });
  }

  if (file.size > 8 * 1024 * 1024) {
    return NextResponse.json({ error: "Archivo demasiado grande (máx 8 MB)" }, { status: 400 });
  }

  const db = textAgentsAdminClient();
  const { data: existing } = await db
    .from("crm_contacts")
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();

  if (!existing) return NextResponse.json({ error: "Contacto no encontrado" }, { status: 404 });

  const contact = toCrmContact(existing);
  const buffer = Buffer.from(await file.arrayBuffer());
  const base64 = buffer.toString("base64");

  try {
    const { suggestions } = await extractContactFieldsFromDocument(base64, mimeType, contact);

    if (!applyFields.length) {
      return NextResponse.json({ suggestions, filename: file.name });
    }

    const { patch, provenanceFields } = suggestionsToPatch(suggestions, applyFields, documentProvenanceEntry);
    const prevProv = (existing.field_provenance as CrmFieldProvenance) ?? {};
    const field_provenance = { ...prevProv, ...provenanceFields };
    const meta = (existing.metadata as Record<string, unknown>) ?? {};

    const { data, error } = await db
      .from("crm_contacts")
      .update({
        ...patch,
        field_provenance,
        metadata: {
          ...meta,
          last_document_scan: {
            filename: file.name,
            at: new Date().toISOString(),
            fields_applied: applyFields
          }
        },
        updated_at: new Date().toISOString()
      })
      .eq("id", id)
      .eq("user_id", userId)
      .select("*")
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({
      contact: data ? toCrmContact(data) : null,
      suggestions,
      applied: applyFields
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al leer documento";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
