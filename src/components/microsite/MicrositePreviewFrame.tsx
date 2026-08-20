"use client";

import { Eye, ExternalLink, Lock, RefreshCw } from "lucide-react";
import { btnPrimary } from "@/lib/brand-ui";

/** Viewport lógico iPhone 17 Pro Max (430 × 932 pt) */
const PRO_MAX_WIDTH = 430;
const PRO_MAX_HEIGHT = 932;
const DISPLAY_SCALE = 0.82;
const BEZEL = 11;

const STATUS_BAR_H = 54;
const STATUS_INSET_X = 20;
const SF = "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif";

function IosStatusBar({ islandW }: { islandW: number }) {
  return (
    <div
      className="absolute top-0 inset-x-0 z-30 pointer-events-none text-black"
      style={{ height: STATUS_BAR_H }}
      aria-hidden
    >
      <div
        className="grid h-full items-center"
        style={{
          gridTemplateColumns: "1fr auto 1fr",
          paddingLeft: STATUS_INSET_X,
          paddingRight: STATUS_INSET_X - 2,
          paddingTop: 15
        }}
      >
        <div />

        <div style={{ width: islandW }} />

        <div className="flex items-center justify-end gap-[5px] justify-self-end">
          <CellularSignal />
          <span
            className="font-semibold leading-none tracking-[-0.02em] -mt-px"
            style={{ fontSize: 13, fontFamily: SF }}
          >
            4G
          </span>
          <BatteryIndicator level={85} />
        </div>
      </div>
    </div>
  );
}

function CellularSignal() {
  return (
    <svg width="18" height="11" viewBox="0 0 18 11" fill="none" className="shrink-0" aria-hidden>
      <rect x="0" y="6.5" width="3" height="4.5" rx="0.6" fill="#000" />
      <rect x="4.5" y="4" width="3" height="7" rx="0.6" fill="#000" />
      <rect x="9" y="1.5" width="3" height="9.5" rx="0.6" fill="#000" fillOpacity="0.28" />
      <rect x="13.5" y="0" width="3" height="11" rx="0.6" fill="#000" fillOpacity="0.28" />
    </svg>
  );
}

