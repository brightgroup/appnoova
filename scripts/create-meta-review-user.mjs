/**
 * Crea usuario de prueba para Meta App Review (WhatsApp Tech Provider).
 * Uso: node scripts/create-meta-review-user.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "./lib/load-env.mjs";

const META_EMAIL = "meta.review@noova360.com";
const META_PASSWORD = "MetaReview2026!Aa";
const META_FULL_NAME = "Meta App Review";
const DEMO_WA_E164 = "+15555550199";

function slugify(value) {
  return (
    value
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "org"
  );
}

async function uniqueOrgSlug(db, base) {
  let attempt = 0;
  const slug = slugify(base);
  while (attempt < 20) {
    const candidate = attempt === 0 ? slug : `${slug}-${attempt}`;
    const { data } = await db.from("organizations").select("id").eq("slug", candidate).maybeSingle();
    if (!data) return candidate;
    attempt++;
  }
  return `${slug}-${Date.now()}`;
}

async function provisionOrg(db, userId, email, fullName) {
  const orgName = "Meta App Review — Demo";
  const slug = await uniqueOrgSlug(db, "meta-app-review");

  const { data: org, error: orgErr } = await db
    .from("organizations")
    .insert({
      name: orgName,
      slug,
      owner_user_id: userId,
      status: "active",
      plan: "trial",
    })
    .select("id")
    .single();

  if (orgErr) throw new Error(orgErr.message);

  const { error: seedErr } = await db.rpc("seed_organization_system_roles", { p_org_id: org.id });
  if (seedErr) throw new Error(seedErr.message);

  const { data: ownerRole } = await db
    .from("roles")
    .select("id")
    .eq("organization_id", org.id)
    .eq("slug", "owner")
    .single();

  if (ownerRole) {
    await db.from("organization_members").upsert({
      organization_id: org.id,
      user_id: userId,
      role_id: ownerRole.id,
      status: "active",
    });
  }

  await db.from("user_active_organization").upsert({
    user_id: userId,
    organization_id: org.id,
  });

  await db.from("users").update({ organization_id: org.id }).eq("id", userId);

  return org.id;
}

async function ensureDemoAssets(db, userId) {
  let textAgentId = null;

  const { data: existingAgent } = await db
    .from("text_agents")
    .select("id")
    .eq("user_id", userId)
    .eq("template_id", "meta-review-demo")
    .maybeSingle();

  if (existingAgent) {
    textAgentId = existingAgent.id;
  } else {
    const { data: agent, error: agentErr } = await db
      .from("text_agents")
      .insert({
        user_id: userId,
        template_id: "meta-review-demo",
        source_template: "customer-assistant",
        name: "Agente demo Meta Review",
        prompt:
          "Eres un asistente de demostración para revisión de Meta App Review. Responde de forma breve y profesional.",
        status: "active",
      })
      .select("id")
      .single();

    if (agentErr) throw new Error(agentErr.message);
    textAgentId = agent.id;
  }

  const { data: existingChannel } = await db
    .from("whatsapp_channels")
    .select("id")
    .eq("user_id", userId)
    .eq("e164", DEMO_WA_E164)
    .maybeSingle();

  if (!existingChannel) {
    const { error: channelErr } = await db.from("whatsapp_channels").insert({
      user_id: userId,
      text_agent_id: textAgentId,
      provider: "twilio",
      e164: DEMO_WA_E164,
      friendly_name: "Línea demo Meta Review",
      status: "active",
      metadata: { purpose: "meta_app_review_demo", note: "Número ficticio para UI de revisión" },
    });

    if (channelErr && channelErr.code !== "23505") {
      throw new Error(channelErr.message);
    }
  }

  return { textAgentId };
}

async function main() {
  const env = loadEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local");
    process.exit(1);
  }

  const db = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: existingProfile } = await db
    .from("profiles")
    .select("id, email")
    .ilike("email", META_EMAIL)
    .maybeSingle();

  let userId;

  if (existingProfile) {
    userId = existingProfile.id;
    console.log(`Usuario existente: ${META_EMAIL} (${userId})`);

    const { error: pwdErr } = await db.auth.admin.updateUserById(userId, {
      password: META_PASSWORD,
      email_confirm: true,
    });
    if (pwdErr) throw new Error(pwdErr.message);

    await db.from("profiles").update({ status: "active", full_name: META_FULL_NAME }).eq("id", userId);
  } else {
    const { data: created, error: createErr } = await db.auth.admin.createUser({
      email: META_EMAIL,
      password: META_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: META_FULL_NAME },
    });

    if (createErr || !created.user) {
      throw new Error(createErr?.message ?? "No se pudo crear usuario");
    }

    userId = created.user.id;

    await db.from("profiles").upsert({
      id: userId,
      email: META_EMAIL,
      full_name: META_FULL_NAME,
      status: "active",
      is_platform_admin: false,
      is_protected: false,
    });

    await db.from("users").upsert({
      id: userId,
      email: META_EMAIL,
      nombre: META_FULL_NAME,
      rol: "user",
      status: "active",
      is_platform_admin: false,
      email_confirmed: true,
    });

    console.log(`Usuario creado: ${META_EMAIL}`);
  }

  const { data: membership } = await db
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", userId)
    .maybeSingle();

  let orgId = membership?.organization_id ?? null;
  if (!orgId) {
    orgId = await provisionOrg(db, userId, META_EMAIL, META_FULL_NAME);
    console.log(`Organización creada: ${orgId}`);
  } else {
    console.log(`Organización existente: ${orgId}`);
  }

  await ensureDemoAssets(db, userId);
  console.log("Assets demo: agente de texto + canal WhatsApp (UI)");

  console.log("\n--- Credenciales Meta App Review ---");
  console.log(`URL:      https://app.noova360.com/login`);
  console.log(`Email:    ${META_EMAIL}`);
  console.log(`Password: ${META_PASSWORD}`);
  console.log("------------------------------------\n");
}

main().catch((err) => {
  console.error("Error:", err.message || err);
  process.exit(1);
});
