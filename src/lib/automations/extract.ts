import { runOriJsonPrompt } from "@/lib/crm-gemini";
import type { GeminiUsage } from "@/lib/billing/meter";
import { renderExtractSchemaAsPromptSpec, type ExtractFieldDef } from "@/lib/automations/extract-schema";
import type { WhatsAppEventMediaType } from "@/lib/automations/node-types";

export interface FieldExtractionResult {
  extracted: Record<string, unknown> | null;
  usage: GeminiUsage;
  /** Modelo real usado por la llamada — para registrar el costo con la tarifa correcta. */
  model: string;
  error?: string;
}

const EMPTY_USAGE: GeminiUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

/**
 * Llamada de IA dedicada y separada de la respuesta conversacional al
 * cliente: toma el contenido ya interpretado del mensaje entrante (la
 * descripción de una imagen, o el texto tal cual) y devuelve un JSON con
 * exactamente los campos que el tenant definió en el disparador del
 * workflow — para mandarlo al webhook, nunca al cliente final.
 *
 * Antes de esto, el único lugar donde un cliente (Qbit/Customext) podía pedir
 * esta forma de salida era metiendo el JSON directamente en el prompt
 * conversacional del agente — con el riesgo real de que ese JSON crudo
 * terminara como respuesta de WhatsApp al cliente final en vez de quedarse
 * en el webhook.
 */
export async function runFieldExtraction(
  fields: ExtractFieldDef[],
  rawContent: string,
  mediaType: WhatsAppEventMediaType
): Promise<FieldExtractionResult> {
  const spec = renderExtractSchemaAsPromptSpec(fields);
  if (!spec || !rawContent.trim()) {
    return { extracted: null, usage: EMPTY_USAGE, model: "" };
  }

  const sourceLabel =
    mediaType === "image" ? "la descripción de una imagen recibida por WhatsApp" : "un mensaje de texto recibido por WhatsApp";

  const system = `Eres un extractor de datos estructurados. Se te entrega ${sourceLabel} y debes devolver ÚNICAMENTE un JSON con esta forma exacta (los comentarios "//" explican qué va en cada campo — no los incluyas en tu respuesta, son solo instrucciones para ti):

${spec}

Reglas:
- No inventes datos: si algo no está presente o no se puede determinar con certeza, usa null (o el valor vacío que corresponda al tipo — nunca un dato inventado).
- Responde solo el JSON, sin texto adicional, sin markdown, sin explicaciones.`;

  const userPrompt =
    mediaType === "image" ? `Descripción de la imagen recibida:\n\n${rawContent}` : `Mensaje recibido:\n\n${rawContent}`;

  try {
    const { result, usage, model } = await runOriJsonPrompt<Record<string, unknown>>(system, userPrompt);
    return { extracted: result, usage, model };
  } catch (err) {
    return {
      extracted: null,
      usage: EMPTY_USAGE,
      model: "",
      error: err instanceof Error ? err.message : "Error desconocido al extraer datos"
    };
  }
}
