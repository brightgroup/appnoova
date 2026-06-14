/**
 * Cliente mínimo para Chatwoot API v1.
 * Docs: https://www.chatwoot.com/developers/api/
 */

export class ChatwootClient {
  /** @param {{ baseUrl: string; accountId: string; token: string }} opts */
  constructor(opts) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, "");
    this.accountId = String(opts.accountId);
    this.token = opts.token;
  }

  async request(path, { searchParams } = {}) {
    const url = new URL(`${this.baseUrl}/api/v1/accounts/${this.accountId}${path}`);
    if (searchParams) {
      for (const [k, v] of Object.entries(searchParams)) {
        if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
      }
    }

    const res = await fetch(url, {
      headers: {
        api_access_token: this.token,
        "Content-Type": "application/json"
      }
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = json.message || json.error || res.statusText;
      throw new Error(`Chatwoot ${res.status} ${path}: ${msg}`);
    }
    return json;
  }

  /** Lista conversaciones paginadas (payload + meta). */
  async listConversations({ inboxId, status = "all", page = 1 } = {}) {
    return this.request("/conversations", {
      searchParams: {
        inbox_id: inboxId,
        status,
        page
      }
    });
  }

  /** Todas las conversaciones de un inbox (o cuenta). */
  async *iterateConversations({ inboxId, status = "all", maxPages = 500 } = {}) {
    for (let page = 1; page <= maxPages; page += 1) {
      const data = await this.listConversations({ inboxId, status, page });
      const items = data.data?.payload ?? data.payload ?? [];
      if (!items.length) break;
      yield* items;
      const total = data.data?.meta?.all_count ?? data.meta?.all_count;
      if (total && page * 25 >= total) break;
    }
  }

  async listMessages(conversationId) {
    const data = await this.request(`/conversations/${conversationId}/messages`);
    return data.payload ?? data ?? [];
  }
}

/** Normaliza teléfono WhatsApp a E.164 básico. */
export function normalizePhoneE164(raw) {
  if (!raw) return "";
  let s = String(raw).trim();
  if (s.startsWith("whatsapp:")) s = s.slice("whatsapp:".length);
  const digits = s.replace(/\D/g, "");
  if (!digits) return "";
  if (s.startsWith("+")) return `+${digits}`;
  if (digits.length === 10) return `+57${digits}`;
  if (digits.length === 12 && digits.startsWith("57")) return `+${digits}`;
  return `+${digits}`;
}

/** Mapea mensaje Chatwoot → formato Noova. */
export function mapChatwootMessage(msg) {
  if (msg.private) return null;
  if (msg.message_type === 2) return null;

  const createdAt = msg.created_at
    ? new Date(Number(msg.created_at) * 1000).toISOString()
    : new Date().toISOString();

  let role = "user";
  if (msg.message_type === 1) {
    role = msg.sender_type === "AgentBot" || msg.content_attributes?.automation ? "assistant" : "human";
  }

  let content = String(msg.content ?? "").trim();
  let media_type;
  let media_label;
  let internal_content;

  const attachments = Array.isArray(msg.attachments) ? msg.attachments : [];
  if (attachments.length > 0) {
    const att = attachments[0];
    const fileType = String(att.file_type ?? att.fileType ?? "").toLowerCase();
    const url = att.data_url ?? att.file_url ?? att.download_url ?? "";
    if (fileType === "image") media_type = "image";
    else if (fileType === "audio") media_type = "audio";
    else if (fileType === "video") media_type = "video";
    else media_type = "document";

    const labels = {
      image: "Imagen",
      audio: "Audio",
      video: "Video",
      document: "Documento"
    };
    media_label = labels[media_type] ?? "Archivo";
    if (!content) content = `[${media_label}]`;
    if (url) internal_content = `chatwoot_attachment:${url}`;
  }

  if (!content && !media_type) return null;

  return {
    role,
    content,
    created_at: createdAt,
    ...(media_type ? { media_type } : {}),
    ...(media_label ? { media_label } : {}),
    ...(internal_content ? { internal_content } : {}),
    _chatwoot_message_id: msg.id
  };
}

export function extractContactFromConversation(conv) {
  const sender = conv.meta?.sender ?? conv.sender ?? {};
  const phone = normalizePhoneE164(sender.phone_number ?? sender.identifier ?? "");
  const name = String(sender.name ?? "").trim();
  return { phone, name, senderId: sender.id };
}
