/**
 * Mapeo de un siniestro de Softseguros hacia nuestras columnas de `siniestros`.
 *
 * HONESTIDAD IMPORTANTE: la cuenta de prueba usada para verificar esta integración (2026-09-09)
 * tiene 0 siniestros reales — no se pudo confirmar en vivo el nombre exacto del campo de estado en
 * una respuesta real de GET /api/siniestro/list_paginado/. La documentación pública confirma los
 * campos que acepta POST /api/siniestro/ (creación) y un ejemplo de respuesta, pero no una fila con
 * datos completos ya en la base. Por eso este mapeador prueba varias formas plausibles del campo de
 * estado y devuelve `ok:false` en vez de adivinar cuando no puede determinarlo con certeza — mismo
 * criterio que ya se usó con branch/plan_code de La Equidad y con ramo_id de pólizas.
 *
 * Campos confirmados por documentación (POST y ejemplo de respuesta):
 * id, poliza (id de la póliza en Softseguros), poliza_numero_poliza, numero_siniestro,
 * numero_siniestro_compania, nombre (tipo de siniestro, ej. "CHOQUE"), fecha_creacion, fecha_aviso,
 * descripcion, valor_indemnizacion. El campo de estado (amparo_afectado en el POST) es el id de una
 * fila del catálogo GET /api/amparosiniestro/ (Solicitado/En proceso/Pagado/Objetado) — se resuelve
 * pasándole ese catálogo ya cargado a este mapeador.
 */

export type SiniestroEstadoMapeado =
  | "reportado"
  | "documentos_pendientes"
  | "en_forma"
  | "radicado"
  | "pagado"
  | "rechazado"
  | "cerrado";

export interface MappedSoftsegurosSiniestro {
  softsegurosId: string;
  polizaSoftsegurosId: string;
  numeroSiniestro: string | null;
  descripcion: string | null;
  fechaOcurrencia: string | null;
  fechaAviso: string;
  estado: SiniestroEstadoMapeado;
}

export type MapSiniestroResult =
  | { ok: true; siniestro: MappedSoftsegurosSiniestro }
  | { ok: false; motivo: string };

function str(raw: Record<string, unknown>, key: string): string | null {
  const v = raw[key];
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s || null;
}

function toISODateLoose(raw: string | null): string | null {
  if (!raw) return null;
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

/** Nombre del catálogo amparosiniestro (Solicitado/En proceso/Pagado/Objetado) → nuestro enum. */
function mapEstadoPorNombre(nombreAmparo: string | null): SiniestroEstadoMapeado {
  const s = (nombreAmparo ?? "").toLowerCase();
  if (s.includes("pagad")) return "pagado";
  if (s.includes("objetad") || s.includes("rechazad")) return "rechazado";
  if (s.includes("proceso") || s.includes("radicad")) return "radicado";
  // "Solicitado" y cualquier otro valor no reconocido → reportado (el hito inicial).
  return "reportado";
}

/**
 * @param amparoCatalogo Catálogo de GET /api/amparosiniestro/ (id → nombre), para resolver el id
 * de estado que traiga el siniestro. Si el siniestro no trae ningún campo de estado reconocible
 * (ninguno de los nombres candidatos abajo), se reporta ok:false en vez de asumir "reportado" en
 * silencio.
 */
export function mapSoftsegurosSiniestro(
  raw: Record<string, unknown>,
  amparoCatalogo: { id: number; nombre: string }[]
): MapSiniestroResult {
  const softsegurosId = str(raw, "id");
  if (!softsegurosId) return { ok: false, motivo: "Sin id de Softseguros" };

  const polizaSoftsegurosId = str(raw, "poliza");
  if (!polizaSoftsegurosId) return { ok: false, motivo: "Sin póliza asociada (campo poliza)" };

  // El campo de estado no está confirmado en una respuesta real — se prueban los nombres más
  // plausibles según la documentación (amparo_afectado es el nombre del campo en el POST).
  const estadoIdRaw = raw.amparo_afectado ?? raw.estado_siniestro ?? raw.estado;
  let estado: SiniestroEstadoMapeado | null = null;
  if (estadoIdRaw !== undefined && estadoIdRaw !== null) {
    const estadoId = Number(estadoIdRaw);
    const match = amparoCatalogo.find(a => a.id === estadoId);
    if (match) estado = mapEstadoPorNombre(match.nombre);
    else if (typeof estadoIdRaw === "string") estado = mapEstadoPorNombre(estadoIdRaw);
  }
  if (!estado) {
    return {
      ok: false,
      motivo: "No se pudo determinar el estado del siniestro (campo de estado no reconocido) — verificar contra una respuesta real."
    };
  }

  const nombreTipo = str(raw, "nombre");
  const descripcionBase = str(raw, "descripcion");
  const descripcion = [nombreTipo, descripcionBase].filter(Boolean).join(" — ") || null;

  const fechaAviso = toISODateLoose(str(raw, "fecha_aviso")) ?? toISODateLoose(str(raw, "fecha_creacion"));
  if (!fechaAviso) return { ok: false, motivo: "Sin fecha de aviso ni de creación" };

  return {
    ok: true,
    siniestro: {
      softsegurosId,
      polizaSoftsegurosId,
      numeroSiniestro: str(raw, "numero_siniestro") ?? str(raw, "numero_siniestro_compania"),
      descripcion,
      // fecha_creacion no es necesariamente la fecha de ocurrencia del siniestro — mejor esfuerzo,
      // documentado como tal (Softseguros no expone un campo explícito "fecha de ocurrencia").
      fechaOcurrencia: toISODateLoose(str(raw, "fecha_creacion")),
      fechaAviso,
      estado
    }
  };
}
