/**
 * Verifica que el crédito cobrado por cada tipo de evento cubra el costo real
 * de proveedor con margen — para no perder plata cuando un turno resulta más
 * caro de lo normal (imagen/PDF pesado en WhatsApp, modelo Claude en vez de
 * Gemini Flash).
 *
 * No toca la base de datos: usa las tarifas y precios por defecto del código
 * (los mismos que aplican si /admin/pricing nunca se ha editado). Si ya
 * ajustaste precios desde el admin, este script no lo refleja — es un chequeo
 * de línea base, no un reemplazo del panel.
 *
 * Uso: npx tsx scripts/billing-cost-check.ts
 */
import { DEFAULT_UNIT_PRICE_META, DEFAULT_PROVIDER_RATES } from "@/lib/billing/pricing-defaults";
import { referenceProviderCostUsd, referenceMarginPct } from "@/lib/billing/reference-margin";
import { llmCostUsd } from "@/lib/billing/pricing";
import { creditsFromUsdPrice } from "@/lib/billing/credit-usd";
import type { UsageEventType } from "@/lib/billing/pricing-types";

const MARGIN_MULTIPLIER = 3; // debe coincidir con DEFAULT_USAGE_MARGIN_MULTIPLIER

const fmtUsd = (n: number) => `$${n.toFixed(6)}`;

function printRow(label: string, priceUsd: number, costUsd: number, extra = "") {
  const marginPct = referenceMarginPct(priceUsd, costUsd);
  const status = marginPct == null ? "—" : marginPct < 0 ? "❌ PIERDE" : marginPct < 30 ? "⚠️  margen bajo" : "✅";
  const marginLabel = marginPct == null ? "—" : `${marginPct}%`;
  console.log(
    `${label.padEnd(38)} precio=${fmtUsd(priceUsd).padEnd(12)} costo=${fmtUsd(costUsd).padEnd(12)} margen=${marginLabel.padEnd(8)} ${status}${extra ? "  " + extra : ""}`
  );
}

console.log("=== 1. Perfiles de referencia por event_type (uso típico, sin medios) ===\n");
for (const unit of DEFAULT_UNIT_PRICE_META) {
  const cost = referenceProviderCostUsd(unit.event_type as UsageEventType, DEFAULT_PROVIDER_RATES);
  printRow(unit.event_type, unit.price_usd, cost);
}

console.log("\n=== 2. Turno de texto (sin medios) con distintos modelos — ¿el precio plano alcanza? ===\n");
console.log("Perfil ~900 in / ~650 out tokens + entrega (2 mensajes Twilio/Meta).\n");

const whatsappAiPrice = DEFAULT_UNIT_PRICE_META.find(u => u.event_type === "whatsapp_ai")!.price_usd;
// El turno real son 2 usage_events (Fase 2): la línea del modelo (cobra el crédito) +
// la línea de entrega Twilio/Meta (creditsOverride: 0). Costo TOTAL = suma de ambas.
const deliveryCostUsd = 2 * DEFAULT_PROVIDER_RATES.twilio_wa_per_msg;

for (const model of ["gemini-2.5-flash", "claude-haiku-4-5", "claude-sonnet-5"] as const) {
  const modelCostUsd = llmCostUsd(model, 900, 650);
  const totalCostUsd = modelCostUsd + deliveryCostUsd;
  const dynamicCredits = creditsFromUsdPrice(modelCostUsd * MARGIN_MULTIPLIER);
  const dynamicUsd = dynamicCredits * 0.0003;
  const coveredByFlat = modelCostUsd <= whatsappAiPrice;
  printRow(
    `whatsapp_ai con ${model}`,
    whatsappAiPrice,
    totalCostUsd,
    coveredByFlat ? "" : `→ piso dinámico cobra ${fmtUsd(dynamicUsd)} (${dynamicCredits} cr) en la línea del modelo`
  );
}

console.log("\n=== 3. whatsapp_media_ai — línea propia de imagen/PDF por WhatsApp ===\n");
const mediaPrice = DEFAULT_UNIT_PRICE_META.find(u => u.event_type === "whatsapp_media_ai")!.price_usd;
const mediaProfile = { promptTokens: 1600, completionTokens: 250 }; // 1 imagen típica

for (const model of ["gemini-2.5-flash", "claude-haiku-4-5", "claude-sonnet-5"] as const) {
  const costUsd = llmCostUsd(model, mediaProfile.promptTokens, mediaProfile.completionTokens);
  const dynamicCredits = creditsFromUsdPrice(costUsd * MARGIN_MULTIPLIER);
  const dynamicUsd = dynamicCredits * 0.0003;
  const coveredByFlat = costUsd <= mediaPrice;
  printRow(
    `whatsapp_media_ai (${model})`,
    mediaPrice,
    costUsd,
    coveredByFlat ? "" : `→ piso dinámico cobra ${fmtUsd(dynamicUsd)} (${dynamicCredits} cr)`
  );
}

console.log(
  "\nNota: las filas con costo > precio plano quedan cubiertas por el piso de margen dinámico\n" +
  "(Fase 4 — src/lib/billing/meter.ts, recordUsage) siempre que el evento no use creditsOverride.\n" +
  "Si algo en la sección 1 sale en ❌ o ⚠️, ajusta el precio en /admin/pricing → Precios al cliente."
);
