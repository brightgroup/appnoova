import { mergeCompanyContext } from "@/lib/merge-company-context";
import { ORI_SYSTEM_PROMPT } from "@/lib/ori-prompt";

/** Ensambla system instruction de ORI: plataforma → empresa → persona. */
export function buildOriSystemInstruction(
  companyContext?: string | null,
  platformHelp?: string | null,
  temporalBlock?: string | null
): string {
  const parts: string[] = [];

  const platform = platformHelp?.trim();
  if (platform) {
    parts.push(platform);
  }

  const withCompany = mergeCompanyContext(
    parts.length ? parts.join("\n\n---\n\n") : ORI_SYSTEM_PROMPT,
    companyContext
  );

  const base = platform ? `${withCompany}\n\n---\n\n${ORI_SYSTEM_PROMPT}` : withCompany;

  const temporal = temporalBlock?.trim();
  return temporal ? `${temporal}\n\n---\n\n${base}` : base;
}
