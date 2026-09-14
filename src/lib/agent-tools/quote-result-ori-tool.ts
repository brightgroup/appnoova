import { Type } from "@google/genai";
import type { OriToolDefinition, OriToolContext, OriToolResult } from "@/lib/agent-tools/ori-tools";
import { getQuoteRequestById, type QuoteResultPeriodicidad } from "@/lib/insurers/quote-requests-db";

const PERIODICIDADES: QuoteResultPeriodicidad[] = ["mensual", "anual", "mensual_y_anual", "pago_unico"];

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string" && v.trim().length > 0).map(v => v.trim());
}

/**
 * ORI ayuda al asesor a ESTRUCTURAR (no a guardar) el resultado de una
 * cotización que ya cotizó por fuera con una aseguradora real — ej. el
 * asesor le dicta "cotizamos con Sura, $450.000 mensual, incluye asistencia
 * vial y todo riesgo" y esta tool devuelve esos datos ya normalizados para
 * previsualizar en la ficha (ver plan "Módulo Cotizaciones en CRM"). A
 * propósito NO escribe en la base — el asesor revisa/ajusta la
 * previsualización y confirma con el botón "Guardar" de la ficha (mismo
 * endpoint que el formulario a mano, registrar-manual), para que nunca quede
 * un precio real en firme sin que un humano lo haya visto primero.
 */
export const estructurarResultadoCotizacionOriTool: OriToolDefinition = {
  name: "estructurar_resultado_cotizacion",
  declaration: {
    name: "estructurar_resultado_cotizacion",
    description:
      "Estructura (sin guardar) el resultado de una cotización ya obtenida por fuera con una aseguradora real, a partir de lo que el asesor te dicte en la conversación. Devuelve una previsualización — el asesor la confirma manualmente en la ficha, esta tool nunca guarda el precio en firme.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        quote_request_id: { type: Type.STRING, description: "Id de la cotización — viene en el contexto de esta conversación." },
        aseguradora: { type: Type.STRING, description: "Nombre de la aseguradora con la que se cotizó (ej. Sura, Allianz, Bolívar)." },
        nombre_plan: { type: Type.STRING, description: "Nombre del plan o producto, si lo mencionaron (opcional)." },
        descripcion: { type: Type.STRING, description: "Nota breve sobre el plan para el cliente, si aplica (opcional)." },
        periodicidad: {
          type: Type.STRING,
          description: "Cómo se paga: 'mensual', 'anual', 'mensual_y_anual' (si dieron ambos precios) o 'pago_unico'."
        },
        precio_mensual: { type: Type.NUMBER, description: "Precio mensual en pesos colombianos, si aplica." },
        precio_anual: { type: Type.NUMBER, description: "Precio anual en pesos colombianos, si aplica." },
        incluye: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: "Características cortas del plan (ej. 'Asistencia vial 24/7', 'Cobertura todo riesgo')."
        },
        beneficios: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: "Beneficios adicionales mencionados, uno por línea."
        }
      },
      required: ["quote_request_id", "aseguradora", "periodicidad"]
    }
  },
  promptBlock:
    "Tienes una herramienta (estructurar_resultado_cotizacion) para organizar el resultado que el asesor te dicte de una cotización ya obtenida por fuera — aseguradora, precio(s), qué incluye, beneficios. Pregunta lo que falte de forma natural (no todo de una vez), y llama la herramienta con lo que ya tengas confirmado. Nunca inventes un dato que el asesor no te haya dado. Esta herramienta NO guarda nada en firme — solo arma la previsualización; dile al asesor que la revise y la confirme en la ficha.",
  async execute(args: Record<string, unknown>, ctx: OriToolContext): Promise<OriToolResult> {
    const quoteRequestId = typeof args.quote_request_id === "string" ? args.quote_request_id.trim() : "";
    if (!quoteRequestId) return { ok: false, reason: "Falta el quote_request_id." };

    const record = await getQuoteRequestById(ctx.db, ctx.organizationId, quoteRequestId);
    if (!record) return { ok: false, reason: "No encontré esa cotización en esta organización." };

    const aseguradora = typeof args.aseguradora === "string" ? args.aseguradora.trim() : "";
    if (!aseguradora) return { ok: false, reason: "Falta la aseguradora." };

    const periodicidad = PERIODICIDADES.includes(args.periodicidad as QuoteResultPeriodicidad)
      ? (args.periodicidad as QuoteResultPeriodicidad)
      : null;
    if (!periodicidad) {
      return { ok: false, reason: "La periodicidad debe ser mensual, anual, mensual_y_anual o pago_unico." };
    }

    const precioMensual = typeof args.precio_mensual === "number" && args.precio_mensual > 0 ? args.precio_mensual : null;
    const precioAnual = typeof args.precio_anual === "number" && args.precio_anual > 0 ? args.precio_anual : null;
    if (!precioMensual && !precioAnual) {
      return { ok: false, reason: "Falta el precio mensual o anual." };
    }

    return {
      ok: true,
      preview: {
        quote_request_id: quoteRequestId,
        ramo: record.ramo,
        aseguradora,
        nombre_plan: typeof args.nombre_plan === "string" ? args.nombre_plan.trim() || undefined : undefined,
        descripcion: typeof args.descripcion === "string" ? args.descripcion.trim() || undefined : undefined,
        periodicidad,
        precio_mensual: precioMensual,
        precio_anual: precioAnual,
        incluye: stringList(args.incluye),
        beneficios: stringList(args.beneficios)
      }
    };
  }
};
