import type { SupabaseClient } from "@supabase/supabase-js";
import { ORI_SYSTEM_PROMPT } from "@/lib/ori-prompt";
import {
  DEFAULT_ORI_ORG_INSTRUCTIONS,
  normalizeOriOrgInstructions,
  type OriOrgInstructions
} from "@/types/ori-instructions";

/**
 * Prompt de Ori en dos capas (ver migración 154_ori_prompt_layers.sql):
 *
 *  1. **Base de plataforma** — `platform_settings.ori_prompt`, editable por el
 *     superadmin desde /admin/ori. Es la plantilla estándar que reciben TODOS
 *     los clientes; si nunca se tocó, se usa `ORI_SYSTEM_PROMPT` del código.
 *  2. **Capa del tenant** — `ori_org_instructions`, editable por el propio
 *     cliente. Se **anexa** a la base, nunca la reemplaza: así un arreglo de
 *     plataforma sigue llegando a todo el mundo aunque cada organización tenga
 *     sus reglas de negocio.
 *
 * Lo que NO vive acá y no debe volverse editable: los `promptBlock` de las
 * tools (src/lib/agent-tools/*). Esos son el contrato con la herramienta —
 * si un cliente los edita, rompe el grounding del inventario.
 */

const ORI_PROMPT_KEY = "ori_prompt";

/* ------------------------------------------------------------------ */
/* Capa 1 — base de plataforma                                        */
/* ------------------------------------------------------------------ */

export async function getOriBasePrompt(db: SupabaseClient): Promise<string> {
  const { data, error } = await db
    .from("platform_settings")
    .select("value")
    .eq("key", ORI_PROMPT_KEY)
    .maybeSingle();
  if (error || !data?.value) return ORI_SYSTEM_PROMPT;
  const prompt = (data.value as { prompt?: unknown }).prompt;
  return typeof prompt === "string" && prompt.trim() ? prompt : ORI_SYSTEM_PROMPT;
}

export async function saveOriBasePrompt(
  db: SupabaseClient,
  prompt: string,
  updatedBy?: string | null
): Promise<void> {
  const { error } = await db.from("platform_settings").upsert({
    key: ORI_PROMPT_KEY,
    value: { prompt },
    updated_at: new Date().toISOString(),
    updated_by: updatedBy ?? null
  });
  if (error) throw new Error(error.message);
}

/** El default de fábrica, para que /admin/ori pueda ofrecer "restaurar". */
export function oriFactoryPrompt(): string {
  return ORI_SYSTEM_PROMPT;
}

/* ------------------------------------------------------------------ */
/* Capa 2 — instrucciones de la organización                          */
/* ------------------------------------------------------------------ */

export async function getOriOrgInstructions(
  db: SupabaseClient,
  organizationId: string
): Promise<OriOrgInstructions> {
  const { data, error } = await db
    .from("ori_org_instructions")
    .select("instrucciones, tono, extension, filas_por_consulta")
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error || !data) return DEFAULT_ORI_ORG_INSTRUCTIONS;

  return normalizeOriOrgInstructions({
    instrucciones: data.instrucciones,
    tono: data.tono,
    extension: data.extension,
    filasPorConsulta: data.filas_por_consulta
  });
}

export async function saveOriOrgInstructions(
  db: SupabaseClient,
  organizationId: string,
  next: OriOrgInstructions,
  updatedBy?: string | null
): Promise<OriOrgInstructions> {
  const clean = normalizeOriOrgInstructions(next);
  const { error } = await db.from("ori_org_instructions").upsert(
    {
      organization_id: organizationId,
      instrucciones: clean.instrucciones,
      tono: clean.tono,
      extension: clean.extension,
      filas_por_consulta: clean.filasPorConsulta,
      updated_at: new Date().toISOString(),
      updated_by: updatedBy ?? null
    },
    { onConflict: "organization_id" }
  );
  if (error) throw new Error(error.message);
  return clean;
}

export * from "@/types/ori-instructions";
