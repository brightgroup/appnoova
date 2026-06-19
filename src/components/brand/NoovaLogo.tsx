"use client";

import Image from "next/image";
import { useTheme } from "@/components/theme/ThemeProvider";

interface NoovaLogoProps {
  className?: string;
  /** Ancho del contenedor (altura proporcional) */
  width?: number;
  height?: number;
  priority?: boolean;
}

/** Logo Noova360 — variante según tema (fondo claro u oscuro). */
export function NoovaLogo({
  className = "object-contain object-left",
  width = 176,
  height = 40,
  priority = false,
}: NoovaLogoProps) {
  const { resolved } = useTheme();
  const src = resolved === "dark" ? "/logo-noova-dark.png" : "/logo-noova-light.png";

  return (
    <Image
      src={src}
      alt="Noova 360"
      width={width}
      height={height}
      className={className}
      priority={priority}
    />
  );
}
