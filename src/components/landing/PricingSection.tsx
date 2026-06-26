"use client";

import { useMemo, useState } from "react";
import { Check, ArrowRight, Info } from "lucide-react";
import LeadCaptureButton from "@/components/landing/LeadCaptureButton";
import { usePricingCatalog, type PricingCatalog } from "@/hooks/usePricingCatalog";

type UsageMode = "text" | "voice";
type TextEstimate = "mix" | "whatsapp";

const WA_IA_CREDITS_FALLBACK = 60;
const VOICE_MIN_CREDITS_FALLBACK = 870;

function unitCredits(catalog: PricingCatalog | null, eventType: string, fallback: number): number {
  return catalog?.unit_prices.find((u) => u.event_type === eventType)?.credits ?? fallback;
}

type PlanMeta = {
  id: string;
  subtitle: string;
  priceSuffix: string;
  featuresTail: readonly string[];
  cta: string;
  source: string;
  planInterest: string;
};

const FREE_PLAN_META = {
  subtitle: "Prueba sin compromiso · 14 días",
  priceLabel: "Gratis",
  priceSuffix: "Sin tarjeta de crédito",
  featuresTail: [
    "Agente entrenado, Mi Link e inbox",
    "1 agente de texto",
    "Ideal antes de elegir plan de pago",
  ],
  cta: "Comenzar gratis",
  source: "plan_explorador",
  planInterest: "explorador",
};

const PAID_PLAN_META_INSURANCE = [
  {
    id: "esencial",
    subtitle: "Corredor independiente",
    priceSuffix: "USD / mes",
    featuresTail: [
      "Hasta 5 usuarios",
      "CRM, contactos y leads con ia",
      "Agentes de texto, Mi Link e inbox",
      "WhatsApp con ia (según consumo)",
      "Soporte por chat y correo",
    ],
    cta: "Empezar con Esencial",
    source: "plan_esencial",
    planInterest: "esencial",
  },
  {
    id: "crecimiento",
    subtitle: "Agencia en expansión",
    priceSuffix: "USD / mes",
    featuresTail: [
      "Hasta 15 usuarios",
      "Misma plataforma: CRM, inbox y agentes ia",
      "WhatsApp con ia (según consumo)",
      "Soporte prioritario",
      "Onboarding WhatsApp sin costo adicional",
    ],
    cta: "Empezar con Crecimiento",
    source: "plan_crecimiento",
    planInterest: "crecimiento",
  },
  {
    id: "escala",
    subtitle: "Operación de alto volumen",
    priceSuffix: "USD / mes",
    featuresTail: [
      "Usuarios ilimitados",
      "Misma plataforma: CRM, inbox y agentes ia",
      "WhatsApp con ia (según consumo)",
      "Soporte dedicado",
      "Onboarding WhatsApp sin costo adicional",
    ],
    cta: "Empezar con Escala",
    source: "plan_escala",
    planInterest: "escala",
  },
] as const satisfies readonly PlanMeta[];

const PAID_PLAN_META_GENERIC: readonly PlanMeta[] = [
  { ...PAID_PLAN_META_INSURANCE[0], subtitle: "Equipos pequeños" },
  { ...PAID_PLAN_META_INSURANCE[1], subtitle: "Pymes en expansión" },
  { ...PAID_PLAN_META_INSURANCE[2], subtitle: "Operación de alto volumen" },
] as const satisfies readonly PlanMeta[];

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

function textCreditsPerMsg(estimate: TextEstimate, waCredits: number, avgMix: number): number {
  return estimate === "whatsapp" ? waCredits : avgMix;
}

function textCapFromCredits(
  credits: number,
  estimate: TextEstimate,
  waCredits: number,
  avgMix: number
): number {
  return Math.floor(credits / textCreditsPerMsg(estimate, waCredits, avgMix));
}

