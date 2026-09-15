import type { AgentToolContext, AgentToolRulesContext } from "@/lib/agent-tools/registry";
import { DEFAULT_CAMPOS_POR_RAMO, type RamoCampoDef } from "@/lib/insurers/ramo-campos-defaults";
import type { RamoCotizable } from "@/lib/insurers/ramos-cotizables";
import { sendWhatsAppInteractiveMessage } from "@/lib/whatsapp/send-transport";

/**
 * Determinismo de "¿cómo pregunto este dato?" — reemplaza la prosa que hoy le
 * pide al modelo que decida cada turno si usa `presentar_opciones_whatsapp`
 * (causa raíz de los dos bugs del handoff: botones que no salían con GPT, y
 * pregunta duplicada con Gemini). El CÓDIGO decide y, si aplica, manda los
 * botones/lista él mismo — el modelo solo se entera por `pregunta_enviada` en
 * el resultado de la tool (ver *-quote-agent-tool.ts).
 *
 * Mismos límites reales de WhatsApp que ya usa whatsapp-options-tool.ts: máx.
 * 3 botones (título ≤20 chars) o una lista de hasta 10 filas (título ≤24).
 */

export interface GuidedQuestionResult {
  pregunta_enviada: boolean;
  siguiente_pregunta: string;
}

function resolvePresentacion(campo: RamoCampoDef): "botones" | "lista" | "texto" {
  // WhatsApp no tiene botones/lista de selección múltiple — "elige todas las
  // que apliquen" siempre va en texto, con las opciones dichas en la pregunta
  // misma (ver buildCamposPromptBlock).
  if (campo.fieldType === "multiselect") return "texto";
  if (campo.presentacion !== "auto") return campo.presentacion;
  const n = campo.options.length;
  if (n >= 2 && n <= 3) return "botones";
  if (n >= 4 && n <= 10) return "lista";
  return "texto";
}

/**
 * Presenta UN campo al cliente — como botones/lista (efecto secundario:
 * manda el mensaje interactivo) si aplica y hay canal de WhatsApp, o deja que
 * el modelo la escriba en texto normal. Se llama una sola vez por campo, justo
 * antes de devolver el resultado de la tool de cotización correspondiente.
 */
export async function presentGuidedQuestion(ctx: AgentToolContext, campo: RamoCampoDef): Promise<GuidedQuestionResult> {
  const presentacion = resolvePresentacion(campo);
  const base = campo.pregunta || campo.label;
  // multiselect siempre es texto (ver resolvePresentacion) — sin botones/lista,
  // el cliente necesita ver las opciones en la propia pregunta.
  const siguiente_pregunta =
    campo.fieldType === "multiselect" && campo.options.length > 0 ? `${base} (elige todas las que apliquen: ${campo.options.join(", ")})` : base;

  if (presentacion === "texto" || !ctx.outboundWhatsAppChannel || !ctx.contactE164) {
    return { pregunta_enviada: false, siguiente_pregunta };
  }

  try {
    if (presentacion === "botones") {
      await sendWhatsAppInteractiveMessage({
        channel: ctx.outboundWhatsAppChannel,
        toE164: ctx.contactE164,
        body: siguiente_pregunta,
        buttons: campo.options.map((title, i) => ({ id: `campo_${i}`, title: title.slice(0, 20) })),
        db: ctx.db
      });
    } else {
      await sendWhatsAppInteractiveMessage({
        channel: ctx.outboundWhatsAppChannel,
        toE164: ctx.contactE164,
        body: siguiente_pregunta,
        listSections: [{ rows: campo.options.slice(0, 10).map((title, i) => ({ id: `campo_${i}`, title: title.slice(0, 24) })) }],
        db: ctx.db
      });
    }
    return { pregunta_enviada: true, siguiente_pregunta };
  } catch (err) {
    // Igual que whatsapp-options-tool.ts: si el envío falla, no lo escondemos
    // — el modelo se entera por pregunta_enviada:false y la hace en texto, en
    // vez de quedarse mudo esperando una respuesta que nunca llegó.
    console.error("[guided-questions] envío de botones/lista falló:", err);
    return { pregunta_enviada: false, siguiente_pregunta };
  }
}

/** `ctx.ramoCampos[ramo]` con fallback a los defaults — por si no se precargó (ej. quotingRules deshabilitado) o quedó vacío. */
export function resolveCampos(ctx: AgentToolRulesContext, ramo: RamoCotizable): RamoCampoDef[] {
  const cargados = ctx.ramoCampos[ramo];
  return cargados && cargados.length > 0 ? cargados : DEFAULT_CAMPOS_POR_RAMO[ramo] ?? [];
}

/**
 * Instrucción genérica de "pregunta estos datos de a uno" para el
 * `buildPromptBlock()` de un ramo, generada desde la config en vez de
 * hardcodeada — reemplaza el guion de preguntas + "usa presentar_opciones_whatsapp
 * con esas opciones EXACTAS" que hoy vive en prosa (causa raíz de la pregunta
 * duplicada: el código ya manda los botones, el modelo no necesita decidirlo).
 */
export function buildCamposPromptBlock(campos: RamoCampoDef[]): string {
  const requeridos = campos.filter(c => c.requeridoCotizacion !== false);
  const opcionales = campos.filter(c => c.requeridoCotizacion === false);

  const describe = (c: RamoCampoDef) => {
    // multiselect nunca sale en botones/lista (WhatsApp no soporta selección
    // múltiple) — hay que decir las opciones en la propia pregunta para que el
    // cliente sepa qué puede elegir.
    const base = c.fieldType === "multiselect" && c.options.length > 0 ? `${c.pregunta} (elige todas las que apliquen: ${c.options.join(", ")})` : c.pregunta;
    return c.ayuda ? `${base} (si el cliente pregunta qué significa: ${c.ayuda})` : base;
  };

  const opcionalTxt = opcionales.length
    ? ` Al final, de forma opcional (esta parte sí se puede omitir si el cliente ya quiere cerrar): ${opcionales.map(describe).join("; ")}.`
    : "";

  return (
    `Pregunta estos datos de a uno, en este orden: ${requeridos.map(describe).join("; ")}. ` +
    "Para cada uno, llama primero la herramienta con los datos que ya tengas. Si el resultado trae `pregunta_enviada: true`, esa " +
    "pregunta YA se le envió al cliente (con botones o lista) — no la repitas en tu texto, solo espera la respuesta del cliente. " +
    "Si trae `pregunta_enviada: false`, escríbela tú mismo en texto normal usando el valor de `siguiente_pregunta`. Nunca inventes " +
    `ni asumas un dato que el cliente no te haya dado.${opcionalTxt}`
  );
}
