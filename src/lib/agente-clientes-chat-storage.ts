import { extractMicrositeSlugFromPath } from "@/lib/microsite-path";

export interface StoredChatMessage {
  id: string;
  role: "user" | "assistant" | "human";
  content: string;
}

export interface StoredConversation {
  id: string;
  title: string;
  messages: StoredChatMessage[];
  createdAt: number;
  updatedAt: number;
  /** ID en text_agent_conversations — mantiene el mismo hilo en inbox al volver */
  serverConversationId?: string | null;
}

export interface ConversationState {
  activeId: string | null;
  messages: StoredChatMessage[];
  conversations: StoredConversation[];
  serverConversationId: string | null;
}

interface ConversationStore {
  activeId: string | null;
  conversations: StoredConversation[];
}

interface LegacyStoredChat {
  messages?: StoredChatMessage[];
  updatedAt?: number;
}

const STORAGE_PREFIX = "noova-ac-conversations";
const LEGACY_PREFIX = "noova-ac-chat";
const MAX_CONVERSATIONS = 20;
const MAX_MESSAGES = 100;
const DEFAULT_TITLE = "Nueva conversación";

export function getChatScopeFromPath(pathname: string): string {
  return extractMicrositeSlugFromPath(pathname) || "default";
}

function storageKey(scope: string): string {
  return `${STORAGE_PREFIX}:${scope}`;
}

function legacyStorageKey(scope: string): string {
  return `${LEGACY_PREFIX}:${scope}`;
}

function isValidMessage(m: unknown): m is StoredChatMessage {
  if (!m || typeof m !== "object") return false;
  const msg = m as StoredChatMessage;
  return (
    typeof msg.id === "string" &&
    (msg.role === "user" || msg.role === "assistant" || msg.role === "human") &&
    typeof msg.content === "string"
  );
}

function sanitizeMessages(messages: unknown): StoredChatMessage[] {
  if (!Array.isArray(messages)) return [];
  return messages.filter(isValidMessage).slice(-MAX_MESSAGES);
}

function conversationTitle(messages: StoredChatMessage[]): string {
  const firstUser = messages.find(m => m.role === "user");
  if (!firstUser?.content.trim()) return DEFAULT_TITLE;
  const text = firstUser.content.trim().replace(/\s+/g, " ");
  return text.length > 42 ? `${text.slice(0, 42)}…` : text;
}

function createConversation(messages: StoredChatMessage[] = []): StoredConversation {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    title: conversationTitle(messages),
    messages: sanitizeMessages(messages),
    createdAt: now,
    updatedAt: now
  };
}

function migrateLegacyStore(scope: string): ConversationStore | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = localStorage.getItem(legacyStorageKey(scope));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as LegacyStoredChat;
    const messages = sanitizeMessages(parsed.messages);
    if (messages.length === 0) {
      localStorage.removeItem(legacyStorageKey(scope));
      return null;
    }

    const conversation = createConversation(messages);
    conversation.updatedAt = parsed.updatedAt ?? conversation.updatedAt;
    localStorage.removeItem(legacyStorageKey(scope));
    return { activeId: conversation.id, conversations: [conversation] };
  } catch {
    return null;
  }
}

function loadStore(scope: string): ConversationStore {
  if (typeof window === "undefined") {
    return { activeId: null, conversations: [] };
  }

  try {
    const raw = localStorage.getItem(storageKey(scope));
    if (raw) {
      const parsed = JSON.parse(raw) as ConversationStore;
      const conversations = (parsed.conversations ?? [])
        .filter(c => c && typeof c.id === "string")
        .map(c => ({
          id: c.id,
          title: typeof c.title === "string" ? c.title : DEFAULT_TITLE,
          messages: sanitizeMessages(c.messages),
          createdAt: typeof c.createdAt === "number" ? c.createdAt : Date.now(),
          updatedAt: typeof c.updatedAt === "number" ? c.updatedAt : Date.now(),
          serverConversationId:
            typeof c.serverConversationId === "string" ? c.serverConversationId : null
        }))
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, MAX_CONVERSATIONS);

      const activeId =
        parsed.activeId && conversations.some(c => c.id === parsed.activeId)
          ? parsed.activeId
          : conversations[0]?.id ?? null;

      return { activeId, conversations };
    }
  } catch {
    // fall through to migration / empty store
  }

  const migrated = migrateLegacyStore(scope);
  if (migrated) {
    saveStore(scope, migrated);
    return migrated;
  }

  return { activeId: null, conversations: [] };
}

