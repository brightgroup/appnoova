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
  "inline-flex rounded-lg border border-white/[.12] overflow-hidden shrink-0 bg-noova-surface";

export const btnFilterActive =
  "px-3 sm:px-4 py-2 text-xs font-semibold bg-white/[.12] text-white whitespace-nowrap shrink-0";

export const btnFilterIdle =
  "px-3 sm:px-4 py-2 text-xs font-medium text-gray-300 hover:text-white hover:bg-white/[.06] transition-colors whitespace-nowrap shrink-0";

/* ── Tabs ── */
export const tabActive = "text-white border-[#5b5bf6]";
export const tabIdle = "text-gray-300 border-transparent hover:text-white";

/* ── Sidebar — acento azul vivo, minimalista ── */
export const sidebarNavActive =
  "text-white bg-[#5b5bf6]/[.14]";

export const sidebarNavIdle =
  "text-gray-300 hover:text-white hover:bg-white/[.06]";

export const sidebarIconActive = "text-[#5b5bf6]";

export const sidebarBadge =
  "text-[10px] px-1.5 py-0.5 rounded-md bg-[#5b5bf6] text-white font-medium leading-none";

export const sidebarPlanCard =
  "rounded-lg p-3 bg-white/[.04]";

/* ── Acento de marca (reemplaza violet/indigo en toda la app) ── */
export const accentText = "text-[#5b5bf6]";
export const accentTextHover = "hover:text-[#7070f8]";
export const accentTextLight = "text-[#a5a5ff]";
export const accentBgSubtle = "bg-[#5b5bf6]/10";
export const accentBgMedium = "bg-[#5b5bf6]/14";
export const accentBorder = "border-[#5b5bf6]/20";
export const accentBorderMedium = "border-[#5b5bf6]/30";
export const accentFocus =
  "focus:border-[#5b5bf6]/50 focus:ring-1 focus:ring-[#5b5bf6]/20 focus:outline-none";
export const accentBadge =
  "text-xs px-2 py-0.5 rounded-full bg-[#5b5bf6]/14 text-[#a5a5ff]";
export const accentGradientIcon = "bg-gradient-to-br from-[#5b5bf6] to-[#7070f8]";
export const accentGlow = "bg-[#5b5bf6]/10";
export const accentCard =
  "bg-[#5b5bf6]/10 border border-[#5b5bf6]/20";
export const accentNavActive =
  "bg-[#5b5bf6]/14 text-white border border-[#5b5bf6]/20";

/* ── Inputs ── */
export const inputSearch =
  "w-full bg-noova-surface border border-white/[.12] rounded-lg pl-10 pr-4 py-2.5 text-sm text-white " +
  "placeholder-gray-400 focus:outline-none focus:border-white/[.22] focus:ring-1 focus:ring-white/[.10] transition-colors";

/** Contenedor del menú desplegable (NoovaSelect) — no usar en tablas */
export const registryListShell =
  "rounded-xl border border-white/[.12] bg-noova-surface overflow-hidden shadow-2xl";

/* ── Tablas (registro de llamadas / agentes) — sin recuadros, solo líneas horizontales ── */
export const registryPage =
  "flex-1 flex flex-col min-h-0 bg-noova-main text-white overflow-hidden";

/** Admin — scroll en main, sin contenedor interno estrecho */
export const adminRegistryPage =
  "flex-1 flex flex-col bg-noova-main text-white min-h-full";

export const registryToolbar =
  "px-5 py-4 border-b border-white/[.08] shrink-0 bg-noova-main";

export const registryContent =
  "flex-1 overflow-y-auto p-6 min-h-0";

export const adminRegistryContent =
  "p-6";

/** Contenedor interno del panel — mismo layout que Números de prueba */
export const registryPanel =
  "flex flex-col";

export const registryDescription =
  "text-sm text-gray-200 leading-relaxed mb-5 max-w-3xl";

export const registrySearchRow =
  "flex flex-wrap items-center gap-3 mb-4";

export const registryTableArea =
  "min-w-0 overflow-x-auto overflow-y-visible";

export const registryTableWrap =
  "flex-1 min-h-0 min-w-0 overflow-x-auto overflow-y-auto";

export const registryTable =
  "w-full border-collapse text-xs";

export const registryTableHead =
  "sticky top-0 z-10 bg-noova-main";

export const registryTableHeadRow =
  "border-b border-white/[.08]";

export const registryTableHeadCell =
  "px-5 py-3 text-left text-xs font-semibold text-white whitespace-nowrap";

export const registryTableRow =
  "border-b border-white/[.06] hover:bg-white/[.03] transition-colors group";

export const registryTableRowClickable =
  "border-b border-white/[.06] hover:bg-white/[.03] cursor-pointer transition-colors group";

export const registryTableRowSelected =
  "bg-[#5b5bf6]/[.08]";

export const registryTableCellFirst =
  "px-5 py-3.5";

export const registryTableCell =
  "px-4 py-3.5";

export const registryTableCellMuted =
  "px-4 py-3.5 text-gray-300";

export const registryTableCellRight =
  "px-4 py-3.5 text-right";

export const registryTableLoading =
  "flex items-center justify-center py-20 text-gray-400";

export const registryTableEmpty =
  "py-20 text-center text-sm text-gray-400";

export const registryTableFooter =
  "flex items-center justify-between gap-4 mt-4 text-xs text-gray-400 shrink-0";

export const registryRowIcon =
  "text-gray-400 shrink-0";

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
