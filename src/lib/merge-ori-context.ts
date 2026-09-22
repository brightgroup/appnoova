import { mergeCompanyContext } from "@/lib/merge-company-context";
import { ORI_SYSTEM_PROMPT } from "@/lib/ori-prompt";

/**
 * Ensambla system instruction de ORI: plataforma → empresa → persona.
 *
 * `basePrompt` es la plantilla editable por el superadmin
 * (platform_settings.ori_prompt, ver src/lib/ori/ori-prompt-settings.ts); si no
 * se pasa, se usa la constante del código. `orgBlock` son las instrucciones que
 * configuró el propio cliente: van DESPUÉS de la base, nunca en su lugar.
 */
export function buildOriSystemInstruction(
  companyContext?: string | null,
  platformHelp?: string | null,
  temporalBlock?: string | null,
  basePrompt?: string | null,
  orgBlock?: string | null
): string {
  const parts: string[] = [];
  const base = basePrompt?.trim() || ORI_SYSTEM_PROMPT;

  const platform = platformHelp?.trim();
  if (platform) {
    parts.push(platform);
  }

  const withCompany = mergeCompanyContext(
    parts.length ? parts.join("\n\n---\n\n") : base,
    companyContext
  );

  const assembled = platform ? `${withCompany}\n\n---\n\n${base}` : withCompany;

  const org = orgBlock?.trim();
  const withOrg = org ? `${assembled}\n\n---\n\n${org}` : assembled;

  const temporal = temporalBlock?.trim();
  return temporal ? `${temporal}\n\n---\n\n${withOrg}` : withOrg;
}
