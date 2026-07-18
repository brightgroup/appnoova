"use client";

import { useCallback, useRef, useState, type TouchEvent } from "react";

// El gesto nativo de "deslizar para recargar" está deshabilitado a propósito
// en /m (overflow:hidden en html/body — necesario para el layout de app
// instalada en iOS, ver mobile-app.css). Este hook reimplementa el gesto a
// mano sobre el contenedor con scroll interno, solo quedaba "bloqueado" sin
// esto.
const THRESHOLD = 60;
const MAX_PULL = 72;

export function usePullToRefresh(onRefresh: () => Promise<void> | void) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const startY = useRef<number | null>(null);
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const onTouchStart = useCallback(
    (e: TouchEvent<HTMLDivElement>) => {
      if (refreshing) return;
      const el = scrollRef.current;
      startY.current = el && el.scrollTop <= 0 ? e.touches[0].clientY : null;
    },
    [refreshing]
  );

  const onTouchMove = useCallback(
    (e: TouchEvent<HTMLDivElement>) => {
      if (startY.current == null || refreshing) return;
      const delta = e.touches[0].clientY - startY.current;
      if (delta > 0) setPull(Math.min(delta * 0.45, MAX_PULL));
    },
    [refreshing]
  );

  const onTouchEnd = useCallback(async () => {
    if (startY.current == null) return;
    startY.current = null;
    if (pull >= THRESHOLD) {
      setRefreshing(true);
      setPull(48);
      await onRefresh();
      setRefreshing(false);
    }
    setPull(0);
  }, [pull, onRefresh]);

  return {
    scrollRef,
    pull,
    refreshing,
    handlers: { onTouchStart, onTouchMove, onTouchEnd }
  };
}
