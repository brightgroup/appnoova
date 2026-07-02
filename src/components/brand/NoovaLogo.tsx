"use client";

import Image from "next/image";

const LOGO_ON_DARK = "/logo-noova-dark.webp";
const LOGO_ON_LIGHT = "/logo-noova-light.png";
const LOGO_SIDEBAR = "/logo-noova-white.webp";

interface NoovaLogoProps {
  className?: string;
  width?: number;
  height?: number;
  priority?: boolean;
  /**
   * `sidebar` — logo blanco sobre la barra azul (tema claro del dashboard).
   * `default` — light en tema claro, dark en tema oscuro (`html.dark`).
   */
  variant?: "default" | "sidebar";
}

/** Logo Noova360 — sin useTheme (evita hydration mismatch). */
export function NoovaLogo({
  className = "object-contain object-left",
  width = 176,
  height = 40,
  priority = false,
  variant = "default",
}: NoovaLogoProps) {
  if (variant === "sidebar") {
    return (
      <span className="noova-logo-wrap inline-flex">
        <Image
          src={LOGO_SIDEBAR}
          alt="Noova 360"
          width={width}
          height={Math.round(width * (72 / 256))}
          className={`${className} noova-logo-blend`}
          priority={priority}
          unoptimized
        />
      </span>
    );
  }

  return (
    <span className="inline-flex">
      <Image
        src={LOGO_ON_LIGHT}
        alt="Noova 360"
        width={width}
        height={height}
        className={`noova-logo-light ${className}`}
        priority={priority}
      />
      <Image
        src={LOGO_ON_DARK}
        alt=""
        aria-hidden
        width={width}
        height={height}
        className={`noova-logo-dark ${className}`}
        priority={priority}
        unoptimized
      />
    </span>
  );
}
