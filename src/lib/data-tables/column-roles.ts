import type { DataColumnRole, DataTableColumn } from "@/types/data-table";

/**
 * Mapeo explícito de columnas: qué columna del archivo del cliente es el
 * producto, cuál el precio, cuál la categoría…
 *
 * Hasta ahora esto se adivinaba en cada mensaje a partir del nombre de la
 * columna, contra una lista de sinónimos ("precio", "costo", "valor"…). Con un
 * catálogo que titula su columna «PVP» o «Importe» la detección fallaba en
 * silencio y, lo más grave, el blindaje de precios quedaba desactivado por
 * completo: `enforceCatalogAmounts` no interviene si no encuentra columna de
 * precio, así que la tabla se importaba sin un solo aviso y el agente podía
 * inventar importes sin que nadie los contrastara.
 *
 * El rol se guarda en la propia columna (`DataTableColumn.role`), dentro del
 * JSON que la tabla ya almacena. Las tablas anteriores no lo traen y siguen
 * resolviéndose por detección automática, exactamente igual que antes.
 */

export const COLUMN_ROLES: DataColumnRole[] = ["name", "price", "category", "code", "link"];

interface RoleSpec {
  label: string;
  /** Texto de ayuda en el importador. */
  hint: string;
  /** Sin esta columna la tabla no sirve para un agente. */
  required: boolean;
  /** Puede corresponder a varias columnas (precio COP y USD, varios códigos). */
  multiple: boolean;
}

export const COLUMN_ROLE_SPECS: Record<DataColumnRole, RoleSpec> = {
  name: {
    label: "Producto",
    hint: "El nombre con el que el cliente pide el producto.",
    required: true,
    multiple: false,
  },
  price: {
    label: "Precio",
    hint: "Sin esta columna la IA no puede validar los importes que diga.",
    required: false,
    multiple: true,
  },
  category: {
    label: "Categoría",
    hint: "Agrupa el catálogo para búsquedas amplias.",
    required: false,
    multiple: false,
  },
  code: {
    label: "Código / SKU",
    hint: "Permite encontrar un producto exacto por su referencia.",
    required: false,
    multiple: true,
  },
  link: {
    label: "Enlace",
    hint: "La URL de compra o ficha del producto.",
    required: false,
    multiple: false,
  },
};

/** Mapeo elegido en el importador: rol → claves de columna. */
export type ColumnRoleMap = Partial<Record<DataColumnRole, string[]>>;

export function isColumnRole(value: unknown): value is DataColumnRole {
  return typeof value === "string" && (COLUMN_ROLES as string[]).includes(value);
}

/** El mapeo que ya llevan las columnas, para precargar el importador. */
export function roleMapFromColumns(columns: DataTableColumn[]): ColumnRoleMap {
  const map: ColumnRoleMap = {};
  for (const col of columns) {
    if (!col.role) continue;
    (map[col.role] ??= []).push(col.key);
  }
  return map;
}

/**
 * Escribe el mapeo elegido sobre las columnas. Un rol que el usuario deja sin
 * asignar se queda sin marcar a propósito: es la señal de "aquí no adivines
 * tampoco", y así una tabla sin precios (sedes, horarios, preguntas
 * frecuentes) no arrastra una columna numérica cualquiera como si lo fuera.
 */
export function applyRoleMap(
  columns: DataTableColumn[],
  roleMap: ColumnRoleMap
): DataTableColumn[] {
  const roleOf = new Map<string, DataColumnRole>();
  for (const role of COLUMN_ROLES) {
    for (const key of roleMap[role] ?? []) {
      // Una columna cumple un solo papel: gana el primero que la reclame.
      if (!roleOf.has(key)) roleOf.set(key, role);
    }
  }

  return columns.map(col => {
    const role = roleOf.get(col.key);
    const next: DataTableColumn = { ...col };
    if (role) {
      next.role = role;
      // La categoría es lo que filtra el catálogo; el producto siempre viaja.
      if (role === "category") next.filterable = true;
      if (role === "name" || role === "category") next.required = true;
    } else {
      delete next.role;
    }
    return next;
  });
}

/** Columnas marcadas con un rol concreto, en el orden de la tabla. */
export function columnsWithRole(
  columns: DataTableColumn[],
  role: DataColumnRole
): DataTableColumn[] {
  return columns.filter(c => c.role === role);
}

/**
 * ¿Alguien confirmó ya el mapeo de esta tabla?
 *
 * Distingue "el usuario dijo que no hay columna de precio" de "esta tabla es
 * anterior al mapeo y nunca se le preguntó". En el primer caso hay que
 * respetar el vacío; en el segundo hay que seguir adivinando como siempre, que
 * es lo que mantiene funcionando a las tablas ya importadas.
 */
export function hasRoleMap(columns: DataTableColumn[]): boolean {
  return columns.some(c => Boolean(c.role));
}

/**
 * Aplica a las columnas recién leídas el mapeo que llega del importador.
 *
 * Si no llega ninguno pero la tabla ya tenía uno (reimportación de un Excel
 * actualizado), se conserva el anterior para las columnas que sigan existiendo:
 * volver a adivinar ahí sería deshacer en silencio lo que el usuario confirmó.
 */
export function applyColumnRolesFromForm(
  columns: DataTableColumn[],
  raw: unknown,
  previousColumns?: DataTableColumn[]
): DataTableColumn[] {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (text) {
    try {
      return applyRoleMap(columns, parseRoleMap(JSON.parse(text)));
    } catch {
      // JSON inválido: se ignora y se cae a la detección automática, que es el
      // comportamiento previo — nunca dejar la importación a medias por esto.
    }
  }

  if (previousColumns?.length && hasRoleMap(previousColumns)) {
    const valid = new Set(columns.map(c => c.key));
    const carried: ColumnRoleMap = {};
    for (const [role, keys] of Object.entries(roleMapFromColumns(previousColumns))) {
      const kept = (keys ?? []).filter(k => valid.has(k));
      if (kept.length) carried[role as DataColumnRole] = kept;
    }
    if (Object.keys(carried).length) return applyRoleMap(columns, carried);
  }

  return columns;
}

export function parseRoleMap(raw: unknown): ColumnRoleMap {
  if (!raw || typeof raw !== "object") return {};
  const source = raw as Record<string, unknown>;
  const map: ColumnRoleMap = {};
  for (const role of COLUMN_ROLES) {
    const value = source[role];
    const keys = (Array.isArray(value) ? value : [value])
      .filter((k): k is string => typeof k === "string" && k.trim().length > 0);
    if (keys.length > 0) map[role] = keys;
  }
  return map;
}
