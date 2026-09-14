"use client";

import { useId, type SVGProps } from "react";

const RING_PATH =
  "M178.0 112.0C178.0 116.8 177.8 122.2 177.5 126.3C177.1 130.4 176.6 133.5 175.9 136.8C175.2 140.0 174.3 143.0 173.2 145.9C172.2 148.7 170.9 151.4 169.5 153.9C168.1 156.5 166.5 158.8 164.8 161.1C163.1 163.3 161.2 165.4 159.1 167.3C157.1 169.3 154.8 171.0 152.4 172.7C150.1 174.3 147.5 175.8 144.8 177.1C142.1 178.4 139.2 179.5 136.2 180.5C133.1 181.5 129.9 182.3 126.5 183.0C123.0 183.7 119.7 184.2 115.3 184.5C110.9 184.8 105.1 185.0 100.0 185.0C94.9 185.0 89.1 184.8 84.7 184.5C80.3 184.2 77.0 183.7 73.5 183.0C70.1 182.3 66.9 181.5 63.8 180.5C60.8 179.5 57.9 178.4 55.2 177.1C52.5 175.8 49.9 174.3 47.6 172.7C45.2 171.0 42.9 169.3 40.9 167.3C38.8 165.4 36.9 163.3 35.2 161.1C33.5 158.8 31.9 156.5 30.5 153.9C29.1 151.4 27.8 148.7 26.8 145.9C25.7 143.0 24.8 140.0 24.1 136.8C23.4 133.5 22.9 130.4 22.5 126.3C22.2 122.2 22.0 116.8 22.0 112.0C22.0 107.2 22.2 101.8 22.5 97.7C22.9 93.6 23.4 90.5 24.1 87.2C24.8 84.0 25.7 81.0 26.8 78.1C27.8 75.3 29.1 72.6 30.5 70.1C31.9 67.5 33.5 65.2 35.2 62.9C36.9 60.7 38.8 58.6 40.9 56.7C42.9 54.7 45.2 53.0 47.6 51.3C49.9 49.7 52.5 48.2 55.2 46.9C57.9 45.6 60.8 44.5 63.8 43.5C66.9 42.5 70.1 41.7 73.5 41.0C77.0 40.3 80.3 39.8 84.7 39.5C89.1 39.2 94.9 39.0 100.0 39.0C105.1 39.0 110.9 39.2 115.3 39.5C119.7 39.8 123.0 40.3 126.5 41.0C129.9 41.7 133.1 42.5 136.2 43.5C139.2 44.5 142.1 45.6 144.8 46.9C147.5 48.2 150.1 49.7 152.4 51.3C154.8 53.0 157.1 54.7 159.1 56.7C161.2 58.6 163.1 60.7 164.8 62.9C166.5 65.2 168.1 67.5 169.5 70.1C170.9 72.6 172.2 75.3 173.2 78.1C174.3 81.0 175.2 84.0 175.9 87.2C176.6 90.5 177.1 93.6 177.5 97.7C177.8 101.8 178.0 107.2 178.0 112.0ZM163.0 112.0C163.0 115.8 162.9 120.1 162.6 123.4C162.3 126.7 161.8 129.1 161.3 131.7C160.7 134.3 160.0 136.6 159.1 138.9C158.3 141.2 157.3 143.3 156.2 145.3C155.0 147.3 153.8 149.2 152.3 151.0C150.9 152.8 149.4 154.4 147.7 156.0C146.1 157.5 144.3 158.9 142.4 160.2C140.4 161.5 138.4 162.7 136.2 163.7C134.0 164.7 131.7 165.7 129.2 166.4C126.7 167.2 124.2 167.9 121.4 168.4C118.6 168.9 115.9 169.3 112.4 169.6C108.8 169.9 104.1 170.0 100.0 170.0C95.9 170.0 91.2 169.9 87.6 169.6C84.1 169.3 81.4 168.9 78.6 168.4C75.8 167.9 73.3 167.2 70.8 166.4C68.3 165.7 66.0 164.7 63.8 163.7C61.6 162.7 59.6 161.5 57.6 160.2C55.7 158.9 53.9 157.5 52.3 156.0C50.6 154.4 49.1 152.8 47.7 151.0C46.2 149.2 45.0 147.3 43.8 145.3C42.7 143.3 41.7 141.2 40.9 138.9C40.0 136.6 39.3 134.3 38.7 131.7C38.2 129.1 37.7 126.7 37.4 123.4C37.1 120.1 37.0 115.8 37.0 112.0C37.0 108.2 37.1 103.9 37.4 100.6C37.7 97.3 38.2 94.9 38.7 92.3C39.3 89.7 40.0 87.4 40.9 85.1C41.7 82.8 42.7 80.7 43.8 78.7C45.0 76.7 46.2 74.8 47.7 73.0C49.1 71.2 50.6 69.6 52.3 68.0C53.9 66.5 55.7 65.1 57.6 63.8C59.6 62.5 61.6 61.3 63.8 60.3C66.0 59.3 68.3 58.3 70.8 57.6C73.3 56.8 75.8 56.1 78.6 55.6C81.4 55.1 84.1 54.7 87.6 54.4C91.2 54.1 95.9 54.0 100.0 54.0C104.1 54.0 108.8 54.1 112.4 54.4C115.9 54.7 118.6 55.1 121.4 55.6C124.2 56.1 126.7 56.8 129.2 57.6C131.7 58.3 134.0 59.3 136.2 60.3C138.4 61.3 140.4 62.5 142.4 63.8C144.3 65.1 146.1 66.5 147.7 68.0C149.4 69.6 150.9 71.2 152.3 73.0C153.8 74.8 155.0 76.7 156.2 78.7C157.3 80.7 158.3 82.8 159.1 85.1C160.0 87.4 160.7 89.7 161.3 92.3C161.8 94.9 162.3 97.3 162.6 100.6C162.9 103.9 163.0 108.2 163.0 112.0Z";

