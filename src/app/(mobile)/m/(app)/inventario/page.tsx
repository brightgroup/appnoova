"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { authFetch } from "@/lib/telephony-api";
import { AppLoader } from "../../AppLoader";
import { BackIcon, SearchIcon } from "../../icons";

/**
 * Listado completo de inventario en el celular — la salida natural de una
 * consulta a Ori que devolvió más filas de las que cabe mostrar en un chat.
 * Ori entrega el link con sus mismos filtros ya aplicados (?q=&marca=&
 * bajo_minimo=1), así que el usuario nunca tiene que volver a escribir la
 * búsqueda. Pagina contra la base (ver src/lib/erp/inventory-listing-db.ts):
 * no hay modelo de lenguaje en el medio, así que el scroll no cuesta créditos.
 */

const PAGE_SIZE = 25;

interface InventoryRow {
  id: string;
  codigo: string;
  nombre: string;
  marca: string | null;
  responsable: string | null;
  existencia: number;
  stockMinimo: number | null;
  bajoMinimo: boolean;
}

export default function MobileInventarioPage() {
  return (
    <Suspense
      fallback={
        <div className="loading-block">
          <AppLoader />
        </div>
      }
    >
      <InventarioView />
    </Suspense>
  );
}

function InventarioView() {
  const router = useRouter();
  const params = useSearchParams();

  const [search, setSearch] = useState(params.get("q") ?? "");
  const [debounced, setDebounced] = useState(params.get("q") ?? "");
  const [marca, setMarca] = useState<string | null>(params.get("marca"));
  const [bajoMinimo, setBajoMinimo] = useState(params.get("bajo_minimo") === "1");

  const [rows, setRows] = useState<InventoryRow[] | null>(null);
  const [marcas, setMarcas] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");

  const sentinelRef = useRef<HTMLDivElement>(null);
  // Evita que una respuesta lenta de un filtro viejo pise a la del filtro actual.
  const requestRef = useRef(0);

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(search.trim()), 300);
    return () => window.clearTimeout(t);
  }, [search]);

  const fetchPage = useCallback(
    async (offset: number) => {
      const qs = new URLSearchParams({ offset: String(offset), limit: String(PAGE_SIZE) });
      if (debounced) qs.set("q", debounced);
      if (marca) qs.set("marca", marca);
      if (bajoMinimo) qs.set("bajo_minimo", "1");

      const res = await authFetch(`/api/erp/inventario/listado?${qs}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo cargar el inventario.");
      return data as { items: InventoryRow[]; total: number; hasMore: boolean; marcas?: string[] };
    },
    [debounced, marca, bajoMinimo]
  );

  useEffect(() => {
    const ticket = ++requestRef.current;
    setRows(null);
    setError("");

    fetchPage(0)
      .then(data => {
        if (requestRef.current !== ticket) return;
        setRows(data.items);
        setTotal(data.total);
        setHasMore(data.hasMore);
        if (data.marcas) setMarcas(data.marcas);
      })
      .catch(err => {
        if (requestRef.current !== ticket) return;
        setError(err instanceof Error ? err.message : "No se pudo cargar el inventario.");
        setRows([]);
      });
  }, [fetchPage]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || !rows) return;
    const ticket = requestRef.current;
    setLoadingMore(true);
    try {
      const data = await fetchPage(rows.length);
      if (requestRef.current !== ticket) return;
      setRows(prev => [...(prev ?? []), ...data.items]);
      setTotal(data.total);
      setHasMore(data.hasMore);
    } catch {
      setHasMore(false);
    } finally {
      setLoadingMore(false);
    }
  }, [fetchPage, hasMore, loadingMore, rows]);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore) return;
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0]?.isIntersecting) loadMore();
      },
      { rootMargin: "240px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, loadMore]);

  const visibleMarcas = marca ? [marca, ...marcas.filter(m => m !== marca)] : marcas;

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, position: "relative" }}>
      <div className="app-head">
        <div className="head-row">
          <button className="back-btn" aria-label="Volver a Ori" onClick={() => router.push("/m/ori")}>
            <BackIcon />
          </button>
          <div style={{ flex: 1 }}>
            <p className="kicker">Noova360</p>
            <h1>Inventario</h1>
          </div>
        </div>
        <div className="search">
          <SearchIcon />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por código, nombre o marca"
            autoComplete="off"
            inputMode="search"
          />
        </div>
        <div className="inv-filters">
          <button
            type="button"
            className={`inv-chip${bajoMinimo ? " on" : ""}`}
            onClick={() => setBajoMinimo(v => !v)}
          >
            Bajo mínimo
          </button>
          {visibleMarcas.map(m => (
            <button
              key={m}
              type="button"
              className={`inv-chip${marca === m ? " on" : ""}`}
              onClick={() => setMarca(current => (current === m ? null : m))}
            >
              {m}
            </button>
          ))}
        </div>
        {rows !== null && !error ? (
          <p className="head-sub inv-count">
            {total === 0 ? "Sin resultados" : `${rows.length} de ${total} productos`}
          </p>
        ) : null}
      </div>

      <div className="nv-m-scroll">
        <div className="inv-body">
          {rows === null ? (
            <div className="loading-block">
              <AppLoader />
            </div>
          ) : error ? (
            <div className="empty-state">{error}</div>
          ) : rows.length === 0 ? (
            <div className="empty-state">
              No hay productos con estos filtros.
            </div>
          ) : (
            <>
              {rows.map(item => (
                <div key={item.id} className="inv-row">
                  <div className="inv-main">
                    <span className="inv-name">{item.nombre}</span>
                    <span className="inv-sub">
                      {item.codigo}
                      {item.marca ? ` · ${item.marca}` : ""}
                    </span>
                  </div>
                  <div className="inv-nums">
                    <span className={`inv-stock${item.bajoMinimo ? " warn" : ""}`}>{item.existencia}</span>
                    <span className="inv-min">mín {item.stockMinimo ?? "—"}</span>
                  </div>
                </div>
              ))}
              {hasMore ? (
                <div ref={sentinelRef} className="inv-more">
                  {loadingMore ? "Cargando…" : " "}
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
