/** Eventos que pueden notificar al equipo vía notify_team. */
export const NOTIFY_TEAM_EVENTS = ["appointment_booked", "purchase_intent", "human_handoff"] as const;

export type NotifyTeamEvent = (typeof NOTIFY_TEAM_EVENTS)[number];

/**
 * Eventos que la IA decide y dispara ella misma llamando la tool `notify_team`.
 * `human_handoff` NO está aquí: ese lo dispara código determinístico
 * (`escalateConversationToHuman`) cuando de verdad ocurre la derivación —
 * no tiene sentido que el modelo lo "declare" sin que la conversación
 * realmente pase a modo humano.
 */
export const AI_NOTIFY_TEAM_EVENTS = ["appointment_booked", "purchase_intent"] as const;

export interface NotifyTeamRule {
  enabled: boolean;
  email: boolean;
  push: boolean;
  whatsapp: boolean;
  /** Números E.164 del equipo que reciben WhatsApp. */
  whatsapp_destinations: string[];
  /** Plantilla aprobada por Meta (whatsapp_templates.id, una sola variable) usada para el envío. */
  whatsapp_template_id: string | null;
}

export type NotifyTeamRules = Partial<Record<NotifyTeamEvent, NotifyTeamRule>>;

export const NOTIFY_TEAM_EVENT_META: Record<
  NotifyTeamEvent,
  { label: string; description: string }
> = {
  appointment_booked: {
    label: "Agendamiento confirmado",
    description: "Cuando el cliente agenda una cita, reunión o visita."
  },
  purchase_intent: {
    label: "Intención de compra alta",
    description: "Cuando el cliente muestra señales claras de que va a comprar."
  },
  human_handoff: {
    label: "Derivación a asesor humano",
    description: "Cuando la IA o el cliente piden que un asesor tome la conversación."
  }
};

// `human_handoff` viene activo por defecto (email + push) para no cambiar el
// comportamiento ya existente de las conversaciones derivadas; los otros dos
// eventos son opt-in, como siempre.
const EVENT_DEFAULTS: Record<NotifyTeamEvent, NotifyTeamRule> = {
  appointment_booked: { enabled: false, email: true, push: true, whatsapp: false, whatsapp_destinations: [], whatsapp_template_id: null },
  purchase_intent: { enabled: false, email: true, push: true, whatsapp: false, whatsapp_destinations: [], whatsapp_template_id: null },
  human_handoff: { enabled: true, email: true, push: true, whatsapp: false, whatsapp_destinations: [], whatsapp_template_id: null }
};

export function defaultNotifyTeamRules(): NotifyTeamRules {
  return {
    appointment_booked: { ...EVENT_DEFAULTS.appointment_booked, whatsapp_destinations: [] },
    purchase_intent: { ...EVENT_DEFAULTS.purchase_intent, whatsapp_destinations: [] },
    human_handoff: { ...EVENT_DEFAULTS.human_handoff, whatsapp_destinations: [] }
  };
}

function normalizeE164List(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    const digits = String(item ?? "").replace(/[^\d+]/g, "").trim();
    if (!digits) continue;
    const e164 = digits.startsWith("+") ? digits : `+${digits}`;
    if (/^\+[1-9]\d{7,14}$/.test(e164) && !out.includes(e164)) out.push(e164);
  }
  return out;
}

export function normalizeNotifyTeamRules(raw: unknown): NotifyTeamRules {
  const base = defaultNotifyTeamRules();
  if (!raw || typeof raw !== "object") return base;
  const obj = raw as Record<string, unknown>;

  for (const event of NOTIFY_TEAM_EVENTS) {
    const row = obj[event];
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    base[event] = {
      enabled: Boolean(r.enabled),
      email: r.email !== false,
      push: r.push !== false,
      whatsapp: Boolean(r.whatsapp),
      whatsapp_destinations: normalizeE164List(r.whatsapp_destinations),
      whatsapp_template_id:
        typeof r.whatsapp_template_id === "string" && r.whatsapp_template_id.trim()
          ? r.whatsapp_template_id.trim()
          : null
    };
  }
  return base;
}

export function isNotifyTeamEvent(value: unknown): value is NotifyTeamEvent {
  return typeof value === "string" && (NOTIFY_TEAM_EVENTS as readonly string[]).includes(value);
}

export function enabledNotifyTeamEvents(rules: NotifyTeamRules): NotifyTeamEvent[] {
  return NOTIFY_TEAM_EVENTS.filter(e => rules[e]?.enabled);
}

/** Solo los eventos que el modelo puede disparar él mismo (excluye human_handoff). */
export function enabledAiNotifyTeamEvents(rules: NotifyTeamRules): (typeof AI_NOTIFY_TEAM_EVENTS)[number][] {
  return AI_NOTIFY_TEAM_EVENTS.filter(e => rules[e]?.enabled);
}

/**
 * ¿Algún evento activo tiene WhatsApp encendido pero sin plantilla o sin
 * destinos? Ese aviso quedaría guardado sin poder enviarse nunca — se usa
 * para mostrar una señal persistente (ej. en la pestaña "Notificaciones"),
 * no solo el aviso inline dentro de cada tarjeta.
 */
export function hasIncompleteWhatsAppNotifyRule(rules: NotifyTeamRules): boolean {
  return NOTIFY_TEAM_EVENTS.some(e => {
    const rule = rules[e];
    if (!rule?.enabled || !rule.whatsapp) return false;
    return !rule.whatsapp_template_id || rule.whatsapp_destinations.length === 0;
  });
}

/** Instrucciones inyectadas en el system prompt cuando hay reglas controladas por la IA activas. */
export function buildNotifyTeamPromptBlock(rules: NotifyTeamRules): string {
  const enabled = enabledAiNotifyTeamEvents(rules);
  if (!enabled.length) return "";

  const lines = enabled.map(e => {
    const meta = NOTIFY_TEAM_EVENT_META[e];
    return `- \`${e}\`: ${meta.description}`;
  });

  return `
## Notificaciones al equipo (herramienta notify_team)
Cuando ocurra uno de estos eventos en la conversación, DEBES llamar la herramienta \`notify_team\` (no inventes que ya avisaste: llama la tool).
Eventos habilitados:
${lines.join("\n")}
Reglas:
- Llama la tool en cuanto el evento quede claro.
- Incluye un \`summary\` breve en español con lo esencial (quién, qué, cuándo si aplica).
- Si hay fecha/hora de cita, pásala en \`when_label\`.
- No llames la tool por dudas ambiguas ni por cada mensaje; solo cuando el evento sea concreto.
- Después de llamar la tool, continúa la conversación con el cliente con normalidad (confirma la cita o el siguiente paso).
`.trim();
}
