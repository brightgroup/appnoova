/**
 * Forma de los "campos a extraer" que un tenant define en el disparador de
 * WhatsApp de un workflow — mismo espíritu que el criterio IA de una etapa
 * del CRM (nombre + instrucción en lenguaje natural), pero aquí además con un
 * tipo por campo y soporte para objetos/listas anidadas (para casos como "un
 * comprobante de pago por cada imagen que llegue, con su monto y su fecha").
 *
 * Esto NUNCA se muestra al cliente final: solo alimenta la extracción
 * estructurada que se manda al webhook (ver `extract.ts`), separada por
 * completo de la respuesta conversacional del agente.
 */
export type ExtractFieldType = "text" | "number" | "boolean" | "date" | "object" | "array_of_objects";

export interface ExtractFieldDef {
  name: string;
  type: ExtractFieldType;
  instruction: string;
  /** Solo aplica si type es "object" o "array_of_objects": los sub-campos que arman su forma. */
  fields?: ExtractFieldDef[];
}

export function createEmptyExtractField(): ExtractFieldDef {
  return { name: "", type: "text", instruction: "" };
}

const TYPE_HINT: Record<ExtractFieldType, string> = {
  text: "string o null si no aplica",
  number: "number o null si no aplica",
  boolean: "true | false",
  date: '"YYYY-MM-DD" o null si no aplica',
  object: "objeto",
  array_of_objects: "array de objetos"
};

function isComposite(type: ExtractFieldType): boolean {
  return type === "object" || type === "array_of_objects";
}

function renderField(field: ExtractFieldDef, indent: string): string {
  const name = field.name.trim() || "campo_sin_nombre";
  const comment = field.instruction.trim() ? `  // ${field.instruction.trim()}` : "";
  const children = (field.fields ?? []).filter(f => f.name.trim());
  const innerIndent = `${indent}  `;

  if (field.type === "object") {
    const inner = children.length
      ? children.map(f => renderField(f, innerIndent)).join(",\n")
      : `${innerIndent}// (sin sub-campos definidos)`;
    return `${indent}"${name}": {${comment}\n${inner}\n${indent}}`;
  }

  if (field.type === "array_of_objects") {
    const inner = children.length
      ? children.map(f => renderField(f, `${innerIndent}  `)).join(",\n")
      : `${innerIndent}  // (sin sub-campos definidos)`;
    return `${indent}"${name}": [${comment} — un objeto por cada elemento encontrado\n${innerIndent}{\n${inner}\n${innerIndent}}\n${indent}]`;
  }

  return `${indent}"${name}": ${TYPE_HINT[field.type]}${comment}`;
}

/**
 * Convierte la lista de campos (con su anidamiento) en el bloque de texto que
 * describe, con comentarios, la forma exacta del JSON que la IA debe
 * devolver — igual de idea a `stageCriteriaBlock` en crm-lead-ai.ts, pero
 * para un JSON con estructura en vez de una lista plana de opciones.
 */
export function renderExtractSchemaAsPromptSpec(fields: ExtractFieldDef[]): string {
  const valid = fields.filter(f => f.name.trim());
  if (valid.length === 0) return "";
  const body = valid.map(f => renderField(f, "  ")).join(",\n");
  return `{\n${body}\n}`;
}

const VALID_TYPES: ExtractFieldType[] = ["text", "number", "boolean", "date", "object", "array_of_objects"];

function isValidExtractField(f: unknown): f is ExtractFieldDef {
  if (typeof f !== "object" || f === null) return false;
  const candidate = f as ExtractFieldDef;
  return typeof candidate.name === "string" && VALID_TYPES.includes(candidate.type);
}

/**
 * Lee `extractSchema` desde el `data` (JSONB) de un nodo de forma defensiva
 * y recursiva — puede venir de un workflow guardado antes de que este campo
 * existiera, o con forma inválida.
 */
export function readExtractSchema(raw: unknown): ExtractFieldDef[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isValidExtractField).map(f => ({
    name: f.name,
    type: f.type,
    instruction: typeof f.instruction === "string" ? f.instruction : "",
    ...(isComposite(f.type) ? { fields: readExtractSchema(f.fields) } : {})
  }));
}
