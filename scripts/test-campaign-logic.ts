/**
 * Pruebas de lógica pura del módulo de campañas:
 * reintentos, número inválido, validación de campos de salida y defaults por tipo.
 *
 * Uso: npx tsx --env-file=.env.local scripts/test-campaign-logic.ts
 */
import {
  dispositionFromPlacementError,
  resolveAudienceStatusAfterAttempt,
} from "../src/lib/call-engine/campaign-audience-status";
import {
  defaultCrmConfig,
  validateOutputFields,
  withFieldKeys,
  isContactLinkCompatible,
} from "../src/lib/campaigns/output-fields";
import type { CampaignOutputField } from "../src/types/voice-campaign";

function assert(cond: boolean, label: string) {
  if (cond) console.log(`  ✓ ${label}`);
  else {
    console.error(`  ✗ FALLO: ${label}`);
    process.exitCode = 1;
  }
}

console.log("— Reintentos y disposiciones —");
const retry = resolveAudienceStatusAfterAttempt({
  disposition: "no_answer",
  attempts: 1,
  maxAttempts: 3,
  retryGapMinutes: 180,
});
assert(retry.call_status === "retry" && retry.scheduled_call_at != null, "no contesta con intentos restantes → retry programado");

const exhausted = resolveAudienceStatusAfterAttempt({
  disposition: "no_answer",
  attempts: 3,
  maxAttempts: 3,
  retryGapMinutes: 180,
});
assert(exhausted.call_status === "no_answer", "intentos agotados → no contactable (terminal)");

const invalid = resolveAudienceStatusAfterAttempt({
  disposition: "invalid",
  attempts: 1,
  maxAttempts: 3,
  retryGapMinutes: 180,
});
assert(invalid.call_status === "invalid" && invalid.scheduled_call_at === null, "número inválido → terminal, sin reintento");

assert(dispositionFromPlacementError("The number +57xxx is invalid") === "invalid", "error 'invalid' → invalid");
assert(dispositionFromPlacementError("Unallocated number") === "invalid", "error 'unallocated' → invalid");
assert(dispositionFromPlacementError("Line busy") === "busy", "error 'busy' → busy");

console.log("\n— Validación de campos de salida —");
const fields: CampaignOutputField[] = withFieldKeys([
  {
    key: "",
    label: "Estado del proceso",
    field_type: "select",
    options: ["Visita agendada", "Interesado sin fecha", "No interesado"],
    ai_instruction: "Clasifica el estado final del proceso de compra",
    required: true,
    is_primary: true,
    contact_link: null,
  },
  {
    key: "",
    label: "Requiere financiación",
    field_type: "boolean",
    options: [],
    ai_instruction: "¿La persona mencionó necesitar financiación?",
    required: false,
    is_primary: false,
    contact_link: null,
  },
  {
    key: "",
    label: "Fecha de visita",
    field_type: "date",
    options: [],
    ai_instruction: "Fecha acordada para la visita",
    required: false,
    is_primary: false,
    contact_link: { contact_field: "metadata.fecha_visita", mode: "fill_empty" },
  },
]);

assert(validateOutputFields(fields, { requirePrimary: true }) === null, "set válido con tipificación principal");
assert(fields[0].key === "estado_del_proceso", "key derivada del label");

const noPrimary = fields.map(f => ({ ...f, is_primary: false }));
assert(
  validateOutputFields(noPrimary, { requirePrimary: true }) !== null,
  "sin tipificación principal → error al activar"
);

const badPrimary = fields.map((f, i) => ({ ...f, is_primary: i === 1 }));
assert(validateOutputFields(badPrimary) !== null, "tipificación principal no-lista → error");

const shortSelect = [{ ...fields[0], options: ["Solo una"] }];
assert(validateOutputFields(shortSelect) !== null, "lista con <2 opciones → error");

console.log("\n— Compatibilidad de vínculos con la ficha —");
assert(isContactLinkCompatible("select", "select", ["A", "B"], ["a", "b", "c"]), "lista → lista con mismas opciones");
assert(!isContactLinkCompatible("select", "select", ["A", "X"], ["a", "b"]), "lista → lista con opciones distintas: no");
assert(isContactLinkCompatible("select", "text", ["A"], []), "lista → texto: sí");
assert(isContactLinkCompatible("boolean", "boolean", [], []), "sí/no → sí/no");
assert(!isContactLinkCompatible("boolean", "text", [], []), "sí/no → texto: no");
assert(isContactLinkCompatible("date", "date", [], []), "fecha → fecha");
assert(!isContactLinkCompatible("date", "text", [], []), "fecha → texto: no");

console.log("\n— Defaults por tipo de campaña —");
assert(defaultCrmConfig("prospeccion").create_leads === "on_interest", "prospección → leads al detectar interés");
assert(defaultCrmConfig("seguimiento").create_leads === "on_import", "seguimiento → leads al importar");
assert(defaultCrmConfig("encuesta").create_leads === "never", "encuesta → nunca");
assert(defaultCrmConfig("notificacion").create_leads === "never", "notificación → nunca");

console.log("\nListo.");
