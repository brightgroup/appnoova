const STORAGE_PREFIX = "noova-widget-chat";

export interface WidgetMessage {
  id: string;
  role: "user" | "assistant" | "human";
  content: string;
}

export interface WidgetChatState {
  messages: WidgetMessage[];
  serverConversationId: string | null;
}

function storageKey(slug: string): string {
  return `${STORAGE_PREFIX}:${slug}`;
}

export function loadWidgetChat(slug: string): WidgetChatState {
  if (typeof window === "undefined") {
    return { messages: [], serverConversationId: null };
  }
  try {
    const raw = localStorage.getItem(storageKey(slug));
    if (!raw) return { messages: [], serverConversationId: null };
    const parsed = JSON.parse(raw) as WidgetChatState;
    return {
      messages: Array.isArray(parsed.messages) ? parsed.messages : [],
      serverConversationId: parsed.serverConversationId ?? null
    };
  } catch {
    return { messages: [], serverConversationId: null };
  }
}

export function saveWidgetChat(slug: string, state: WidgetChatState): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(storageKey(slug), JSON.stringify(state));
  } catch {
    /* quota / private mode */
  }
}

export function clearWidgetChat(slug: string): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(storageKey(slug));
}
