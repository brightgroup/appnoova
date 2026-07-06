/**
 * Prueba local del cruce CRM en importación de audiencia (aceptación #1 y #2 del doc).
 * Crea contactos de prueba, ejecuta analyze + commit, verifica conteos y limpia todo.
 *
 * Uso: npx tsx --env-file=.env.local scripts/test-campaign-import.ts
 */
import { createClient } from "@supabase/supabase-js";
import { analyzeAudienceAgainstCrm, commitAudienceImport } from "../src/lib/campaigns/import-contacts";
import type { CampaignFieldMapping } from "../src/types/voice-campaign";

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const TAG = "test_import_070";

function assert(cond: boolean, label: string) {
  if (cond) console.log(`  ✓ ${label}`);
  else {
    console.error(`  ✗ FALLO: ${label}`);
    process.exitCode = 1;
  }
}

async function main() {
  // Usuario de referencia: el dueño de la primera campaña (o del primer contacto).
  const { data: anyCampaign } = await db
    .from("voice_campaigns")
    .select("user_id, organization_id")
    .limit(1)
    .maybeSingle();
  if (!anyCampaign) throw new Error("No hay campañas para tomar user_id de referencia");
  const userId = String(anyCampaign.user_id);
  const orgId = String(anyCampaign.organization_id);
  console.log("Usuario de prueba:", userId);

  // Limpieza previa de corridas anteriores.
  await db.from("crm_contacts").delete().eq("user_id", userId).contains("tags", [TAG]);

  // 4 contactos existentes (uno con "no contactar").
  const now = new Date().toISOString();
  const existingPhones = ["+573990000001", "+573990000002", "+573990000003", "+573990000004"];
  const { error: insErr } = await db.from("crm_contacts").insert(
    existingPhones.map((phone, i) => ({
      user_id: userId,
      name: `Test Existente ${i + 1}`,
      telefono: phone,
      phone,
      tipo_contacto: "persona",
      tipo_relacion: "prospecto",
      tags: [TAG],
      supresiones: i === 3 ? ["no_llamadas"] : [],
      categorias_interes: [],
      metadata: {},
      field_provenance: {},
      created_at: now,
      updated_at: now,
    }))
  );
  if (insErr) throw new Error("Insert contactos: " + insErr.message);

  // Excel simulado: 4 existentes + 4 nuevos + 1 inválido + 1 repetido = 10 filas.
  const rows = [
    { Nombre: "Test Existente 1", Telefono: "573990000001", Correo: "e1@test.com" },
    { Nombre: "Test Existente 2", Telefono: "+57 399 000 0002", Correo: "" },
    { Nombre: "Test Existente 3", Telefono: "3990000003", Correo: "e3@test.com" },
    { Nombre: "Test Existente 4 (no contactar)", Telefono: "3990000004", Correo: "" },
    { Nombre: "Test Nuevo 1", Telefono: "3990000011", Correo: "n1@test.com" },
    { Nombre: "Test Nuevo 2", Telefono: "399-000-0012", Correo: "" },
    { Nombre: "Test Nuevo 3", Telefono: "+573990000013", Correo: "" },
    { Nombre: "Test Nuevo 4", Telefono: "3990000014", Correo: "" },
    { Nombre: "Inválido", Telefono: "abc", Correo: "" },
    { Nombre: "Repetido de Nuevo 1", Telefono: "3990000011", Correo: "" },
  ] as Record<string, string | number | boolean | null>[];

  const mapping: CampaignFieldMapping = {
    phone_column: "Telefono",
    name_column: "Nombre",
    call_date_column: null,
    custom_fields: [],
    contact_fields: [{ column_key: "Correo", contact_field: "email" }],
  };

  console.log("\n— Análisis contra CRM —");
  const { analyzed, summary } = await analyzeAudienceAgainstCrm(db, userId, rows, mapping);
  console.log(JSON.stringify(summary, null, 2));

  assert(summary.total_rows === 10, "10 filas totales");
  assert(summary.duplicates_in_file === 1, "1 teléfono repetido en el archivo");
  assert(summary.invalid_phone === 1, "1 teléfono inválido");
  assert(summary.existing_contacts === 3, "3 existentes contactables");
  assert(summary.new_contacts === 4, "4 nuevos");
  assert(summary.suppressed === 1, "1 excluido por no contactar");

  console.log("\n— Commit de importación (política: llenar vacíos) —");
  const commit = await commitAudienceImport({
    db,
    userId,
    organizationId: orgId,
    campaignId: "00000000-0000-0000-0000-000000000000",
    campaignName: "Prueba Import 070",
    audienceTableId: "00000000-0000-0000-0000-000000000000",
    analyzed,
    mapping,
    policy: "fill_empty",
    scheduledCallAtFor: () => null,
  });

  assert(commit.createdContacts === 4, "4 contactos creados");
  assert(commit.linkedContacts === 3, "3 contactos vinculados");
  assert(commit.suppressed === 1, "1 excluido por no contactar");
  assert(commit.enrolled === 7, "7 prospectos inscritos (pending)");
  assert(
    commit.rowsPayload.filter(r => r.call_status === "skipped").length === 1,
    "1 fila skipped (no contactar)"
  );
  assert(commit.rowsPayload.length === 8, "8 filas de audiencia (sin inválido ni duplicado)");

  // fill_empty: el correo del Excel debe haber llenado el email vacío del Existente 2… no,
  // Existente 2 no trae correo. Existente 1 sí (e1@test.com).
  const { data: e1 } = await db
    .from("crm_contacts")
    .select("email, fuente_origen")
    .eq("user_id", userId)
    .eq("telefono", "+573990000001")
    .maybeSingle();
  assert(e1?.email === "e1@test.com", "fill_empty llenó el email vacío del existente");

  const { data: n1 } = await db
    .from("crm_contacts")
    .select("name, fuente_origen, email")
    .eq("user_id", userId)
    .eq("telefono", "+573990000011")
    .maybeSingle();
  assert(Boolean(n1), "contacto nuevo creado en CRM");
  assert(n1?.fuente_origen === "Campaña: Prueba Import 070", "origen = nombre de la campaña");
  assert(n1?.email === "n1@test.com", "columna Correo alimentó la ficha del nuevo");

  // Limpieza: contactos de prueba (los nuevos no tienen tag → borrar por teléfono).
  console.log("\n— Limpieza —");
  await db.from("crm_contacts").delete().eq("user_id", userId).contains("tags", [TAG]);
  const newPhones = ["+573990000011", "+573990000012", "+573990000013", "+573990000014"];
  for (const p of newPhones) {
    await db.from("crm_contacts").delete().eq("user_id", userId).eq("telefono", p);
  }
  console.log("Listo.");
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