export type OriIconState = "idle" | "thinking";
export type OriIconVariant = "solid" | "hole";

interface OriAnimatedIconProps extends SVGProps<SVGSVGElement> {
  /** "idle" = mirada errante + parpadeo suave. "thinking" = escaneo rápido + respiración — mientras Ori genera una respuesta. */
  state?: OriIconState;
  /**
   * "solid" = aro siempre azul (#0f7eff, fijo — no depende de className ni de clases de color del padre) con
   * ojos rellenos según tema (.ori-eye-fill en globals.css) — para usar donde el ícono va suelto (dentro del
   * chat, junto al texto de "pensando") o sobre una insignia propia; el azul del aro nunca se pierde detrás
   * de reglas de tema claro/oscuro del contenedor.
   * "hole" = hereda currentColor y los ojos son un hueco transparente que toma el color de lo que haya
   * detrás — exclusivo del ícono monocromo del menú lateral, que cambia de blanco a negro según tema.
   */
  variant?: OriIconVariant;
}

/** Ícono de Ori animado — mismo trazo que OriIcon.tsx, con los ojos vivos. Ver preview de diseño aprobado por el usuario. */
export function OriAnimatedIcon({ state = "idle", variant = "solid", ...props }: OriAnimatedIconProps) {
  const maskId = useId();
  const lookClass = state === "idle" ? "ori-anim-idle-look" : "ori-anim-think-scan";
  const blinkClass = state === "idle" ? "ori-anim-idle-blink" : "ori-anim-think-blink";
  const breatheClass = state === "thinking" ? "ori-anim-think-breathe" : "";

  const eyes = (
    <g className={lookClass}>
      <g className={blinkClass}>
        <rect x="70" y="89" width="20" height="46" rx="10" fill={variant === "hole" ? "#000" : "currentColor"} className={variant === "solid" ? "ori-eye-fill" : undefined} />
        <rect x="110" y="89" width="20" height="46" rx="10" fill={variant === "hole" ? "#000" : "currentColor"} className={variant === "solid" ? "ori-eye-fill" : undefined} />
      </g>
    </g>
  );

  return (
    <svg viewBox="0 0 200 200" className={breatheClass} {...props}>
      <title>Ori</title>
      {variant === "hole" && (
        <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="200" height="200">
          <rect x="0" y="0" width="200" height="200" fill="#fff" />
          {eyes}
        </mask>
      )}
      <g
        fill={variant === "solid" ? "#0f7eff" : "currentColor"}
        mask={variant === "hole" ? `url(#${maskId})` : undefined}
      >
        <path fillRule="evenodd" d={RING_PATH} />
        <rect x="10" y="94" width="17" height="40" rx="8.5" />
        <rect x="173" y="94" width="17" height="40" rx="8.5" />
        <circle cx="100" cy="24" r="11" />
        <rect x="96" y="24" width="8" height="16" rx="4" />
        {variant === "solid" && eyes}
      </g>
    </svg>
  );
}
