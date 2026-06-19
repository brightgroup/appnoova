"use client";

import { useMemo, useState } from "react";
import { Check, ArrowRight, Info } from "lucide-react";
import LeadCaptureButton from "@/components/landing/LeadCaptureButton";

type UsageMode = "text" | "voice";
type TextEstimate = "mix" | "whatsapp";

const AVG_TEXT_MSG_CREDITS = 30;
const WA_IA_CREDITS = 60;
const VOICE_MIN_CREDITS = 350;

const FREE_PLAN = {
  id: "explorador",
  name: "Explorador",
  subtitle: "Prueba sin compromiso · 14 días",
  priceLabel: "Gratis",
  priceSuffix: "Sin tarjeta de crédito",
  credits: 15_000,
  features: [
    "15.000 créditos para probar la plataforma",
    "Agente entrenado, Mi Link e inbox",
    "1 agente de texto",
    "Ideal antes de elegir plan de pago"
  ],
  cta: "Comenzar gratis",
  source: "plan_explorador",
  planInterest: "explorador"
};

const PAID_PLANS_INSURANCE = [
  {
    id: "esencial",
    name: "Esencial",
    subtitle: "Corredor independiente",
    priceLabel: "$82",
    priceSuffix: "USD / mes",
    credits: 350_000,
    voiceCap: 1_000,
    features: [
      "350.000 créditos / mes",
      "Agente entrenado, Mi Link, inbox y agentes",
      "Escaneo, formularios y cotizaciones",
      "WhatsApp con ia (según consumo)",
      "Soporte por chat y correo"
    ],
    cta: "Empezar con Esencial",
    source: "plan_esencial",
    planInterest: "esencial"
  },
  {
    id: "crecimiento",
    name: "Crecimiento",
    subtitle: "Agencia en expansión",
    priceLabel: "$345",
    priceSuffix: "USD / mes",
    credits: 1_500_000,
    voiceCap: 4_285,
    features: [
      "1.500.000 créditos / mes",
      "Agentes de texto ilimitados",
      "Inbox omnicanal",
      "Soporte prioritario",
      "Onboarding WhatsApp sin costo adicional"
    ],
    cta: "Empezar con Crecimiento",
    source: "plan_crecimiento",
    planInterest: "crecimiento"
  },
  {
    id: "escala",
    name: "Escala",
    subtitle: "Operación de alto volumen",
    priceLabel: "$815",
    priceSuffix: "USD / mes",
    credits: 3_800_000,
    voiceCap: 10_850,
    features: [
      "3.800.000 créditos / mes",
      "Todo lo del plan Crecimiento",
      "Soporte dedicado",
      "Onboarding WhatsApp sin costo adicional",
      "Equipos grandes y multi-sucursal"
    ],
    cta: "Empezar con Escala",
    source: "plan_escala",
    planInterest: "escala"
  }
] as const;

const PAID_PLANS_GENERIC = [
  {
    ...PAID_PLANS_INSURANCE[0],
    subtitle: "Equipos pequeños",
    features: [
      "350.000 créditos / mes",
      "Agentes de texto, Mi Link e inbox",
      "Widget web y captación de leads",
      "WhatsApp con ia (según consumo)",
      "Soporte por chat y correo"
    ]
  },
  {
    ...PAID_PLANS_INSURANCE[1],
    subtitle: "Pymes en expansión",
    features: [
      "1.500.000 créditos / mes",
      "Agentes de texto ilimitados",
      "Inbox omnicanal y CRM integrado",
      "Soporte prioritario",
      "Onboarding WhatsApp sin costo adicional"
    ]
  },
  {
    ...PAID_PLANS_INSURANCE[2],
    subtitle: "Operación de alto volumen",
    features: [
      "3.800.000 créditos / mes",
      "Todo lo del plan Crecimiento",
      "Soporte dedicado",
      "Multi-equipo y multi-sucursal",
      "Implementación asistida"
    ]
  }
] as const;

const EXTRA_USAGE_INSURANCE = [
  { label: "WhatsApp manual (inbox)", price: "$30" },
  { label: "Llenado de formatos", price: "$50" },
  { label: "Escaneo de documento (póliza PDF)", price: "$90" },
  { label: "Generación de cotización", price: "$70" },
  { label: "Agente de voz (por minuto)", price: "$350" }
];

