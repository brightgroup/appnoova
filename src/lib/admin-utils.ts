export function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "org";
}

export async function uniqueOrgSlug(
  db: ReturnType<typeof import("@/lib/voice-agents-server").adminClient>,
  base: string,
  excludeId?: string
): Promise<string> {
  let slug = slugify(base);
  let attempt = 0;
  while (attempt < 20) {
    const candidate = attempt === 0 ? slug : `${slug}-${attempt}`;
    let query = db.from("organizations").select("id").eq("slug", candidate);
    if (excludeId) query = query.neq("id", excludeId);
    const { data } = await query.maybeSingle();
    if (!data) return candidate;
    attempt++;
  }
  return `${slug}-${Date.now()}`;
}