function BatteryIndicator({ level }: { level: number }) {
  const pct = Math.max(0, Math.min(100, level));
  const fillW = 19.5 * (pct / 100);

  return (
    <svg width="28" height="13" viewBox="0 0 28 13" fill="none" className="shrink-0" aria-hidden>
      <rect
        x="0.5"
        y="0.5"
        width="23"
        height="12"
        rx="3.4"
        stroke="#000"
        strokeOpacity="0.42"
        strokeWidth="1"
      />
      <rect x="1.75" y="1.75" width={fillW} height="9.5" rx="2.2" fill="#000" />
      <text
        x="12.25"
        y="9.6"
        textAnchor="middle"
        fill={pct > 38 ? "#fff" : "#000"}
        style={{ fontSize: 9.5, fontWeight: 700, fontFamily: SF }}
      >
        {pct}
      </text>
      <path
        d="M25 4.75c.75.5 1.1 1.05 1.1 1.65s-.35 1.15-1.1 1.65"
        stroke="#000"
        strokeOpacity="0.42"
        strokeWidth="1"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

interface MicrositePreviewFrameProps {
  previewUrl: string;
  publicUrl: string;
  previewKey: number;
  saved: boolean;
  onRefresh: () => void;
}

export function MicrositePreviewFrame({
  previewUrl,
  publicUrl,
  previewKey,
  saved,
  onRefresh
}: MicrositePreviewFrameProps) {
  const outerW = Math.round(PRO_MAX_WIDTH * DISPLAY_SCALE + BEZEL * 2);
  const outerH = Math.round(PRO_MAX_HEIGHT * DISPLAY_SCALE + BEZEL * 2);
  const screenW = Math.round(PRO_MAX_WIDTH * DISPLAY_SCALE);
  const islandW = Math.round(screenW * 0.28);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-lg mx-auto px-6 py-8 flex flex-col items-center">
        <div className="flex items-start gap-3 mb-8 w-full max-w-md">
          <div className="w-10 h-10 rounded-xl bg-[#0f7eff]/15 border border-[#0f7eff]/25 flex items-center justify-center shrink-0">
            <Eye className="w-5 h-5 text-[#99c9ff]" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-white leading-snug">
              Así ven tus clientes tu página
            </h2>
            <p className="text-xs text-gray-400 mt-1 leading-relaxed">
              {saved
                ? "Vista móvil en tiempo real. Al guardar cambios, se actualiza aquí."
                : "Guarda los cambios y pulsa Actualizar para ver la versión más reciente."}
            </p>
          </div>
        </div>

        <div
          className="relative shrink-0 rounded-[3.25rem] shadow-2xl shadow-black/60"
          style={{
            width: outerW,
            height: outerH,
            padding: BEZEL,
            background: "linear-gradient(145deg, #4a4a4e 0%, #2c2c2e 45%, #1d1d1f 100%)",
            boxShadow: "0 32px 64px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.12)"
          }}
        >
          {/* Botones laterales */}
          <div className="absolute -left-[2px] top-[22%] w-[3px] h-8 rounded-l-sm bg-[#3a3a3c]" aria-hidden />
          <div className="absolute -left-[2px] top-[32%] w-[3px] h-14 rounded-l-sm bg-[#3a3a3c]" aria-hidden />
          <div className="absolute -left-[2px] top-[44%] w-[3px] h-14 rounded-l-sm bg-[#3a3a3c]" aria-hidden />
          <div className="absolute -right-[2px] top-[28%] w-[3px] h-20 rounded-r-sm bg-[#3a3a3c]" aria-hidden />

          {/* Pantalla */}
          <div
            className="relative w-full h-full overflow-hidden bg-black flex flex-col"
            style={{ borderRadius: screenW * 0.105 }}
          >
            {/* Dynamic Island + barra de estado iOS */}
            <IosStatusBar islandW={islandW} />
            <div
              className="absolute left-1/2 -translate-x-1/2 z-20 bg-black rounded-full pointer-events-none"
              style={{
                top: 11,
                width: islandW,
                height: Math.round(screenW * 0.082)
              }}
              aria-hidden
            />

            {/* Navegador (Safari) dentro del teléfono */}
            <div
              className="shrink-0 z-10 bg-[#f2f2f7] border-b border-black/5 px-2.5 pb-2"
              style={{ paddingTop: STATUS_BAR_H + 6 }}
            >
              <div className="flex items-center gap-1.5 bg-white rounded-[10px] px-2.5 py-1.5 shadow-sm border border-black/[0.06] min-w-0">
                <Lock className="w-3 h-3 text-[#8e8e93] shrink-0" aria-hidden />
                <span className="text-[10px] text-[#3c3c43] truncate font-medium leading-tight">
                  {publicUrl.replace(/^https?:\/\//, "")}
                </span>
              </div>
            </div>

            {/* Contenido del micrositio */}
            <div className="flex-1 min-h-0 relative bg-white">
              <iframe
                key={previewKey}
                title="Vista previa del micrositio"
                src={previewUrl}
                className="absolute inset-0 w-full h-full border-0"
              />
            </div>

            {/* Home indicator */}
            <div className="shrink-0 h-[18px] bg-[#f2f2f7] flex items-center justify-center pb-1">
              <div className="w-28 h-1 rounded-full bg-black/20" aria-hidden />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2 mt-5">
          <button
            type="button"
            onClick={onRefresh}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs bg-white/[.06] hover:bg-white/[.10] text-gray-300 border border-white/[.08]"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Actualizar vista
          </button>
          <a
            href={previewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={`${btnPrimary} text-xs py-2`}
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Abrir en pestaña
          </a>
        </div>
      </div>
    </div>
  );
}
