import type { SupabaseClient } from "@supabase/supabase-js";
import { getLatestQuoteRequestForLead, type QuoteRequestRecord } from "@/lib/insurers/quote-requests-db";
import { getInsurerCredentials } from "@/lib/insurers/insurer-connections-db";

/**
 * Un solo lugar que decide "cuál es el siguiente paso" de una cotización de
 * seguro ligada a un lead — lo usan tanto el panel guiado en la ficha del
 * lead (SeguroQuotePanel.tsx) como la tool de ORI (guiar_cotizacion_seguro),
 * para que ORI y la UI nunca queden desincronizados sobre qué sigue.
 */
export type QuoteGuidanceStep =
  | "sin_cotizacion"
  | "cotizar_automatico"
  | "registrar_manual"
  | "generar_pdf"
  | "cerrada";

export interface QuoteGuidance {
  step: QuoteGuidanceStep;
  message: string;
  quote: QuoteRequestRecord | null;
}

const RAMO_LABEL: Record<string, string> = { autos: "auto", vida: "vida", hogar: "hogar" };

export async function getQuoteGuidanceForLead(
  db: SupabaseClient,
  organizationId: string,
  leadId: string
): Promise<QuoteGuidance> {
  const quote = await getLatestQuoteRequestForLead(db, organizationId, leadId);

  if (!quote) {
    return {
      step: "sin_cotizacion",
      message: "Este lead todavía no tiene ninguna cotización de seguro iniciada. Empieza la conversación con el cliente para que la IA reúna los datos, o regístrala manualmente.",
      quote: null
    };
  }

  if (quote.estado === "cerrada" || quote.estado === "descartada") {
    return {
      step: "cerrada",
      message: "Esta cotización quedó cerrada o descartada — no hay ninguna acción pendiente.",
      quote
    };
  }

  if (quote.estado === "cotizada" || quote.estado === "enviada_externa") {
    return {
      step: "generar_pdf",
      message: `Ya tienes el precio real (${quote.resultado?.aseguradora ?? "aseguradora"}, ${
        quote.resultado?.prima ? `$${quote.resultado.prima.toLocaleString("es-CO")} COP` : "sin prima registrada"
      }). Genera el PDF de la cotización y envíaselo al cliente.`,
      quote
    };
  }

  // estado === "pendiente"
  if (quote.ramo === "autos") {
    const laEquidad = await getInsurerCredentials(db, organizationId, "la_equidad");
    if (laEquidad) {
      return {
        step: "cotizar_automatico",
        message: "Ya tienes los datos completos del vehículo y del tomador — pide el precio real a La Equidad con un clic.",
        quote
      };
    }
  }

  return {
    step: "registrar_manual",
    message: `Los datos de ${RAMO_LABEL[quote.ramo] ?? quote.ramo} ya están completos, pero no hay ninguna aseguradora conectada para cotizar automático — cotiza por fuera y registra el precio real acá.`,
    quote
  };
}
