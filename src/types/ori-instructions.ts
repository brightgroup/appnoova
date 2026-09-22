/** Configuración de Ori que edita cada organización — ver src/lib/ori/ori-prompt-settings.ts para la capa de base de datos. */

export const ORI_ORG_INSTRUCCIONES_MAX = 1500;

export type OriTono = "default" | "tu" | "usted";
export type OriExtension = "default" | "breve" | "detallada";

export interface OriOrgInstructions {
  /** Texto libre del cliente — se anexa tal cual, con su encabezado. */
  instrucciones: string;
  tono: OriTono;
  extension: OriExtension;
  /** Cuántas filas pide Ori por consulta de inventario antes de mandar al listado completo. */
  filasPorConsulta: number;
}

export const DEFAULT_ORI_ORG_INSTRUCTIONS: OriOrgInstructions = {
  instrucciones: "",
  tono: "default",
  extension: "default",
  filasPorConsulta: 15
};

const TONOS = new Set<OriTono>(["default", "tu", "usted"]);
const EXTENSIONES = new Set<OriExtension>(["default", "breve", "detallada"]);

/** Normaliza lo que llegue (body de API o fila vieja) a algo que la BD acepte. */
export function normalizeOriOrgInstructions(raw: Partial<OriOrgInstructions> | Record<string, unknown>): OriOrgInstructions {
  const source = raw as Partial<OriOrgInstructions>;
  const instrucciones =
    typeof source.instrucciones === "string" ? source.instrucciones.trim().slice(0, ORI_ORG_INSTRUCCIONES_MAX) : "";
  const tono = TONOS.has(source.tono as OriTono) ? (source.tono as OriTono) : "default";
  const extension = EXTENSIONES.has(source.extension as OriExtension) ? (source.extension as OriExtension) : "default";
  const filasRaw = Number(source.filasPorConsulta);
  const filasPorConsulta = Number.isFinite(filasRaw) ? Math.min(30, Math.max(5, Math.round(filasRaw))) : 15;
  return { instrucciones, tono, extension, filasPorConsulta };
}

const TONO_LINEA: Record<Exclude<OriTono, "default">, string> = {
  tu: "Trata al usuario de tú.",
  usted: "Trata al usuario de usted."
};

const EXTENSION_LINEA: Record<Exclude<OriExtension, "default">, string> = {
  breve: "Responde lo más breve posible: ve directo al punto, sin preámbulos ni resúmenes de lo que acabas de decir.",
  detallada: "Puedes extenderte y explicar el razonamiento cuando aporte, sin volverte repetitivo."
};

/**
 * Compila la capa del tenant a texto. Devuelve "" si la organización no
 * configuró nada — así el prompt final no carga bloques vacíos.
 *
 * El encabezado es deliberadamente explícito sobre la precedencia: sin esa
 * frase, una instrucción del cliente ("siempre lístame los productos en el
 * texto") podía pelearse con una regla de producto y ganar.
 */
export function compileOriOrgBlock(config: OriOrgInstructions): string {
  const reglas: string[] = [];
  if (config.tono !== "default") reglas.push(TONO_LINEA[config.tono]);
  if (config.extension !== "default") reglas.push(EXTENSION_LINEA[config.extension]);
  if (config.filasPorConsulta !== DEFAULT_ORI_ORG_INSTRUCTIONS.filasPorConsulta) {
    reglas.push(
      `Cuando consultes listados (por ejemplo inventario), pide ${config.filasPorConsulta} resultados por consulta salvo que el usuario pida otra cantidad.`
    );
  }

  const libre = config.instrucciones.trim();
  if (reglas.length === 0 && !libre) return "";

  const partes = [
    "## Instrucciones de esta empresa",
    "Las configuró la empresa para Ori. Síguelas siempre que no contradigan las reglas de la plataforma de más arriba (alcance, no inventar datos, no repetir en el texto las tablas que la plataforma ya renderiza). Si hay contradicción, mandan las reglas de la plataforma."
  ];
  if (reglas.length > 0) partes.push(reglas.map(r => `- ${r}`).join("\n"));
  if (libre) partes.push(libre);

  return partes.join("\n\n");
}
