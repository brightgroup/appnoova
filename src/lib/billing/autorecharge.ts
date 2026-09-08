import type { SupabaseClient } from "@supabase/supabase-js";
import { chargeSubscriptionOneOff } from "@/lib/billing/paddle/client";

/**
 * Recarga automática de créditos (modelo Claude/ElevenLabs/Twilio): si el
 * saldo restante cruza el umbral configurado, cobra el paquete elegido a la
 * tarjeta ya guardada en Paddle. Fire-and-forget desde recordUsage — nunca
 * debe bloquear ni fallar el flujo de consumo que la dispara.
 *
 * billing_autorecharge_reserve/settle (supabase/migrations/123_*.sql) son el
 * freno: como máximo una recarga en vuelo por org y un tope mensual en USD,
 * para que una ráfaga de consumo no dispare cobros repetidos.
 */
export async function maybeTriggerAutoRecharge(
  db: SupabaseClient,
  organizationId: string,
  remaining: number | null
): Promise<void> {
  if (remaining == null) return;

  const { data: settings } = await db
    .from("organization_autorecharge")
    .select("enabled, admin_enabled, threshold_credits, package_credits")
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (!settings?.enabled || !settings.admin_enabled) return;
  if (remaining > settings.threshold_credits) return;

  const { data: pkg } = await db
    .from("credit_packages")
    .select("id, credits, price_usd, paddle_price_id_sandbox, paddle_price_id_live")
    .eq("credits", settings.package_credits)
    .eq("is_active", true)
    .maybeSingle();
  if (!pkg) {
    console.error(`[autorecharge] org ${organizationId}: paquete de ${settings.package_credits} créditos no existe`);
    return;
  }

  const priceId = process.env.PADDLE_ENV === "live" ? pkg.paddle_price_id_live : pkg.paddle_price_id_sandbox;
  if (!priceId) {
    console.error(`[autorecharge] paquete ${pkg.id} sin price_id de Paddle configurado (${process.env.PADDLE_ENV ?? "sandbox"})`);
    return;
  }

  const { data: reserve } = await db.rpc("billing_autorecharge_reserve", {
    p_org: organizationId,
    p_package_usd: pkg.price_usd,
  });
  if (!reserve?.allowed) return; // ya hay una en vuelo, deshabilitada, o tope mensual alcanzado

  const { data: sub } = await db
    .from("organization_subscriptions")
    .select("paddle_subscription_id, billing_provider")
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (!sub?.paddle_subscription_id || sub.billing_provider !== "paddle") {
    await db.rpc("billing_autorecharge_settle", { p_org: organizationId, p_success: false });
    return;
  }

  try {
    await chargeSubscriptionOneOff(sub.paddle_subscription_id, priceId);
    await db.rpc("billing_autorecharge_settle", {
      p_org: organizationId,
      p_success: true,
      p_credits: pkg.credits,
      p_amount_usd: pkg.price_usd,
    });
  } catch (err) {
    console.error(`[autorecharge] cobro fallido org ${organizationId}:`, err);
    await db.rpc("billing_autorecharge_settle", { p_org: organizationId, p_success: false });
  }
}
