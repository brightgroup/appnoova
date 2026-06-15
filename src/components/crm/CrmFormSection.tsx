"use client";

import type { LucideIcon } from "lucide-react";

interface CrmFormSectionProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  children: React.ReactNode;
  aside?: React.ReactNode;
}

export function CrmFormSection({ title, description, icon: Icon, children, aside }: CrmFormSectionProps) {
  return (
    <section className="rounded-2xl border border-white/[.08] bg-white/[.02] p-5 mb-5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-start gap-2.5 min-w-0">
          {Icon && (
            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#a5a5ff]/10 text-[#a5a5ff]">
              <Icon className="h-3.5 w-3.5" />
            </span>
          )}
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-white">{title}</h2>
            {description && <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{description}</p>}
          </div>
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}
