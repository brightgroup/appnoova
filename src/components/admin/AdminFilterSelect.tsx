"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import { registryListShell } from "@/lib/brand-ui";

export interface AdminFilterOption {
  value: string;
  label: string;
}

interface AdminFilterSelectProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: AdminFilterOption[];
  className?: string;
}

/** Filtro desplegable compacto — estilo minimalista (tipo Meta Ads Manager). */
export function AdminFilterSelect({
  label,
  value,
  onChange,
  options,
  className = "",
}: AdminFilterSelectProps) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuStyle, setMenuStyle] = useState({
    top: 0,
    left: 0,
    minWidth: 0,
    maxHeight: 256,
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  const updateMenuPosition = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const gap = 4;
    const maxCap = 256;
    const estimatedH = Math.min(maxCap, options.length * 40 + 8);
    const spaceBelow = window.innerHeight - rect.bottom - gap;
    const spaceAbove = rect.top - gap;
    const openUpward = spaceBelow < Math.min(estimatedH, 140) && spaceAbove > spaceBelow;
    const maxHeight = Math.min(maxCap, Math.max(96, openUpward ? spaceAbove : spaceBelow));
    const minWidth = Math.max(rect.width, 160);
    let left = rect.left;
    if (left + minWidth > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - minWidth - 8);
    }
    setMenuStyle({
      top: openUpward
        ? Math.max(8, rect.top - gap - maxHeight)
        : rect.bottom + gap,
      left,
      minWidth,
      maxHeight,
    });
  }, [options.length]);

  useEffect(() => {
    if (!open) return;
    updateMenuPosition();

    const close = (e: MouseEvent) => {
      const target = e.target as Node;
      if (ref.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    };

    const onScrollOrResize = () => updateMenuPosition();

    document.addEventListener("mousedown", close);
    window.addEventListener("resize", onScrollOrResize);
    window.addEventListener("scroll", onScrollOrResize, true);

    return () => {
      document.removeEventListener("mousedown", close);
      window.removeEventListener("resize", onScrollOrResize);
      window.removeEventListener("scroll", onScrollOrResize, true);
    };
  }, [open, updateMenuPosition]);

  const selected = options.find((o) => o.value === value);
  const display = selected?.label ?? value;

  const menu =
    open && mounted ? (
      <div
        ref={menuRef}
        role="listbox"
        className={`fixed z-[9999] ${registryListShell} py-1 overflow-y-auto`}
        style={{
          top: menuStyle.top,
          left: menuStyle.left,
          minWidth: menuStyle.minWidth,
          maxHeight: menuStyle.maxHeight,
        }}
      >
        {options.map((opt) => {
          const active = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
              className={`w-full px-3 py-2 text-sm text-left transition-colors flex items-center justify-between gap-2 ${
                active
                  ? "text-[#a5a5ff] bg-[#5b5bf6]/10"
                  : "text-gray-200 hover:bg-white/[.06]"
              }`}
            >
              <span className="truncate">{opt.label}</span>
              {active && <Check className="w-3.5 h-3.5 text-[#5b5bf6] shrink-0" />}
            </button>
          );
        })}
      </div>
    ) : null;

  return (
    <div ref={ref} className={`relative ${open ? "z-[50]" : ""} ${className}`}>
      <button
        type="button"
        onClick={() => {
          setOpen((prev) => {
            const next = !prev;
            if (next) updateMenuPosition();
            return next;
          });
        }}
        aria-expanded={open}
        className={`inline-flex items-center gap-2 h-8 pl-2.5 pr-2 rounded-lg border text-sm transition-colors ${
          open
            ? "border-[#5b5bf6]/35 bg-white/[.06] text-white"
            : "border-white/[.08] bg-white/[.02] text-white hover:bg-white/[.05] hover:border-white/[.12]"
        }`}
      >
        <span className="text-[11px] text-gray-500 font-medium shrink-0">{label}</span>
        <span className="w-px h-3.5 bg-white/[.08] shrink-0" />
        <span className="text-gray-200 truncate max-w-[140px] sm:max-w-[200px]">{display}</span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-gray-500 shrink-0 transition-transform duration-150 ${open ? "rotate-180" : ""}`}
        />
      </button>
      {mounted && menu ? createPortal(menu, document.body) : null}
    </div>
  );
}