const EXTRA_USAGE_GENERIC = [
  { label: "WhatsApp manual (inbox)", price: "$30" },
  { label: "Llenado de formularios", price: "$50" },
  { label: "Procesamiento de documentos", price: "$90" },
  { label: "Cotización asistida por ia", price: "$70" },
  { label: "Agente de voz (por minuto)", price: "$350" }
];

const ENTERPRISE_PLAN = {
  id: "corporativo",
  name: "Corporativo",
  subtitle: "Volumen y requisitos a medida",
  priceLabel: "A convenir",
  priceSuffix: "Cotización con comercial",
  features: [
    "Créditos y consumo de ia negociados según su operación",
    "SLA, soporte dedicado y éxito del cliente (CSM)",
    "Integraciones avanzadas y gobierno de datos",
    "Implementación proyecto a proyecto"
  ],
  cta: "Hablar con ventas",
  source: "plan_corporativo",
  planInterest: "corporativo"
};

function formatVolume(n: number): string {
  return n.toLocaleString("es-CO");
}

function textCreditsPerMsg(estimate: TextEstimate): number {
  return estimate === "whatsapp" ? WA_IA_CREDITS : AVG_TEXT_MSG_CREDITS;
}

function textCapFromCredits(credits: number, estimate: TextEstimate): number {
  return Math.floor(credits / textCreditsPerMsg(estimate));
}

type PaidPlan = {
  id: string;
  name: string;
  subtitle: string;
  priceLabel: string;
  priceSuffix: string;
  credits: number;
  voiceCap: number;
  features: readonly string[];
  cta: string;
  source: string;
  planInterest: string;
};

/** 0 = Esencial, 1 = Crecimiento, 2 = Escala, 3 = Corporativo */
function recommendPaidIndex(
  paidPlans: readonly PaidPlan[],
  mode: UsageMode,
  textEstimate: TextEstimate,
  volume: number
): number {
  if (mode === "voice") {
    const caps = paidPlans.map(p => p.voiceCap);
    if (volume <= caps[0]) return 0;
    if (volume <= caps[1]) return 1;
    if (volume <= caps[2]) return 2;
    return 3;
  }
  const caps = paidPlans.map(p =>
    textCapFromCredits(p.credits, textEstimate)
  );
  if (volume <= caps[0]) return 0;
  if (volume <= caps[1]) return 1;
  if (volume <= caps[2]) return 2;
  return 3;
}

function PlanCardShell({
  children,
  className = "",
  recommended = false
}: {
  children: React.ReactNode;
  className?: string;
  recommended?: boolean;
}) {
  return (
    <div
      className={`relative flex flex-col rounded-2xl border p-6 sm:p-7 transition-all ${className} ${
        recommended
          ? "border-[#5b5bf6]/50 bg-gradient-to-b from-[#5b5bf6]/10 to-transparent shadow-lg shadow-[#5b5bf6]/10 ring-1 ring-[#5b5bf6]/30"
          : "border-white/[.08] bg-white/[.03]"
      }`}
    >
      {recommended && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 text-xs font-semibold rounded-full bg-[#5b5bf6] text-white whitespace-nowrap">
          Recomendado para su uso
        </span>
      )}
      {children}
    </div>
  );
}