function buildPaidPlans(
  catalog: PricingCatalog | null,
  metaList: readonly PlanMeta[],
  voiceStdCredits: number
): PaidPlan[] {
  return metaList.map((meta) => {
    const fromDb = catalog?.plans.find((p) => p.id === meta.id);
    const credits = fromDb?.monthly_credits ?? 0;
    const priceUsd = fromDb?.price_usd ?? 0;
    return {
      id: meta.id,
      name: fromDb?.name ?? meta.id,
      subtitle: meta.subtitle,
      priceLabel: `$${priceUsd}`,
      priceSuffix: meta.priceSuffix,
      credits,
      voiceCap: voiceStdCredits > 0 ? Math.floor(credits / voiceStdCredits) : 0,
      features: [`${formatVolume(credits)} créditos / mes`, ...meta.featuresTail],
      cta: meta.cta,
      source: meta.source,
      planInterest: meta.planInterest,
    };
  });
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
  volume: number,
  waCredits: number,
  avgMix: number
): number {
  if (mode === "voice") {
    const caps = paidPlans.map((p) => p.voiceCap);
    if (volume <= caps[0]) return 0;
    if (volume <= caps[1]) return 1;
    if (volume <= caps[2]) return 2;
    return 3;
  }
  const caps = paidPlans.map((p) => textCapFromCredits(p.credits, textEstimate, waCredits, avgMix));
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
  const { catalog } = usePricingCatalog();

  const oriCredits = unitCredits(catalog, "ori", 10);
  const milinkCredits = unitCredits(catalog, "milink", 20);
  const waIaCredits = unitCredits(catalog, "whatsapp_ai", WA_IA_CREDITS_FALLBACK);
  const waManualCredits = unitCredits(catalog, "whatsapp_manual", 30);
  const formCredits = unitCredits(catalog, "form_fill", 50);
  const docCredits = unitCredits(catalog, "doc_scan", 90);
  const quoteCredits = unitCredits(catalog, "quote", 70);
  const voiceStdCredits = catalog?.voice_standard_per_min ?? VOICE_MIN_CREDITS_FALLBACK;
  const avgMixCredits = Math.round((oriCredits + milinkCredits + waIaCredits) / 3);

  const paidPlanMeta = variant === "insurance" ? PAID_PLAN_META_INSURANCE : PAID_PLAN_META_GENERIC;
  const paidPlans = useMemo(
    () => buildPaidPlans(catalog, paidPlanMeta, voiceStdCredits),
    [catalog, paidPlanMeta, voiceStdCredits]
  );

  const freePlan = useMemo(() => {
    const fromDb = catalog?.plans.find((p) => p.id === "explorador");
    const credits = fromDb?.monthly_credits ?? 14_562;
    return {
      id: "explorador",
      name: fromDb?.name ?? "Explorador",
      credits,
      features: [
        `${formatVolume(credits)} créditos para probar la plataforma`,
        ...FREE_PLAN_META.featuresTail,
      ],
      ...FREE_PLAN_META,
    };
  }, [catalog]);

  const extraUsageRows = useMemo(() => {
    const voiceLabel = `${formatVolume(voiceStdCredits)} créditos`;
    if (variant === "insurance") {
      return [
        { label: "WhatsApp manual (inbox)", price: `${waManualCredits} créditos` },
        { label: "Llenado de formatos", price: `${formCredits} créditos` },
        { label: "Escaneo de documento (póliza PDF)", price: `${docCredits} créditos` },
        { label: "Generación de cotización", price: `${quoteCredits} créditos` },
        { label: "Agente de voz (por minuto)", price: voiceLabel },
      ];
    }
    return [
      { label: "WhatsApp manual (inbox)", price: `${waManualCredits} créditos` },
      { label: "Llenado de formularios", price: `${formCredits} créditos` },
      { label: "Procesamiento de documentos", price: `${docCredits} créditos` },
      { label: "Cotización asistida por ia", price: `${quoteCredits} créditos` },
      { label: "Agente de voz (por minuto)", price: voiceLabel },
    ];
  }, [variant, waManualCredits, formCredits, docCredits, quoteCredits, voiceStdCredits]);
  const extraUsageIntro =
    variant === "insurance"
      ? "Formularios, documentos, cotizaciones y voz usan el mismo saldo de créditos."
      : "Documentos, formularios, cotizaciones y voz usan el mismo saldo de créditos.";

  const sliderMin = 500;
  const sliderMax = 65000;

  const recommendedIdx = useMemo(
    () => recommendPaidIndex(paidPlans, mode, textEstimate, volume, waIaCredits, avgMixCredits),
    [paidPlans, mode, textEstimate, volume, waIaCredits, avgMixCredits]
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
        ? `Cada respuesta ia en WhatsApp consume ${formatVolume(waIaCredits)} créditos`
        : `Promedio ~${avgMixCredits} cr/mensaje: ORI (${oriCredits}), Mi Link (${milinkCredits}), WhatsApp ia (${waIaCredits})`
      : null;

  const channelRates = [
    { channel: "Agente interno (copiloto)", credits: oriCredits, highlight: false },
    { channel: "Mi Link (chat web)", credits: milinkCredits, highlight: false },
    {
      channel: "WhatsApp con respuesta ia",
      credits: waIaCredits,
      highlight: textEstimate === "whatsapp",
    },
    {
      channel: "Promedio mix típico",
      credits: avgMixCredits,
      highlight: textEstimate === "mix",
    },
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
          <strong className="text-white">promedio de ~{avgMixCredits} créditos por mensaje</strong> (agente
          interno, Mi Link y WhatsApp). Puede simular{" "}
          <strong className="text-white">solo WhatsApp</strong> para ver el escenario más
          exigente. Los créditos están anclados en USD; la TRM es solo referencia en pesos.
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
                Mix típico (~{avgMixCredits} cr)
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
                Solo WhatsApp ({waIaCredits} cr)
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
              {freePlan.subtitle}
            </p>
            <h3 className="text-2xl font-bold mb-2">{freePlan.name}</h3>
            <p className="text-sm text-gray-400 mb-4">
              <span className="text-3xl font-extrabold text-white mr-2">
                {freePlan.priceLabel}
              </span>
              {freePlan.priceSuffix}
              <span className="mx-2 text-gray-600">·</span>
              <span className="text-white font-medium">
                {formatVolume(freePlan.credits)} créditos
              </span>
              <span className="text-gray-500">
                {" "}
                (~{formatVolume(textCapFromCredits(freePlan.credits, textEstimate, waIaCredits, avgMixCredits))}{" "}
                {textEstimate === "whatsapp" ? "resp. WA" : "msgs promedio"})
              </span>
            </p>
            <ul className="grid sm:grid-cols-2 gap-2">
              {freePlan.features.map((f) => (
                <li key={f} className="flex gap-2 text-sm text-gray-300">
                  <Check className="w-4 h-4 text-[#5b5bf6] flex-shrink-0 mt-0.5" />
                  {f}
                </li>
              ))}
            </ul>
          </div>
          <LeadCaptureButton
            intent={{
              source: freePlan.source,
              planInterest: freePlan.planInterest,
            }}
            className="inline-flex items-center justify-center gap-2 shrink-0 px-8 py-3.5 rounded-lg text-sm font-semibold border border-white/[.15] text-white hover:bg-white/[.05] transition-all"
          >
            {freePlan.cta}
            <ArrowRight className="w-4 h-4" />
          </LeadCaptureButton>
        </div>
      </PlanCardShell>

      {/* Paid plans — 3 columns */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-5">
        {paidPlans.map((plan, idx) => {
          const isRecommended = recommendedIdx === idx;
          const textCap = textCapFromCredits(plan.credits, textEstimate, waIaCredits, avgMixCredits);
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
                ? `Modo solo WhatsApp: cada respuesta con ia cuesta ${formatVolume(waIaCredits)} créditos. ORI y Mi Link consumen menos si los combina.`
                : `El simulador usa ~${avgMixCredits} cr/mensaje (mix típico). WhatsApp con ia cuesta ${waIaCredits} cr — use «Solo WhatsApp» para ese escenario.`}
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
              <p className="text-lg font-bold text-white">{formatVolume(row.credits)}</p>
              <p className="text-xs text-gray-500">créditos</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
