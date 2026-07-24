"use client";

import Image from "next/image";

const LOGO_ON_DARK = "/logo-noova-dark.webp";
const LOGO_ON_LIGHT = "/logo-noova-light.png";
const LOGO_SIDEBAR = "/logo-noova-white.webp";

/** Proporción del logo nuevo (1024×220). */
const LOGO_ASPECT = 220 / 1024;

interface NoovaLogoProps {
  className?: string;
  width?: number;
  height?: number;
  priority?: boolean;
  /**
   * `sidebar` — logo claro sobre la barra azul (tema claro del dashboard).
   * `default` — light en tema claro, dark en tema oscuro (`html.dark`).
   */
  variant?: "default" | "sidebar";
}

/** Logo Noova360 — sin useTheme (evita hydration mismatch). */
export function NoovaLogo({
  className = "object-contain object-left",
  width = 176,
  height,
  priority = false,
  variant = "default",
}: NoovaLogoProps) {
  const h = height ?? Math.round(width * LOGO_ASPECT);

  if (variant === "sidebar") {
    return (
      <span className="noova-logo-wrap inline-flex">
        <Image
          src={LOGO_SIDEBAR}
          alt="Noova 360"
          width={width}
          height={h}
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
        height={h}
        className={`noova-logo-light ${className}`}
        priority={priority}
      />
      <Image
        src={LOGO_ON_DARK}
        alt=""
        aria-hidden
        width={width}
        height={h}
        className={`noova-logo-dark ${className}`}
        priority={priority}
        unoptimized
      />
    </span>
  );
}
