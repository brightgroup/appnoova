import type { VoiceAgentFormData } from "@/types/voice-agent";

export interface PendingBridgeSession {
  callControlId: string;
  callRecordId: string;
  userId: string;
  voiceAgentId: string;
  from: string;
  to: string;
  agentName: string;
  config: VoiceAgentFormData;
  companyContextText: string;
  preparedAt: number;
}

const pending = new Map<string, PendingBridgeSession>();
const TTL_MS = 15 * 60 * 1000;

export function setPendingBridgeSession(session: PendingBridgeSession): void {
  pending.set(session.callControlId, session);
}

export function takePendingBridgeSession(callControlId: string): PendingBridgeSession | null {
  const row = pending.get(callControlId) ?? null;
  if (row) pending.delete(callControlId);
  return row;
}

export function peekPendingBridgeSession(callControlId: string): PendingBridgeSession | null {
  const row = pending.get(callControlId);
  if (!row) return null;
  if (Date.now() - row.preparedAt > TTL_MS) {
    pending.delete(callControlId);
    return null;
  }
  return row;
}

const activeBridges = new Map<string, { close: (reason: string) => Promise<void> }>();

export function registerActiveBridge(callControlId: string, bridge: { close: (reason: string) => Promise<void> }) {
  activeBridges.set(callControlId, bridge);
}

export function unregisterActiveBridge(callControlId: string) {
  activeBridges.delete(callControlId);
}

export function hasActiveBridge(callControlId: string): boolean {
  return activeBridges.has(callControlId);
}

export async function closeActiveBridge(callControlId: string, reason: string): Promise<void> {
  const bridge = activeBridges.get(callControlId);
  if (bridge) {
    await bridge.close(reason);
  }
}
