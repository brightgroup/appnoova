/** Colores de marca Noova — primario #3b59fe */
export const brand = {
  primary: "#3b59fe",
  primaryHover: "#4d68ff",
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
  "nv-btn-primary inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold " +
  "transition-colors " +
  "disabled:opacity-50 disabled:cursor-not-allowed";

export const btnPrimarySm =
  "nv-btn-primary inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold " +
  "transition-colors";

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
  "text-white bg-[#5b5bf6]/[.14] nv-nav-active";

export const sidebarNavIdle =
  "text-gray-300 hover:text-white hover:bg-white/[.06] nv-nav-idle";

export const sidebarIconActive = "text-[#5b5bf6]";

export const sidebarBadge =
  "nv-tag-neon nv-tag-neon-accent border-0 text-[10px] px-2.5 py-1 rounded-full font-semibold leading-none";

export const copilotBadge =
  "nv-tag-neon nv-tag-neon-accent border-0 text-[11px] px-3 py-1.5 rounded-full font-semibold leading-none";

export const sidebarPlanCard =
  "nv-sidebar-plan-card rounded-xl p-3.5 border transition-all duration-150";

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
  "nv-badge-internal text-xs px-2 py-0.5 rounded-full font-semibold border";

/* ── Tags neón (inbox bandeja, estados, calidad) — semitransparentes + glow ── */
export const tagNeonBase = "nv-tag-neon inline-flex items-center font-semibold";

export const tagNeonEmerald =
  `${tagNeonBase} nv-tag-neon-emerald border-0 bg-emerald-500/20 text-white`;

export const tagNeonViolet =
  `${tagNeonBase} nv-tag-neon-violet border-0 bg-violet-500/20 text-white`;

export const tagNeonSky =
  `${tagNeonBase} nv-tag-neon-sky border-0 bg-sky-500/20 text-white`;

export const tagNeonAmber =
  `${tagNeonBase} nv-tag-neon-amber border-0 bg-violet-500/20 text-white`;

export const tagNeonOrange =
  `${tagNeonBase} nv-tag-neon-orange border-0 bg-violet-500/20 text-white`;

/** Aviso / alerta informativa (URL fija, permisos, etc.) */
export const noticeWarning =
  "nv-notice-green nv-notice-hubspot rounded-2xl border px-5 py-4 text-sm " +
  "dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-200";

/** Tarjeta destacada — fondo verde menta (Pro Tip, promos) */
export const promoCard = "nv-promo-card rounded-2xl p-6";

export const tagNeonAccent =
  `${tagNeonBase} nv-tag-neon-accent border-0 bg-[#5b5bf6]/20 text-white`;

export const tagNeonBlue =
  `${tagNeonBase} nv-tag-neon-blue border-0 bg-blue-500/20 text-white`;

export const accentGradientIcon = "bg-gradient-to-br from-[#5b5bf6] to-[#7070f8]";
export const accentGlow = "bg-[#5b5bf6]/10";
export const accentCard =
  "bg-[#5b5bf6]/10 border border-[#5b5bf6]/20";
export const accentNavActive =
  "bg-[#5b5bf6]/14 text-white border border-[#5b5bf6]/20";

/* ── Inputs ── */
export const nvControl =
  "rounded-xl border border-[var(--nv-input-border)] bg-[var(--nv-bg-control)] text-[var(--nv-text)] " +
  "transition-colors hover:border-[var(--nv-border-strong)] hover:bg-[var(--nv-bg-control-hover)]";

export const inputSearch =
  "nv-search-input w-full bg-[var(--nv-search-bg)] border border-[var(--nv-input-border)] rounded-lg pl-10 pr-4 py-2.5 text-sm text-[var(--nv-text)] " +
  "placeholder-[var(--nv-text-faint)] focus:outline-none focus:border-[#0fe3ff]/50 focus:ring-1 focus:ring-[#0fe3ff]/20 transition-colors";

/** Contenedor del menú desplegable (NoovaSelect) — no usar en tablas */
export const registryListShell =
  "nv-select-menu rounded-xl border border-[var(--nv-border-strong)] bg-[var(--nv-bg-popover)] overflow-hidden shadow-[var(--nv-shadow-lg)]";

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
  "sticky top-0 z-10 nv-table-head";

export const registryTableHeadRow =
  "border-b border-white/[.08]";

export const registryTableHeadCell =
  "px-5 py-3 text-left text-[11px] font-bold uppercase tracking-wide whitespace-nowrap nv-table-head-cell";

export const registrySectionTitle =
  "text-xl font-semibold tracking-tight nv-section-title";

export const nvFieldLabel =
  "block text-xs font-semibold nv-field-label mb-1.5";

export const waTemplateInput =
  `w-full ${nvControl} px-3 py-2.5 text-sm`;

export const registryTableRow =
  "border-b border-white/[.06] hover:bg-white/[.03] transition-colors group registry-table-row";

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
  "flex items-center justify-center w-full pt-4 pb-2 shrink-0";

export const registryRowIcon =
  "text-gray-400 shrink-0";

export const modalOverlay = "fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4";
export const modalPanel =
  "w-full rounded-xl border border-white/[.12] bg-[#12131a] shadow-2xl overflow-hidden";
export const modalPanelSm = "w-full max-w-lg rounded-xl border border-white/[.12] bg-[#12131a] p-5 space-y-4";
export const modalInput =
  "w-full rounded-lg border border-white/[.12] bg-white/[.04] px-3 py-2 text-sm text-white";

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
