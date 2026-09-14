/**
 * Mapeo de una póliza de Softseguros hacia nuestras columnas de `polizas`.
 *
 * VERIFICADO EN VIVO el 2026-09-09 contra una cuenta REAL de prueba del usuario
 * (app.softseguros.com/srv1/, usuario admin@noova360.com) — ya no es una suposición sobre la
 * documentación pública. Se trajo el detalle completo de una póliza real (GET /api/poliza/{id}/)
 * y se confirmaron los nombres exactos de campo abajo usados. Sigue siendo prudente re-verificar
 * si Softseguros cambia su esquema, pero esto no es un ejemplo genérico — es una respuesta real.
 *
 * Campos reales confirmados (extracto, ver sesión 2026-09-09 para la respuesta completa):
 * numero_poliza, fecha_inicio, fecha_fin, estado_poliza_nombre, ramo_global_nombre, ramo_nombre,
 * ramo_aseguradora_nombre, tipo_poliza, tipo_moneda, tasa_cambio, prima, comicion,
 * porcentje_comicion (sic — typo real de Softseguros, no nuestro), comision_vendedor,
 * porcentaje_comision_vendedor, soat, nombre_tomador/cedula_tomador, nombre_asegurado/
 * cedula_asegurado, nombre_beneficiario/cedula_beneficiario, cliente_numero_documento,
 * cliente_nombres, cliente_apellidos.
 */

export interface MappedSoftsegurosPoliza {
  softsegurosId: string;
  numeroPoliza: string;
  aseguradora: string;
  ramo: string;
  /** Nombre del ramo global (catálogo estándar de industria) — se resuelve contra ramos_catalogo en el sync, no acá (no tenemos db en un mapper puro). */
  ramoGlobalNombre: string | null;
  vigenciaDesde: string | null;
  vigenciaHasta: string | null;
  prima: number | null;
  estado: "cotizada" | "expedicion" | "activa" | "vencida" | "cancelada" | "no_renovada" | "renovada" | "devengada";
  tipoPoliza: "individual" | "colectiva" | "masiva";
  moneda: string;
  tasaCambio: number;
  esSoat: boolean;
  comisionAgencia: number | null;
  porcentajeComisionAgencia: number | null;
  comisionVendedor: number | null;
  porcentajeComisionVendedor: number | null;
  cliente: {
    nombre: string;
    documento: string | null;
  };
  /** Solo si el asegurado real difiere del tomador (nombre_tomador vs nombre_asegurado) — en la mayoría de ramos son la misma persona. */
  asegurado: { nombre: string; documento: string | null } | null;
}

export type MapPolizaResult = { ok: true; poliza: MappedSoftsegurosPoliza } | { ok: false; motivo: string };

function str(raw: Record<string, unknown>, key: string): string | null {
  const v = raw[key];
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s || null;
}

function num(raw: Record<string, unknown>, key: string): number | null {
  const v = raw[key];
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function toISODateLoose(raw: string | null): string | null {
  if (!raw) return null;
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

function mapEstado(rawEstado: string | null): MappedSoftsegurosPoliza["estado"] {
  const s = (rawEstado ?? "").toLowerCase();
  if (s.includes("cotiz")) return "cotizada";
  if (s.includes("expedic")) return "expedicion";
  if (s.includes("cancel")) return "cancelada";
  if (s.includes("no renovad")) return "no_renovada";
  if (s.includes("renovad")) return "renovada";
  if (s.includes("devengad")) return "devengada";
  if (s.includes("venc")) return "vencida";
  // "Vigente" y cualquier otro valor no reconocido → activa.
  return "activa";
}

function mapTipoPoliza(raw: string | null): MappedSoftsegurosPoliza["tipoPoliza"] {
  const s = (raw ?? "").toLowerCase();
  if (s === "colectiva") return "colectiva";
  if (s === "masiva") return "masiva";
  return "individual";
}

export function mapSoftsegurosPoliza(raw: Record<string, unknown>): MapPolizaResult {
  const softsegurosId = str(raw, "id");
  if (!softsegurosId) return { ok: false, motivo: "Sin id de Softseguros" };

  const aseguradora = str(raw, "ramo_aseguradora_nombre");
  if (!aseguradora) return { ok: false, motivo: "Sin aseguradora (ramo_aseguradora_nombre)" };

  const ramo = str(raw, "ramo_nombre") ?? str(raw, "ramo_global_nombre");
  if (!ramo) return { ok: false, motivo: "Sin ramo (ramo_nombre)" };

  // Tomador: en el listado viene como nombre_tomador/cedula_tomador; si falta (algunas filas del
  // listado no lo traen, solo el detalle), se cae al cliente_* denormalizado.
  const nombreTomador =
    str(raw, "nombre_tomador") ??
    `${str(raw, "cliente_nombres") ?? ""} ${str(raw, "cliente_apellidos") ?? ""}`.trim();
  if (!nombreTomador) return { ok: false, motivo: "Sin nombre de tomador/cliente" };
  const documentoTomador = str(raw, "cedula_tomador") ?? str(raw, "cliente_numero_documento");

  const nombreAsegurado = str(raw, "nombre_asegurado");
  const cedulaAsegurado = str(raw, "cedula_asegurado");
  const aseguradoDifiereDelTomador = Boolean(nombreAsegurado) && nombreAsegurado !== nombreTomador;

  const vigenciaHasta = toISODateLoose(str(raw, "fecha_fin"));
  const vigenciaDesde = toISODateLoose(str(raw, "fecha_inicio"));

  return {
    ok: true,
    poliza: {
      softsegurosId,
      numeroPoliza: str(raw, "numero_poliza") || `SS-${softsegurosId}`,
      aseguradora,
      ramo,
      ramoGlobalNombre: str(raw, "ramo_global_nombre"),
      vigenciaDesde,
      vigenciaHasta,
      prima: num(raw, "prima"),
      estado: mapEstado(str(raw, "estado_poliza_nombre")),
      tipoPoliza: mapTipoPoliza(str(raw, "tipo_poliza")),
      moneda: str(raw, "tipo_moneda") || "COP",
      tasaCambio: num(raw, "tasa_cambio") ?? 1,
      esSoat: raw.soat === true,
      comisionAgencia: num(raw, "comicion"),
      porcentajeComisionAgencia: num(raw, "porcentje_comicion"),
      comisionVendedor: num(raw, "comision_vendedor"),
      porcentajeComisionVendedor: num(raw, "porcentaje_comision_vendedor"),
      cliente: { nombre: nombreTomador, documento: documentoTomador },
      asegurado: aseguradoDifiereDelTomador ? { nombre: nombreAsegurado as string, documento: cedulaAsegurado } : null
    }
  };
}
