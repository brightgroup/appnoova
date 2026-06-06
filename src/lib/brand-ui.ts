/** Colores de marca Noova — primario #5b5bf6 */
export const brand = {
  primary: "#5b5bf6",
  primaryHover: "#7070f8",
  primaryText: "#ffffff",
  primaryMuted: "rgba(91, 91, 246, 0.12)",
  primaryBorder: "rgba(91, 91, 246, 0.35)",
  /** Fondos mate — de la paleta del usuario (invertidos) */
  bgMain: "#212121",
  bgSurface: "#2d2d2d",
} as const;

/* ── Superficies ── */
export const bgMain = "bg-noova-main";
export const bgSurface = "bg-noova-surface";

/* ── Tipografía — alto contraste ── */
export const textPrimary = "text-white";
export const textSecondary = "text-gray-200";
export const textMuted = "text-gray-300";
export const textFaint = "text-gray-400";

/* ── Botones principales (CTA) ── */
export const btnPrimary =
  "inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold " +
  "bg-[#5b5bf6] text-white hover:bg-[#7070f8] transition-colors " +
  "disabled:opacity-50 disabled:cursor-not-allowed";

export const btnPrimarySm =
  "inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold " +
  "bg-[#5b5bf6] text-white hover:bg-[#7070f8] transition-colors";

/* ── Estilo sidebar / menú — minimalista ── */
export const btnMenu =
  "inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-gray-200 " +
  "hover:text-white hover:bg-white/[.08] transition-colors";

export const btnMenuIcon =
  "p-1.5 rounded-lg text-gray-300 hover:text-white hover:bg-white/[.08] transition-colors";

export const btnIcon =
  "p-2 rounded-lg text-gray-300 hover:text-white hover:bg-white/[.08] transition-colors";

export const btnIconSm =
  "p-1.5 rounded-md text-gray-300 transition-colors " +
  "hover:text-white hover:bg-white/[.08] disabled:text-gray-600 disabled:cursor-not-allowed";

export const btnGhost =
  "inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium " +
  "text-gray-200 hover:text-white hover:bg-white/[.08] transition-colors";

/* ── Filtros (estilo menú) ── */
export const btnFilterGroup =
  "flex rounded-lg border border-white/[.12] overflow-hidden shrink-0 bg-noova-surface";

export const btnFilterActive =
  "px-4 py-2 text-xs font-semibold bg-white/[.12] text-white";

export const btnFilterIdle =
  "px-4 py-2 text-xs font-medium text-gray-300 hover:text-white hover:bg-white/[.06] transition-colors";

/* ── Tabs ── */
export const tabActive = "text-white border-[#5b5bf6]";
export const tabIdle = "text-gray-300 border-transparent hover:text-white";

/* ── Inputs ── */
export const inputSearch =
  "w-full bg-noova-surface border border-white/[.12] rounded-lg pl-10 pr-4 py-2.5 text-sm text-white " +
  "placeholder-gray-400 focus:outline-none focus:border-white/[.22] focus:ring-1 focus:ring-white/[.10] transition-colors";

/* ── Tablas (registro de llamadas / agentes) ── */
export const registryPage =
  "flex-1 flex flex-col min-h-0 bg-noova-main text-white overflow-hidden";

export const registryToolbar =
  "px-5 py-4 border-b border-white/[.10] shrink-0 bg-noova-main";

export const registryTableHead =
  "sticky top-0 z-10 bg-noova-surface border-b border-white/[.12]";

export const registryTableHeadRow =
  "text-gray-300 uppercase tracking-wide text-[10px] font-semibold";

export const registryTableRow =
  "border-b border-white/[.08] hover:bg-white/[.05] cursor-pointer transition-colors group";

export const registryRowIcon =
  "w-8 h-8 rounded-lg bg-noova-surface border border-white/[.12] flex items-center justify-center shrink-0 text-gray-300";

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
