"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Pencil } from "lucide-react";
import { modalInput } from "@/lib/brand-ui";
import { NoovaSelect } from "@/components/ui/NoovaSelect";

export interface RamoCampo {
  fieldKey: string;
  label: string;
  fieldType: "text" | "number" | "date" | "select" | "boolean";
  options: string[];
  value: unknown;
}

/**
 * Un dato de cotización (personal o del ramo) mostrado como texto sutil, con
 * un lápiz para editar en el lugar — no un formulario siempre abierto. Vive
 * en la ficha del lead (no en una entidad de cotización aparte, ver plan
 * "Datos de cotización en el lead"): el asesor ve de un vistazo lo que ya se
 * sabe y solo entra en modo edición cuando lo necesita.
 */
export function RamoCampoInput({
  campo,
  onSave
}: {
  campo: RamoCampo;
  onSave: (fieldKey: string, value: unknown) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(campo.value != null ? String(campo.value) : "");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft(campo.value != null ? String(campo.value) : "");
  }, [campo.value]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  async function commit(value: string) {
    setSaving(true);
    try {
      await onSave(campo.fieldKey, campo.fieldType === "number" ? (value ? Number(value) : null) : value || null);
    } finally {
      setSaving(false);
      setEditing(false);
    }
  }

  const displayValue = campo.value != null && campo.value !== "" ? String(campo.value) : "";

  if (!editing) {
    return (
      <div className="flex items-center justify-between gap-2 py-1 group">
        <span className="text-xs text-gray-500 shrink-0">{campo.label}</span>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="flex items-center gap-1.5 min-w-0 text-right"
        >
          <span className={`text-xs truncate ${displayValue ? "text-gray-200" : "text-gray-600 italic"}`}>
            {displayValue || "Sin responder"}
          </span>
          {saving ? (
            <Loader2 className="w-3 h-3 animate-spin text-gray-500 shrink-0" />
          ) : (
            <Pencil className="w-3 h-3 text-gray-600 opacity-0 group-hover:opacity-100 shrink-0" />
          )}
        </button>
      </div>
    );
  }

  if (campo.fieldType === "select" || campo.fieldType === "boolean") {
    const options = campo.fieldType === "boolean" ? ["Sí", "No"] : campo.options;
    return (
      <div className="py-1">
        <span className="text-xs text-gray-500 block mb-1">{campo.label}</span>
        <NoovaSelect
          value={draft}
          onChange={v => {
            setDraft(v);
            void commit(v);
          }}
          options={options.map(o => ({ value: o, label: o }))}
          placeholder="Sin responder"
          className="!py-1 !text-xs"
        />
      </div>
    );
  }

  return (
    <div className="py-1">
      <span className="text-xs text-gray-500 block mb-1">{campo.label}</span>
      <input
        ref={inputRef}
        type={campo.fieldType === "number" ? "number" : campo.fieldType === "date" ? "date" : "text"}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={() => commit(draft)}
        onKeyDown={e => {
          if (e.key === "Enter") commit(draft);
          if (e.key === "Escape") setEditing(false);
        }}
        placeholder="Sin responder"
        className={`${modalInput} !py-1 !text-xs w-full`}
      />
    </div>
  );
}
