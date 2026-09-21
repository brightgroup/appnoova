"use client";

import { useEffect } from "react";

/**
 * Las barras de scroll quedan invisibles hasta que algo se desplaza: marca el
 * documento mientras dura el scroll y lo limpia poco después. El estilo vive
 * en globals.css (`html.nv-scrolling`), aquí solo se enciende y se apaga.
 *
 * El listener va en captura para enterarse del scroll de cualquier contenedor
 * interno, no solo del de la página, y es pasivo para no estorbar al navegador.
 */
export function ScrollbarAutoHide() {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    const onScroll = () => {
      document.documentElement.classList.add("nv-scrolling");
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        document.documentElement.classList.remove("nv-scrolling");
      }, 900);
    };

    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => {
      document.removeEventListener("scroll", onScroll, { capture: true });
      if (timer) clearTimeout(timer);
      document.documentElement.classList.remove("nv-scrolling");
    };
  }, []);

  return null;
}
