export type DataColumnType = "text" | "number" | "boolean";

/**
 * Papel que cumple una columna para la IA, confirmado por el usuario al
 * importar. Sin rol, el sistema lo adivina por el nombre de la columna
 * (ver `getNameColumn`, `getPriceColumns`…), que es lo que hacía que un
 * encabezado como «PVP» o «Ítem» pasara desapercibido.
 */
export type DataColumnRole = "name" | "price" | "category" | "code" | "link";

export interface DataTableColumn {
  key: string;
  label: string;
  type: DataColumnType;
  filterable: boolean;
  display: boolean;
  required: boolean;
  /** Confirmado por el usuario. Ausente = detección automática por nombre. */
  role?: DataColumnRole;
}

export interface DataTableRecord {
  id: string;
  organization_id: string;
  user_id: string;
  name: string;
  description: string | null;
  columns: DataTableColumn[];
  row_count: number;
  created_at: string;
  updated_at: string;
}

export interface DataTableRowRecord {
  id: string;
  data_table_id: string;
  organization_id: string;
  data: Record<string, string | number | boolean | null>;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
