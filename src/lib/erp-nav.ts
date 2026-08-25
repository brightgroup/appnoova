import { Boxes, ArrowLeftRight, type LucideIcon } from "lucide-react";

export interface ErpNavItem {
  name: string;
  href: string;
  icon: LucideIcon;
}

export const ERP_NAV: ErpNavItem[] = [
  { name: "Inventario", href: "/dashboard/erp/inventario", icon: Boxes },
  { name: "Movimientos", href: "/dashboard/erp/movimientos", icon: ArrowLeftRight }
];
