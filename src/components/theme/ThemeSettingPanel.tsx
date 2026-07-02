"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/theme/ThemeProvider";
import {
  THEME_DESCRIPTIONS,
  THEME_LABELS,
  type ThemePreference
} from "@/lib/theme";

const OPTIONS: {
  id: ThemePreference;
  icon: typeof Sun;
}[] = [
  { id: "light", icon: Sun },
  { id: "dark", icon: Moon },
  { id: "system", icon: Monitor }
];

export function ThemeSettingPanel() {
  const { preference, resolved, ready, setPreference } = useTheme();

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-[var(--nv-text)]">Apariencia</h2>
        <p className="text-xs text-[var(--nv-text-muted)] mt-1">
          Elige cómo se ve la plataforma. Por defecto Noova usa tema oscuro; elige Claro si lo prefieres
          {preference === "system" && ready
            ? ` (ahora: ${resolved === "dark" ? "oscuro" : "claro"})`
            : ""}
          .
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {OPTIONS.map(({ id, icon: Icon }) => {
          const active = preference === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setPreference(id)}
              className={`rounded-xl border p-4 text-left transition-all ${
                active
                  ? "border-[#5b5bf6]/40 bg-[var(--nv-accent-muted)] ring-1 ring-[#5b5bf6]/20 shadow-[0_0_20px_-4px_var(--nv-accent-glow)]"
                  : "border-[var(--nv-border-strong)] bg-[var(--nv-hover)] hover:border-[var(--nv-border-strong)] hover:bg-[var(--nv-hover-strong)]"
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <span
                  className={`inline-flex h-9 w-9 items-center justify-center rounded-lg ${
                    active
                      ? "bg-[var(--nv-accent-muted-strong)] text-[var(--nv-accent-text-soft)]"
                      : "bg-[var(--nv-hover-strong)] text-[var(--nv-text-muted)]"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <span className="text-sm font-semibold text-[var(--nv-text)]">
                  {THEME_LABELS[id]}
                </span>
              </div>
              <p className="text-xs leading-relaxed text-[var(--nv-text-muted)]">
                {THEME_DESCRIPTIONS[id]}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
