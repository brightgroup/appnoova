"use client";

import { useCallback, useRef, useState } from "react";
import Image from "next/image";
import { ImageIcon, Loader2, Upload, X } from "lucide-react";
import { getAuthToken } from "@/lib/text-agents-api";

interface ImageDropzoneProps {
  label: string;
  hint?: string;
  value: string | null;
  kind: "logo" | "favicon";
  onChange: (url: string | null) => void;
  compact?: boolean;
}

export function ImageDropzone({
  label,
  hint,
  value,
  kind,
  onChange,
  compact = false
}: ImageDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const upload = useCallback(async (file: File) => {
    setUploading(true);
    setError("");
    try {
      const token = await getAuthToken();
      if (!token) {
        setError("Sesión expirada. Vuelve a iniciar sesión.");
        return;
      }
      const body = new FormData();
      body.append("file", file);
      body.append("kind", kind);

      const res = await fetch("/api/microsite/upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Error al subir");
        return;
      }
      onChange(data.url ?? null);
    } catch {
      setError("Error de red al subir");
    } finally {
      setUploading(false);
    }
  }, [kind, onChange]);

  const onFiles = (files: FileList | null) => {
    const file = files?.[0];
    if (file) upload(file);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    onFiles(e.dataTransfer.files);
  };

  const previewSize = compact ? "w-14 h-14" : "w-20 h-20";

  return (
    <div>
      <label className="block text-[11px] font-medium text-gray-400 mb-1.5 uppercase tracking-wide">
        {label}
      </label>

      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => !uploading && inputRef.current?.click()}
        className={`relative rounded-xl border-2 border-dashed transition-colors cursor-pointer ${
          dragging
            ? "border-[#0f7eff] bg-[#0f7eff]/10"
            : "border-white/[.12] hover:border-white/[.22] bg-white/[.02]"
        } ${compact ? "p-3" : "p-5"}`}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml,image/x-icon,image/vnd.microsoft.icon,.ico"
          className="hidden"
          onChange={e => onFiles(e.target.files)}
        />

        {uploading ? (
          <div className="flex flex-col items-center justify-center py-6 text-gray-400">
            <Loader2 className="w-6 h-6 animate-spin mb-2" />
            <span className="text-xs">Subiendo...</span>
          </div>
        ) : value ? (
          <div className="flex items-center gap-4">
            <div className={`relative ${previewSize} rounded-lg bg-white/90 overflow-hidden shrink-0`}>
              <Image key={value} src={value} alt={label} fill className="object-contain p-1" unoptimized />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-gray-300 font-medium">Archivo cargado</p>
              <p className="text-[11px] text-gray-500 truncate mt-0.5">{value.split("/").pop()}</p>
              <p className="text-[11px] text-[#0f7eff] mt-2">Arrastra otro archivo o haz clic para reemplazar</p>
            </div>
            <button
              type="button"
              onClick={e => { e.stopPropagation(); onChange(null); }}
              className="p-2 rounded-lg hover:bg-white/[.08] text-gray-400 hover:text-white shrink-0"
              title="Quitar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <div className="w-10 h-10 rounded-full bg-white/[.06] flex items-center justify-center mb-3">
              {dragging ? <Upload className="w-5 h-5 text-[#0f7eff]" /> : <ImageIcon className="w-5 h-5 text-gray-400" />}
            </div>
            <p className="text-sm text-gray-300 font-medium">
              Arrastra tu imagen aquí
            </p>
            <p className="text-xs text-gray-500 mt-1">
              o <span className="text-[#0f7eff]">adjunta desde tu PC</span>
            </p>
            {hint && <p className="text-[11px] text-gray-600 mt-2">{hint}</p>}
          </div>
        )}
      </div>

      {error && <p className="text-[11px] text-red-400 mt-1.5">{error}</p>}
    </div>
  );
}
