export type DataColumnType = "text" | "number" | "boolean";

export interface DataTableColumn {
  key: string;
  label: string;
  type: DataColumnType;
  filterable: boolean;
  display: boolean;
  required: boolean;
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
