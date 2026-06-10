/** Postgres / PostgREST cuando la tabla aún no existe o no está en el schema cache. */
export function isMissingTableError(
  error: { code?: string; message?: string } | null | undefined
): boolean {
  if (!error) return false;
  if (error.code === "42P01") return true;
  const msg = String(error.message ?? "").toLowerCase();
  return (
    msg.includes("schema cache") ||
    msg.includes("could not find the table") ||
    (msg.includes("relation") && msg.includes("does not exist"))
  );
}

/** Columna inexistente (migración pendiente). Postgres 42703 / PostgREST PGRST204. */
export function isMissingColumnError(
  error: { code?: string; message?: string } | null | undefined
): boolean {
  if (!error) return false;
  if (error.code === "42703" || error.code === "PGRST204") return true;
  const msg = String(error.message ?? "").toLowerCase();
  return msg.includes("does not exist") && msg.includes("column");
}
