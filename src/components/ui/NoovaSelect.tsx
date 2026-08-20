"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search } from "lucide-react";
import { accentFocus, nvControl, registryListShell } from "@/lib/brand-ui";

export interface NoovaSelectOption {
  value: string;
  label: string;
  /** Icono opcional al inicio de la opción (y del valor elegido en el trigger) — ej. logo del proveedor de un modelo. */
  icon?: ReactNode;
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
  /** Buscador arriba de la lista. Por defecto se activa solo si hay más de 6 opciones (listas cortas no lo necesitan). */
  searchable?: boolean;
  searchPlaceholder?: string;
}

export function NoovaSelect({
  value,
  onChange,
  options,
  placeholder = "Seleccionar…",
  disabled,
  allowEmpty = true,
  emptyLabel = "—",
  className = "",
  searchable,
  searchPlaceholder = "Buscar…"
}: NoovaSelectProps) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [query, setQuery] = useState("");
  const [highlighted, setHighlighted] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const showSearch = searchable ?? options.length > 6;
  const [menuStyle, setMenuStyle] = useState<{
    top: number;
    left: number;
    width: number;
    maxHeight: number;
    openUpward: boolean;
  }>({
    top: 0,
    left: 0,
    width: 0,
    maxHeight: 240,
    openUpward: false,
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  const updateMenuPosition = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const gap = 6;
    const maxCap = 240; // max-h-60
    const optionCount = options.length + (allowEmpty ? 1 : 0);
    const estimatedH = Math.min(maxCap, optionCount * 42 + 8 + (showSearch ? 44 : 0));
    const spaceBelow = window.innerHeight - rect.bottom - gap;
    const spaceAbove = rect.top - gap;
    const openUpward = spaceBelow < Math.min(estimatedH, 140) && spaceAbove > spaceBelow;
    const available = Math.max(96, openUpward ? spaceAbove : spaceBelow);
    const maxHeight = Math.min(maxCap, available);
    const width = Math.max(rect.width, 76);
    let left = rect.left;
    if (left + width > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - width - 8);
    }

    setMenuStyle({
      top: openUpward
        ? Math.max(8, rect.top - gap - maxHeight)
        : rect.bottom + gap,
      left,
      width,
      maxHeight,
      openUpward,
    });
  }, [allowEmpty, options.length, showSearch]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      return;
    }
    setHighlighted(0);
    if (showSearch) {
      const raf = requestAnimationFrame(() => searchRef.current?.focus());
      return () => cancelAnimationFrame(raf);
    }
  }, [open, showSearch]);

  const filteredOptions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(o => o.label.toLowerCase().includes(q));
  }, [options, query]);

  useEffect(() => {
    setHighlighted(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;

    updateMenuPosition();
    // Recalcular con altura real del menú (abre hacia arriba si no cabe abajo).
    const raf = requestAnimationFrame(() => {
      const trigger = ref.current;
      const menuEl = menuRef.current;
      if (!trigger || !menuEl) return;
      const rect = trigger.getBoundingClientRect();
      const gap = 6;
      const menuH = menuEl.getBoundingClientRect().height;
      const spaceBelow = window.innerHeight - rect.bottom - gap;
      const spaceAbove = rect.top - gap;
      const openUpward = spaceBelow < menuH + 8 && spaceAbove > spaceBelow;
      const maxHeight = Math.min(
        240,
        Math.max(96, openUpward ? spaceAbove : spaceBelow)
      );
      const width = Math.max(rect.width, 76);
      let left = rect.left;
      if (left + width > window.innerWidth - 8) {
        left = Math.max(8, window.innerWidth - width - 8);
      }
      setMenuStyle({
        top: openUpward ? Math.max(8, rect.top - gap - Math.min(menuH, maxHeight)) : rect.bottom + gap,
        left,
        width,
        maxHeight,
        openUpward,
      });
    });

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
      cancelAnimationFrame(raf);
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

  const navItems: NoovaSelectOption[] = allowEmpty
    ? [{ value: "", label: emptyLabel }, ...filteredOptions]
    : filteredOptions;

  const onMenuKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted(h => Math.min(h + 1, navItems.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted(h => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = navItems[highlighted];
      if (item) pick(item.value);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector(`[data-nv-idx="${highlighted}"]`)?.scrollIntoView({ block: "nearest" });
  }, [highlighted, open]);

  const menu = open && mounted ? (
    <div
      ref={menuRef}
      role="listbox"
      className={`fixed z-[9999] ${registryListShell} flex flex-col`}
      style={{
        top: menuStyle.top,
        left: menuStyle.left,
        width: menuStyle.width,
        minWidth: menuStyle.width,
        maxHeight: menuStyle.maxHeight,
      }}
      onKeyDown={onMenuKeyDown}
    >
      {showSearch && (
        <div className="flex items-center gap-2 px-3 border-b border-[var(--nv-border)] shrink-0">
          <Search className="w-3.5 h-3.5 text-[var(--nv-text-faint)] shrink-0" />
          <input
            ref={searchRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full py-2.5 text-sm bg-transparent outline-none text-[var(--nv-text)] placeholder:text-[var(--nv-text-faint)]"
          />
        </div>
      )}
      <div className="py-1 overflow-y-auto min-h-0">
        {navItems.length === 0 ? (
          <p className="px-4 py-3 text-sm text-[var(--nv-text-faint)]">Sin resultados</p>
        ) : (
          navItems.map((opt, idx) => {
            const active = value === opt.value;
            const isHighlighted = idx === highlighted;
            return (
              <button
                key={opt.value || "__empty"}
                type="button"
                data-nv-idx={idx}
                onClick={() => pick(opt.value)}
                onMouseEnter={() => setHighlighted(idx)}
                className={`w-full px-4 py-2.5 text-sm text-left transition-colors flex items-center gap-2 ${
                  active
                    ? "text-[var(--nv-hubspot-teal)] bg-[var(--nv-accent-muted)]"
                    : isHighlighted
                      ? "bg-[var(--nv-bg-control-hover)] text-[var(--nv-text)]"
                      : opt.value === ""
                        ? "text-[var(--nv-text-muted)]"
                        : "text-[var(--nv-text)]"
                }`}
              >
                {opt.icon && <span className="shrink-0 flex items-center">{opt.icon}</span>}
                <span className="truncate flex-1">{opt.label}</span>
                {active && <Check className="w-4 h-4 text-[#0f7eff] shrink-0" />}
              </button>
            );
          })
        )}
      </div>
    </div>
  ) : null;

  return (
    <div ref={ref} className={`relative ${open ? "z-[50]" : ""} ${className}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={toggleOpen}
        aria-expanded={open}
        className={`nv-select-trigger w-full flex items-center justify-between gap-2 px-4 py-2.5 text-sm text-left transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
          open
            ? `border border-[#0f7eff]/35 bg-[var(--nv-bg-control)] text-[var(--nv-text)] ring-1 ring-[#0f7eff]/15 ${accentFocus}`
            : `${nvControl}`
        }`}
      >
        <span className={`flex items-center gap-2 min-w-0 ${selected || value ? "text-[var(--nv-text)]" : "text-[var(--nv-text-faint)]"}`}>
          {selected?.icon && <span className="shrink-0 flex items-center">{selected.icon}</span>}
          <span className="truncate">{display}</span>
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
    <div className={`${registryListShell} py-1 ${className}`} onClick={onClick}>
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
      className={`w-full px-4 py-2.5 text-left text-sm transition-colors ${
        danger
          ? "text-red-400 hover:bg-red-500/10"
          : active
                ? "text-[var(--nv-hubspot-teal)] bg-[var(--nv-accent-muted)]"
            : "text-[var(--nv-text)] hover:bg-[var(--nv-bg-control-hover)]"
      }`}
    >
      {children}
    </button>
  );
}
