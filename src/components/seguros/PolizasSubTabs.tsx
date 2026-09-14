"use client";

import Link from "next/link";
import { btnFilterGroup, btnFilterActive, btnFilterIdle } from "@/lib/brand-ui";

const TABS = [
  { id: "polizas" as const, label: "Pólizas", href: "/dashboard/seguros/polizas" },
  { id: "renovaciones" as const, label: "Renovaciones", href: "/dashboard/seguros/renovaciones" }
];

export function PolizasSubTabs({ active }: { active: "polizas" | "renovaciones" }) {
  return (
    <div className={btnFilterGroup}>
      {TABS.map(tab => (
        <Link key={tab.id} href={tab.href} className={tab.id === active ? btnFilterActive : btnFilterIdle}>
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
