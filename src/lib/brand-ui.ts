/** Colores de marca Noova — cyan neón del logo */
export const brand = {
  neon: "#00e8b5",
  neonHover: "#2dffd0",
  neonText: "#041410",
  neonMuted: "rgba(0, 232, 181, 0.12)",
  neonBorder: "rgba(0, 232, 181, 0.35)",
  neonGlow: "0 0 20px rgba(0, 232, 181, 0.25)"
} as const;

export const btnPrimary =
  "inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold " +
  "bg-[#00e8b5] text-[#041410] hover:bg-[#2dffd0] transition-colors " +
  "disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_16px_rgba(0,232,181,0.2)]";

export const btnPrimarySm =
  "inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold " +
  "bg-[#00e8b5] text-[#041410] hover:bg-[#2dffd0] transition-colors";

export const btnGhost =
  "inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium " +
  "border border-white/[.10] text-gray-300 hover:bg-white/[.04] hover:text-white transition-colors";

export const btnFilterActive =
  "px-4 py-2 text-xs font-semibold bg-[#00e8b5] text-[#041410]";

export const btnFilterIdle =
  "px-4 py-2 text-xs font-medium bg-[#111] text-gray-400 hover:text-white";

export const inputSearch =
  "w-full bg-[#111] border border-[#00e8b5]/30 rounded-lg pl-10 pr-4 py-2.5 text-sm text-white " +
  "placeholder-gray-600 focus:outline-none focus:border-[#00e8b5]/55 focus:ring-1 focus:ring-[#00e8b5]/20";

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
