"use client";

import { tabActive, tabIdle } from "@/lib/brand-ui";

export type PhoneNumberCategoryTab = "verified" | "purchased";

interface PhoneNumberCategoryTabsProps {
  value: PhoneNumberCategoryTab;
  onChange: (tab: PhoneNumberCategoryTab) => void;
  verifiedCount?: number;
  purchasedCount?: number;
}

export function PhoneNumberCategoryTabs({
  value,
  onChange,
  verifiedCount,
  purchasedCount
}: PhoneNumberCategoryTabsProps) {
  const tabs: { id: PhoneNumberCategoryTab; label: string; count?: number }[] = [
    { id: "verified", label: "Verificados", count: verifiedCount },
    { id: "purchased", label: "Comprados", count: purchasedCount }
  ];

  return (
    <div className="flex gap-6 border-b border-white/[.08]">
      {tabs.map(tab => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={`pb-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
            value === tab.id ? tabActive : tabIdle
          }`}
        >
          {tab.label}
          {tab.count !== undefined && tab.count > 0 && (
            <span className="ml-1.5 text-xs text-gray-500">({tab.count})</span>
          )}
        </button>
      ))}
    </div>
  );
}
