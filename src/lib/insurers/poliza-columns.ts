"use client";

import { useEffect, useState } from "react";

export interface PolizaColumnDef {
  key: string;
  label: string;
  /** Ancho mínimo en Tailwind, para que columnas de moneda/fecha no se compriman de más. */
  minWidthClass?: string;
}

/** Columnas universales — existen para cualquier póliza, sin importar el ramo. */
export const POLIZA_STATIC_COLUMNS: PolizaColumnDef[] = [
  { key: "tomador", label: "Tomador" },
  { key: "aseguradora", label: "Aseguradora" },
  { key: "ramo", label: "Ramo" },
  { key: "numero_poliza", label: "Número" },
  { key: "vigencia_desde", label: "Vigencia desde" },
  { key: "vigencia_hasta", label: "Vigencia hasta" },
  { key: "prima", label: "Prima" },
  { key: "moneda", label: "Moneda" },
  { key: "tipo_poliza", label: "Tipo" },
  { key: "comision_agencia", label: "Comisión agencia" },
  { key: "comision_vendedor", label: "Comisión vendedor" },
  { key: "estado", label: "Estado" }
];

const DEFAULT_VISIBLE = ["tomador", "aseguradora", "ramo", "numero_poliza", "vigencia_hasta", "prima", "estado"];
const STORAGE_KEY = "noova.seguros.polizas.columnas.v1";

interface StoredPrefs {
  order: string[];
  hidden: string[];
}

function loadPrefs(): StoredPrefs | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.order) || !Array.isArray(parsed.hidden)) return null;
    return parsed as StoredPrefs;
  } catch {
    return null;
  }
}

function savePrefs(prefs: StoredPrefs): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // localStorage puede fallar (modo privado, cuota) — la preferencia simplemente no persiste.
  }
}

/**
 * Estado de "qué columnas se ven y en qué orden", persistido en localStorage (preferencia de un
 * usuario en un navegador, no dato compartido — mismo criterio que ORI_MODEL_STORAGE_KEY en
 * dashboard/ori/page.tsx). `allColumns` incluye las estáticas más las dinámicas de campos
 * personalizados por ramo, ya resueltas por el caller.
 */
export function usePolizaColumnPrefs(allColumns: PolizaColumnDef[]) {
  const [order, setOrder] = useState<string[]>(allColumns.map(c => c.key));
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored = loadPrefs();
    const allKeys = allColumns.map(c => c.key);
    if (stored) {
      // Conserva el orden guardado para las columnas conocidas, agrega al final las nuevas (ej. un campo personalizado recién creado).
      const known = stored.order.filter(k => allKeys.includes(k));
      const missing = allKeys.filter(k => !known.includes(k));
      setOrder([...known, ...missing]);
      setHidden(new Set(stored.hidden.filter(k => allKeys.includes(k))));
    } else {
      setOrder(allKeys);
      setHidden(new Set(allKeys.filter(k => !DEFAULT_VISIBLE.includes(k))));
    }
    setReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allColumns.map(c => c.key).join(",")]);

  function persist(nextOrder: string[], nextHidden: Set<string>) {
    setOrder(nextOrder);
    setHidden(nextHidden);
    savePrefs({ order: nextOrder, hidden: [...nextHidden] });
  }

  function toggle(key: string) {
    const next = new Set(hidden);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    persist(order, next);
  }

  function move(key: string, direction: -1 | 1) {
    const idx = order.indexOf(key);
    const targetIdx = idx + direction;
    if (idx < 0 || targetIdx < 0 || targetIdx >= order.length) return;
    const next = [...order];
    [next[idx], next[targetIdx]] = [next[targetIdx], next[idx]];
    persist(next, hidden);
  }

  const byKey = new Map(allColumns.map(c => [c.key, c]));
  const visible = order.map(k => byKey.get(k)).filter((c): c is PolizaColumnDef => Boolean(c) && !hidden.has(c!.key));
  const ordered = order.map(k => byKey.get(k)).filter((c): c is PolizaColumnDef => Boolean(c));

  return { ready, ordered, visible, hidden, toggle, move };
}
