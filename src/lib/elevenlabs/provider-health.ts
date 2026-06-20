import { elevenLabsFetch } from "@/lib/elevenlabs/client";
import { logPremiumInternalIssue } from "@/lib/elevenlabs/disconnect-label";

export interface ElevenLabsProviderHealth {
  ok: boolean;
  tier: string | null;
  recentQuotaFailures: number;
  lastFailureReason: string | null;
}

/** Revisa conversaciones recientes del agente para detectar cuota agotada (solo uso interno). */
export async function checkElevenLabsAgentHealth(
  elevenlabsAgentId: string
): Promise<ElevenLabsProviderHealth> {
  try {
    const data = await elevenLabsFetch<{
      conversations?: {
        status?: string;
        termination_reason?: string;
        metadata?: { termination_reason?: string; charging?: { tier?: string } };
      }[];
    }>(`/convai/conversations?agent_id=${encodeURIComponent(elevenlabsAgentId)}&page_size=5`);

    const conversations = data.conversations ?? [];
    const quotaFailures = conversations.filter(c => {
      const reason = c.termination_reason ?? c.metadata?.termination_reason ?? "";
      return /quota/i.test(reason);
    });

    const tier = conversations.find(c => c.metadata?.charging?.tier)?.metadata?.charging?.tier ?? null;
    const lastReason =
      conversations[0]?.termination_reason
      ?? conversations[0]?.metadata?.termination_reason
      ?? null;

    if (quotaFailures.length >= 2) {
      logPremiumInternalIssue("provider_quota", {
        agentId: elevenlabsAgentId,
        tier,
        recentQuotaFailures: quotaFailures.length,
        lastFailureReason: lastReason,
      });
      return {
        ok: false,
        tier,
        recentQuotaFailures: quotaFailures.length,
        lastFailureReason: lastReason,
      };
    }

    if (tier === "free") {
      logPremiumInternalIssue("provider_tier_free", { agentId: elevenlabsAgentId, tier });
    }

    return {
      ok: true,
      tier,
      recentQuotaFailures: quotaFailures.length,
      lastFailureReason: lastReason,
    };
  } catch (err) {
    logPremiumInternalIssue("health_check_failed", {
      agentId: elevenlabsAgentId,
      error: err instanceof Error ? err.message : String(err),
    });
    return {
      ok: true,
      tier: null,
      recentQuotaFailures: 0,
      lastFailureReason: null,
    };
  }
}
