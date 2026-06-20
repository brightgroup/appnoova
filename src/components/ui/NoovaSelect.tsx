"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import { accentFocus, nvControl, registryListShell } from "@/lib/brand-ui";

export interface NoovaSelectOption {
  value: string;
  label: string;
}

interface NoovaSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: NoovaSelectOption[];
  placeholder?: string;
  disabled?: boolean;
  allowEmpty?: boolean;
  emptyLabel?: string;
  className?: string;
}

export function NoovaSelect({
  value,
  onChange,
  options,
  placeholder = "Seleccionar…",
  disabled,
  allowEmpty = true,
  emptyLabel = "—",
  className = ""
}: NoovaSelectProps) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuStyle, setMenuStyle] = useState<{ top: number; left: number; width: number }>({
    top: 0,
    left: 0,
    width: 0,
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  const updateMenuPosition = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setMenuStyle({
      top: rect.bottom + 6,
      left: rect.left,
      width: rect.width,
    });
  }, []);

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

  const selected = options.find(o => o.value === value);
  const display = selected?.label ?? (value ? value : placeholder);

  const pick = (next: string) => {
    onChange(next);
    setOpen(false);
  };

  const toggleOpen = () => {
    if (disabled) return;
    setOpen(prev => {
      const next = !prev;
      if (next) updateMenuPosition();
      return next;
    });
  };

  const menu = open && mounted ? (
    <div
      ref={menuRef}
      role="listbox"
      className={`fixed z-[9999] ${registryListShell} py-1 max-h-60 overflow-y-auto`}
      style={{
        top: menuStyle.top,
        left: menuStyle.left,
        width: menuStyle.width,
        minWidth: menuStyle.width,
      }}
    >
      {allowEmpty && (
        <button
          type="button"
          onClick={() => pick("")}
          className={`w-full px-4 py-2.5 text-sm text-left transition-colors flex items-center justify-between gap-2 bg-[var(--nv-bg-popover)] ${
            !value
              ? "text-[var(--nv-accent-text-soft)] bg-[var(--nv-accent-muted)]"
              : "text-[var(--nv-text-muted)] hover:bg-[var(--nv-hover-strong)] hover:text-[var(--nv-text)]"
          }`}
        >
          <span>{emptyLabel}</span>
          {!value && <Check className="w-4 h-4 text-[#5b5bf6] shrink-0" />}
        </button>
      )}
      {options.map(opt => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => pick(opt.value)}
            className={`w-full px-4 py-2.5 text-sm text-left transition-colors flex items-center justify-between gap-2 bg-[var(--nv-bg-popover)] ${
              active
                ? "text-[var(--nv-accent-text-soft)] bg-[var(--nv-accent-muted)]"
                : "text-[var(--nv-text)] hover:bg-[var(--nv-hover-strong)]"
            }`}
          >
            <span className="truncate">{opt.label}</span>
            {active && <Check className="w-4 h-4 text-[#5b5bf6] shrink-0" />}
          </button>
        );
      })}
    </div>
  ) : null;

  return (
    <div ref={ref} className={`relative ${open ? "z-[50]" : ""} ${className}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={toggleOpen}
        aria-expanded={open}
        className={`w-full flex items-center justify-between gap-2 px-4 py-2.5 text-sm text-left transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
          open
            ? `border border-[#5b5bf6]/45 bg-[var(--nv-bg-control)] text-[var(--nv-text)] ring-1 ring-[#5b5bf6]/20 ${accentFocus}`
            : `${nvControl}`
        }`}
      >
        <span className={selected || value ? "text-[var(--nv-text)] truncate" : "text-[var(--nv-text-faint)] truncate"}>
          {display}
        </span>
        <ChevronDown
          className={`w-4 h-4 text-[var(--nv-text-faint)] shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {mounted && menu ? createPortal(menu, document.body) : null}
    </div>
  );
}

/** Lista estática (menús contextuales, opciones fijas) — mismo estilo que el dropdown */
export function NoovaListMenu({
  children,
  className = "",
  onClick
}: {
  children: React.ReactNode;
  className?: string;
  onClick?: React.MouseEventHandler<HTMLDivElement>;
}) {
  return (
    <div className={`${registryListShell} py-1 bg-[var(--nv-bg-popover)] ${className}`} onClick={onClick}>
      {children}
    </div>
  );
}

export function NoovaListMenuItem({
  children,
  onClick,
  active,
  danger
}: {
  children: React.ReactNode;
  onClick?: () => void;
  active?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full px-4 py-2.5 text-left text-sm transition-colors bg-[var(--nv-bg-popover)] ${
        danger
          ? "text-red-400 hover:bg-red-500/10"
          : active
            ? "text-[var(--nv-accent-text-soft)] bg-[var(--nv-accent-muted)]"
            : "text-[var(--nv-text)] hover:bg-[var(--nv-hover-strong)]"
      }`}
    >
      {children}
    </button>
  );
}
