import { Plug, Webhook } from "lucide-react";
import { GoogleCalendarLogo } from "@/components/icons/brands/GoogleCalendarLogo";
import { GmailLogo } from "@/components/icons/brands/GmailLogo";
import { HubSpotLogo } from "@/components/icons/brands/HubSpotLogo";
import { LaEquidadLogo } from "@/components/icons/brands/LaEquidadLogo";
import { SoftsegurosLogo } from "@/components/icons/brands/SoftsegurosLogo";
import { VerifikLogo } from "@/components/icons/brands/VerifikLogo";
import { PlacApiLogo } from "@/components/icons/brands/PlacApiLogo";

export type ConnectorLogoId =
  | "google-calendar"
  | "gmail"
  | "hubspot"
  | "la-equidad"
  | "softseguros"
  | "verifik"
  | "placapi"
  | "webhook";

/**
 * Fuente única de la marca de cada conector — antes cada pantalla (lista de conectores, modal
 * "explorar", menú rápido de ORI, páginas de detalle) traía su propia copia del ícono con su
 * propio tamaño y su propio color de fondo, y se desincronizaban entre sí. Todos los logos ya
 * traen su color real horneado (nada de currentColor ni de adivinar la clase de color correcta
 * en cada sitio que los usa).
 */
export function ConnectorLogo({ id, className }: { id: string; className?: string }) {
  switch (id) {
    case "google-calendar":
      return <GoogleCalendarLogo className={className} />;
    case "gmail":
      return <GmailLogo className={className} />;
    case "hubspot":
      return <HubSpotLogo className={className} />;
    case "la-equidad":
      return <LaEquidadLogo className={className} />;
    case "softseguros":
      return <SoftsegurosLogo className={className} />;
    case "verifik":
      return <VerifikLogo className={className} />;
    case "placapi":
      return <PlacApiLogo className={className} />;
    case "webhook":
      return <Webhook className={className} />;
    default:
      return <Plug className={className} />;
  }
}

const TILE_SIZE = {
  sm: "w-8 h-8 rounded-lg",
  md: "w-11 h-11 rounded-xl",
  lg: "w-12 h-12 rounded-xl",
  xl: "w-14 h-14 rounded-2xl"
} as const;

const ICON_SIZE = {
  sm: "w-[18px] h-[18px]",
  md: "w-6 h-6",
  lg: "w-7 h-7",
  xl: "w-8 h-8"
} as const;

/**
 * Mismo fondo gris neutro para TODOS los conectores — antes cada uno tenía su propio fondo
 * teñido con su color de marca (bg-[#4285f4]/15, bg-[#ff7a59]/15, etc.), lo que hacía que cada
 * conector se viera distinto en vez de parte de una misma familia de tarjetas.
 */
export function ConnectorIconTile({ id, size = "md" }: { id: string; size?: keyof typeof TILE_SIZE }) {
  return (
    <div className={`${TILE_SIZE[size]} bg-white/[.06] flex items-center justify-center shrink-0`}>
      <ConnectorLogo id={id} className={ICON_SIZE[size]} />
    </div>
  );
}