export default function PricingSection({
  variant = "generic"
}: {
  variant?: "generic" | "insurance";
}) {
  const [mode, setMode] = useState<UsageMode>("text");
  const [textEstimate, setTextEstimate] = useState<TextEstimate>("mix");
  const [volume, setVolume] = useState(8000);

  const paidPlans = variant === "insurance" ? PAID_PLANS_INSURANCE : PAID_PLANS_GENERIC;
  const extraUsageRows =
    variant === "insurance" ? EXTRA_USAGE_INSURANCE : EXTRA_USAGE_GENERIC;
  const extraUsageIntro =
    variant === "insurance"
      ? "Formularios, documentos, cotizaciones y voz usan el mismo saldo de créditos."
      : "Documentos, formularios, cotizaciones y voz usan el mismo saldo de créditos.";

  const sliderMin = 500;
  const sliderMax = 65000;

  const recommendedIdx = useMemo(
    () => recommendPaidIndex(paidPlans, mode, textEstimate, volume),
    [paidPlans, mode, textEstimate, volume]
  );

  const volumeLabel =
    mode === "text"
      ? textEstimate === "whatsapp"
        ? `${formatVolume(volume)} respuestas ia en WhatsApp / mes`
        : `${formatVolume(volume)} mensajes de texto con ia / mes`
      : `${formatVolume(volume)} minutos ia voz / mes`;

  const estimateHint =
    mode === "text"
      ? textEstimate === "whatsapp"
        ? "Cada respuesta ia en WhatsApp consume 60 créditos ($60)"
        : "Promedio ~$30/msg: mezcla agente interno ($10), Mi Link ($20) y WhatsApp ($60)"
      : null;

  const channelRates = [
    { channel: "Agente interno (copiloto)", credits: 10, price: "$10", highlight: false },
    { channel: "Mi Link (chat web)", credits: 20, price: "$20", highlight: false },
    {
      channel: "WhatsApp con respuesta ia",
      credits: WA_IA_CREDITS,
      price: "$60",
      highlight: textEstimate === "whatsapp"
    },
    {
      channel: "Promedio mix típico",
      credits: AVG_TEXT_MSG_CREDITS,
      price: "~$30",
      highlight: textEstimate === "mix"
    }
  ];

  return (
    <section id="precios" className="relative mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-20 sm:py-24 scroll-mt-20">
      <div className="text-center mb-12">
        <p className="text-xs font-semibold uppercase tracking-widest text-[#5b5bf6] mb-4">
          Planes
        </p>
        <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold leading-tight mb-4">
          Arme su plan según{" "}
          <span className="text-[#a5a5ff]">uso real</span>
        </h2>
        <p className="text-gray-400 max-w-2xl mx-auto text-sm sm:text-base leading-relaxed">
          Estime su volumen mensual. Por defecto usamos un{" "}
          <strong className="text-white">promedio de ~$30 por mensaje</strong> (agente
          interno, Mi Link y WhatsApp). Puede simular{" "}
          <strong className="text-white">solo WhatsApp</strong> para ver el escenario más
          exigente. Un crédito = $1 peso colombiano.
        </p>
      </div>

      {/* Widget: mode + text estimate + slider */}
      <div className="rounded-2xl border border-white/[.08] bg-white/[.03] backdrop-blur p-6 sm:p-8 mb-10">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6">
          <div className="inline-flex p-1 rounded-lg bg-white/[.05] border border-white/[.08] self-start">
            <button
              type="button"
              onClick={() => setMode("text")}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
                mode === "text"
                  ? "bg-[#5b5bf6] text-white shadow-lg shadow-[#5b5bf6]/25"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              Mensajes ia (texto)
            </button>
            <button
              type="button"
              onClick={() => setMode("voice")}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
                mode === "voice"
                  ? "bg-[#5b5bf6] text-white shadow-lg shadow-[#5b5bf6]/25"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              Minutos ia (voz)
            </button>
          </div>

          {mode === "text" && (
            <div className="inline-flex p-1 rounded-lg bg-white/[.05] border border-white/[.08] self-start">
              <button
                type="button"
                onClick={() => setTextEstimate("mix")}
                className={`px-3 py-2 text-xs sm:text-sm font-medium rounded-md transition-all ${
                  textEstimate === "mix"
                    ? "bg-white/10 text-white"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                Mix típico (~$30)
              </button>
              <button
                type="button"
                onClick={() => setTextEstimate("whatsapp")}
                className={`px-3 py-2 text-xs sm:text-sm font-medium rounded-md transition-all ${
                  textEstimate === "whatsapp"
                    ? "bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/30"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                Solo WhatsApp ($60)
              </button>
            </div>
          )}
        </div>

        <div className="mb-2">
          <label htmlFor="volume-slider" className="text-sm text-gray-400 block mb-3">
            Volumen mensual estimado
          </label>
          <input
            id="volume-slider"
            type="range"
            min={sliderMin}
            max={sliderMax}
            step={500}
            value={Math.min(volume, sliderMax)}
            onChange={e => setVolume(Number(e.target.value))}
            className="w-full h-2 rounded-full appearance-none cursor-pointer bg-white/10 accent-[#5b5bf6]"
          />
          <div className="flex justify-between text-xs text-gray-500 mt-2">
            <span>500</span>
            <span>65.000+</span>
          </div>
        </div>

        <p className="text-center text-lg font-semibold text-white mt-6">{volumeLabel}</p>
        {estimateHint && (
          <p className="text-center text-xs text-gray-500 mt-2">{estimateHint}</p>
        )}
      </div>

      {/* Free plan — full width */}
      <PlanCardShell className="mb-5 border-dashed border-white/[.12] bg-white/[.02]">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="flex-1">
            <p className="text-xs font-medium text-[#a5a5ff] uppercase tracking-wide mb-1">
              {FREE_PLAN.subtitle}
            </p>
            <h3 className="text-2xl font-bold mb-2">{FREE_PLAN.name}</h3>
            <p className="text-sm text-gray-400 mb-4">
              <span className="text-3xl font-extrabold text-white mr-2">
                {FREE_PLAN.priceLabel}
              </span>
              {FREE_PLAN.priceSuffix}
              <span className="mx-2 text-gray-600">·</span>
              <span className="text-white font-medium">
                {formatVolume(FREE_PLAN.credits)} créditos
              </span>
              <span className="text-gray-500">
                {" "}
                (~{formatVolume(textCapFromCredits(FREE_PLAN.credits, textEstimate))}{" "}
                {textEstimate === "whatsapp" ? "resp. WA" : "msgs promedio"})
              </span>
            </p>
            <ul className="grid sm:grid-cols-2 gap-2">
              {FREE_PLAN.features.map(f => (
                <li key={f} className="flex gap-2 text-sm text-gray-300">
                  <Check className="w-4 h-4 text-[#5b5bf6] flex-shrink-0 mt-0.5" />
                  {f}
                </li>
              ))}
            </ul>
          </div>
          <LeadCaptureButton
            intent={{
              source: FREE_PLAN.source,
              planInterest: FREE_PLAN.planInterest
            }}
            className="inline-flex items-center justify-center gap-2 shrink-0 px-8 py-3.5 rounded-lg text-sm font-semibold border border-white/[.15] text-white hover:bg-white/[.05] transition-all"
          >
            {FREE_PLAN.cta}
            <ArrowRight className="w-4 h-4" />
          </LeadCaptureButton>
        </div>
      </PlanCardShell>

      {/* Paid plans — 3 columns */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-5">
        {paidPlans.map((plan, idx) => {
          const isRecommended = recommendedIdx === idx;
          const textCap = textCapFromCredits(plan.credits, textEstimate);
          const capLabel =
            mode === "text"
              ? textEstimate === "whatsapp"
                ? `Hasta ~${formatVolume(textCap)} respuestas WA / mes`
                : `Hasta ~${formatVolume(textCap)} msgs texto / mes (promedio)`
              : `Hasta ${formatVolume(plan.voiceCap)} min voz / mes`;

          return (
            <PlanCardShell key={plan.id} recommended={isRecommended}>
              <div className="mb-4">
                <p className="text-xs font-medium text-[#a5a5ff] uppercase tracking-wide mb-1">
                  {plan.subtitle}
                </p>
                <h3 className="text-xl font-bold">{plan.name}</h3>
              </div>

              <div className="mb-4">
                <span className="text-3xl sm:text-4xl font-extrabold tracking-tight">
                  {plan.priceLabel}
                </span>
                <span className="text-sm text-gray-400 ml-2">{plan.priceSuffix}</span>
              </div>

              <p className="text-sm text-gray-300 mb-4">
                <span className="font-semibold text-white">
                  {formatVolume(plan.credits)} créditos
                </span>
                <br />
                <span className="text-gray-500 text-xs mt-1 inline-block">{capLabel}</span>
              </p>

              <ul className="space-y-2.5 mb-6 flex-1">
                {plan.features.map(f => (
                  <li key={f} className="flex gap-2 text-sm text-gray-300">
                    <Check className="w-4 h-4 text-[#5b5bf6] flex-shrink-0 mt-0.5" />
                    {f}
                  </li>
                ))}
              </ul>

              <LeadCaptureButton
                intent={{
                  source: plan.source,
                  planInterest: plan.planInterest
                }}
                className={`inline-flex items-center justify-center gap-2 w-full py-3 px-4 rounded-lg text-sm font-semibold transition-all ${
                  isRecommended
                    ? "bg-[#5b5bf6] text-white hover:bg-[#7070f8] shadow-lg shadow-[#5b5bf6]/20"
                    : "border border-white/[.15] text-white hover:bg-white/[.05]"
                }`}
              >
                {plan.cta}
                <ArrowRight className="w-4 h-4" />
              </LeadCaptureButton>
            </PlanCardShell>
          );
        })}
      </div>

      {/* Enterprise — full width */}
      <PlanCardShell className="mb-12 border-white/[.08] bg-white/[.02]">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="flex-1">
            <p className="text-xs font-medium text-[#a5a5ff] uppercase tracking-wide mb-1">
              {ENTERPRISE_PLAN.subtitle}
            </p>
            <h3 className="text-2xl font-bold mb-2">{ENTERPRISE_PLAN.name}</h3>
            <p className="text-sm text-gray-400 mb-4">
              <span className="text-2xl font-extrabold text-white mr-2">
                {ENTERPRISE_PLAN.priceLabel}
              </span>
              {ENTERPRISE_PLAN.priceSuffix}
            </p>
            <ul className="grid sm:grid-cols-2 gap-2">
              {ENTERPRISE_PLAN.features.map(f => (
                <li key={f} className="flex gap-2 text-sm text-gray-300">
                  <Check className="w-4 h-4 text-[#5b5bf6] flex-shrink-0 mt-0.5" />
                  {f}
                </li>
              ))}
            </ul>
          </div>
          <LeadCaptureButton
            intent={{
              source: ENTERPRISE_PLAN.source,
              planInterest: ENTERPRISE_PLAN.planInterest
            }}
            className="inline-flex items-center justify-center gap-2 shrink-0 px-8 py-3.5 rounded-lg text-sm font-semibold border border-white/[.15] text-white hover:bg-white/[.05] transition-all"
          >
            {ENTERPRISE_PLAN.cta}
            <ArrowRight className="w-4 h-4" />
          </LeadCaptureButton>
        </div>
      </PlanCardShell>

      {/* Other usage */}
      <div className="rounded-2xl border border-white/[.08] bg-white/[.03] p-6 sm:p-8">
        <h3 className="text-lg font-bold mb-2">Otros consumos de créditos</h3>
        <p className="text-sm text-gray-400 mb-6">{extraUsageIntro}</p>
        <div className="grid sm:grid-cols-2 gap-x-8 gap-y-3">
          {extraUsageRows.map(row => (
            <div
              key={row.label}
              className="flex justify-between items-center py-2 border-b border-white/[.06] text-sm text-gray-300"
            >
              <span>{row.label}</span>
              <span className="font-semibold">{row.price}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-500 mt-6">
          Conexión WhatsApp incluida sin cargo adicional en fase de lanzamiento. Use «Mix
          típico» para estimar uso real; «Solo WhatsApp» si casi todo su tráfico será por
          ese canal.
        </p>
      </div>

      {/* Channel rates — al final */}
      <div className="rounded-2xl border border-[#5b5bf6]/20 bg-[#5b5bf6]/5 p-5 sm:p-6 mt-8">
        <div className="flex gap-2 items-start mb-4">
          <Info className="w-4 h-4 text-[#a5a5ff] flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold text-white mb-1">
              Créditos reales por canal
            </h3>
            <p className="text-xs text-gray-400 leading-relaxed">
              {textEstimate === "whatsapp"
                ? "Modo solo WhatsApp: cada respuesta con ia cuesta $60. El agente interno y Mi Link consumen menos si los combina."
                : "El simulador usa ~$30/msg (mix típico). WhatsApp con ia cuesta $60 — use el botón «Solo WhatsApp» para planificar ese escenario."}
            </p>
          </div>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {channelRates.map(row => (
            <div
              key={row.channel}
              className={`rounded-xl px-4 py-3 border ${
                row.highlight
                  ? "border-[#5b5bf6]/40 bg-[#5b5bf6]/10"
                  : "border-white/[.08] bg-white/[.03]"
              }`}
            >
              <p className="text-xs text-gray-400 mb-1">{row.channel}</p>
              <p className="text-lg font-bold text-white">{row.price}</p>
              <p className="text-xs text-gray-500">{row.credits} créditos</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
