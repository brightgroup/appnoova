/**
 * Mapeo de una póliza de Softseguros hacia nuestras columnas de `polizas`.
 *
 * HONESTIDAD IMPORTANTE (mismo criterio que branch/plan_code de La Equidad):
 * los nombres de campo de abajo salen de la página pública de documentación
 * (app.softseguros.com/docs/auth, consultada 2026-09-08) y su ejemplo de
 * respuesta de GET /api/poliza/ — nunca se probaron contra una cuenta real
 * con datos reales. Antes de confiar en este mapeo en producción, correr
 * /api/seguros/softseguros/preview-polizas con una cuenta real y comparar.
 *
 * Ejemplo documentado (transcrito, no inventado):
 * { "numero_poliza": "...", "fecha_inicio": null, "fecha_fin": null,
 *   "estado_poliza_nombre": "Vigente", "cliente_numero_documento": "...",
 *   "cliente_nombres": "...", "cliente_apellidos": "...",
 *   "ramo_aseguradora_nombre": "...", "ramo_nombre": "...", "prima": 0 }
 *
 * Nota: la documentación no expone un campo de teléfono del cliente en el
 * objeto de póliza — el sync deja `telefono: null` y el corredor lo completa
 * a mano en la ficha del contacto si lo necesita para renovaciones.
 */

export interface MappedSoftsegurosPoliza {
  softsegurosId: string;
  numeroPoliza: string;
  aseguradora: string;
  ramo: string;
  vigenciaDesde: string | null;
  vigenciaHasta: string | null;
  prima: number | null;
  estado: "activa" | "vencida" | "cancelada" | "renovada";
  cliente: {
    nombre: string;
    documento: string | null;
  };
}

export type MapPolizaResult = { ok: true; poliza: MappedSoftsegurosPoliza } | { ok: false; motivo: string };

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

function mapEstado(rawEstado: string | null): MappedSoftsegurosPoliza["estado"] {
  const s = (rawEstado ?? "").toLowerCase();
  if (s.includes("cancel")) return "cancelada";
  if (s.includes("venc")) return "vencida";
  if (s.includes("renova")) return "renovada";
  // "Vigente", "Devengada" y cualquier otro valor no reconocido se tratan
  // como activa — el valor crudo queda en metadata.softseguros_estado_original
  // para que el corredor lo revise si algo no cuadra.
  return "activa";
}

export function mapSoftsegurosPoliza(raw: Record<string, unknown>): MapPolizaResult {
  const softsegurosId = str(raw, "id");
  if (!softsegurosId) return { ok: false, motivo: "Sin id de Softseguros" };

  const aseguradora = str(raw, "ramo_aseguradora_nombre");
  if (!aseguradora) return { ok: false, motivo: "Sin aseguradora (ramo_aseguradora_nombre)" };

  const ramo = str(raw, "ramo_nombre") ?? str(raw, "ramo_global_nombre");
  if (!ramo) return { ok: false, motivo: "Sin ramo (ramo_nombre)" };

  const nombres = str(raw, "cliente_nombres") ?? "";
  const apellidos = str(raw, "cliente_apellidos") ?? "";
  const nombreCliente = `${nombres} ${apellidos}`.trim();
  if (!nombreCliente) return { ok: false, motivo: "Sin nombre de cliente (cliente_nombres/cliente_apellidos)" };

  const vigenciaHasta = toISODateLoose(str(raw, "fecha_fin"));
  const vigenciaDesde = toISODateLoose(str(raw, "fecha_inicio"));

  const primaRaw = raw.prima;
  const prima = typeof primaRaw === "number" ? primaRaw : primaRaw ? Number(primaRaw) : null;

  const numeroPolizaRaw = str(raw, "numero_poliza");
  const numeroPoliza = numeroPolizaRaw || `SS-${softsegurosId}`;

  return {
    ok: true,
    poliza: {
      softsegurosId,
      numeroPoliza,
      aseguradora,
      ramo,
      vigenciaDesde,
      vigenciaHasta,
      prima: prima !== null && Number.isFinite(prima) ? prima : null,
      estado: mapEstado(str(raw, "estado_poliza_nombre")),
      cliente: {
        nombre: nombreCliente,
        documento: str(raw, "cliente_numero_documento")
      }
    }
  };
}
