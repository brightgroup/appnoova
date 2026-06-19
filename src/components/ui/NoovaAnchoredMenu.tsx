"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { NoovaListMenu } from "@/components/ui/NoovaSelect";

type Align = "start" | "end";

interface NoovaAnchoredMenuProps {
  open: boolean;
  onClose: () => void;
  anchor: React.ReactNode;
  children: React.ReactNode;
  align?: Align;
  menuClassName?: string;
  offset?: number;
}

/** Menú anclado a un botón — se renderiza en portal para no quedar recortado por overflow de tablas */
export function NoovaAnchoredMenu({
  open,
  onClose,
  anchor,
  children,
  align = "end",
  menuClassName = "",
  offset = 4,
}: NoovaAnchoredMenuProps) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => setMounted(true), []);

  const updatePosition = useCallback(() => {
    const el = anchorRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const menuWidth = menuRef.current?.offsetWidth ?? 160;
    let left = align === "end" ? rect.right - menuWidth : rect.left;
    left = Math.max(8, Math.min(left, window.innerWidth - menuWidth - 8));
    setPosition({ top: rect.bottom + offset, left });
  }, [align, offset]);

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }
    updatePosition();
    const frame = requestAnimationFrame(updatePosition);
    return () => cancelAnimationFrame(frame);
  }, [open, updatePosition, children]);

  useEffect(() => {
    if (!open) return;
    const onScrollOrResize = () => updatePosition();
    window.addEventListener("resize", onScrollOrResize);
    window.addEventListener("scroll", onScrollOrResize, true);
    return () => {
      window.removeEventListener("resize", onScrollOrResize);
      window.removeEventListener("scroll", onScrollOrResize, true);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (anchorRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      onClose();
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open, onClose]);

  return (
    <>
      <span ref={anchorRef} className="inline-flex">
        {anchor}
      </span>
      {mounted &&
        open &&
        position &&
        createPortal(
          <div
            ref={menuRef}
            className="fixed z-[200]"
            style={{ top: position.top, left: position.left }}
            onClick={e => e.stopPropagation()}
          >
            <NoovaListMenu className={menuClassName}>{children}</NoovaListMenu>
          </div>,
          document.body
        )}
    </>
  );
}