function saveStore(scope: string, store: ConversationStore): void {
  if (typeof window === "undefined") return;

  try {
    const conversations = store.conversations
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_CONVERSATIONS);

    localStorage.setItem(
      storageKey(scope),
      JSON.stringify({
        activeId: store.activeId,
        conversations
      })
    );
  } catch {
    // Navegador en modo privado o cuota llena
  }
}

function getActiveConversation(store: ConversationStore): StoredConversation | null {
  if (!store.activeId) return null;
  return store.conversations.find(c => c.id === store.activeId) ?? null;
}

export function loadConversationState(scope: string): ConversationState {
  const store = loadStore(scope);
  const active = getActiveConversation(store);
  return {
    activeId: store.activeId,
    messages: active?.messages ?? [],
    conversations: store.conversations,
    serverConversationId: active?.serverConversationId ?? null
  };
}

export function saveActiveConversation(
  scope: string,
  activeId: string | null,
  messages: StoredChatMessage[],
  serverConversationId?: string | null
): ConversationState {
  const store = loadStore(scope);
  const sanitized = sanitizeMessages(messages);
  const now = Date.now();

  if (!activeId || !store.conversations.some(c => c.id === activeId)) {
    if (sanitized.length === 0) {
      return {
        activeId: store.activeId,
        messages: getActiveConversation(store)?.messages ?? [],
        conversations: store.conversations,
        serverConversationId: getActiveConversation(store)?.serverConversationId ?? null
      };
    }

    const created = createConversation(sanitized);
    if (serverConversationId) created.serverConversationId = serverConversationId;
    store.conversations.unshift(created);
    store.activeId = created.id;
  } else {
    store.conversations = store.conversations.map(c =>
      c.id === activeId
        ? {
            ...c,
            messages: sanitized,
            title: conversationTitle(sanitized),
            updatedAt: now,
            serverConversationId:
              typeof serverConversationId === "string"
                ? serverConversationId
                : (c.serverConversationId ?? null)
          }
        : c
    );
    store.activeId = activeId;
  }

  saveStore(scope, store);
  const active = getActiveConversation(store);
  return {
    activeId: store.activeId,
    messages: active?.messages ?? [],
    conversations: store.conversations,
    serverConversationId: active?.serverConversationId ?? null
  };
}

export function startNewConversation(scope: string): ConversationState {
  const store = loadStore(scope);
  const active = getActiveConversation(store);

  if (active && active.messages.length === 0) {
    return {
      activeId: active.id,
      messages: [],
      conversations: store.conversations,
      serverConversationId: null
    };
  }

  const created = createConversation([]);
  store.conversations.unshift(created);
  store.activeId = created.id;
  saveStore(scope, store);

  return {
    activeId: created.id,
    messages: [],
    conversations: store.conversations,
    serverConversationId: null
  };
}

export function switchConversation(scope: string, conversationId: string): ConversationState {
  const store = loadStore(scope);
  const target = store.conversations.find(c => c.id === conversationId);
  if (!target) return loadConversationState(scope);

  store.activeId = conversationId;
  saveStore(scope, store);

  return {
    activeId: conversationId,
    messages: target.messages,
    conversations: store.conversations,
    serverConversationId: target.serverConversationId ?? null
  };
}

export function bindServerConversationId(
  scope: string,
  activeId: string | null,
  serverConversationId: string
): void {
  if (!activeId || !serverConversationId) return;
  const store = loadStore(scope);
  if (!store.conversations.some(c => c.id === activeId)) return;
  store.conversations = store.conversations.map(c =>
    c.id === activeId ? { ...c, serverConversationId } : c
  );
  saveStore(scope, store);
}

export function getConversationPreview(messages: StoredChatMessage[]): string {
  const last = [...messages].reverse().find(m => m.content.trim());
  if (!last) return "Sin mensajes aún";

  const text = last.content.trim().replace(/\s+/g, " ");
  const prefix = last.role === "user" ? "Tú: " : "";
  const combined = `${prefix}${text}`;
  return combined.length > 64 ? `${combined.slice(0, 64)}…` : combined;
}

export function formatConversationDate(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  if (isToday) {
    return date.toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" });
  }

  return date.toLocaleDateString("es", { day: "numeric", month: "short" });
}
