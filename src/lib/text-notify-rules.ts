/** Eventos que la IA puede notificar al equipo vía tool notify_team. */
export const NOTIFY_TEAM_EVENTS = ["appointment_booked", "purchase_intent"] as const;

export type NotifyTeamEvent = (typeof NOTIFY_TEAM_EVENTS)[number];

export interface NotifyTeamRule {
  enabled: boolean;
  email: boolean;
  push: boolean;
  whatsapp: boolean;
  /** Números E.164 del equipo que reciben WhatsApp. */
  whatsapp_destinations: string[];
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
  }
};

const DEFAULT_RULE: NotifyTeamRule = {
  enabled: false,
  email: true,
  push: true,
  whatsapp: false,
  whatsapp_destinations: []
};

export function defaultNotifyTeamRules(): NotifyTeamRules {
  return {
    appointment_booked: { ...DEFAULT_RULE, whatsapp_destinations: [] },
    purchase_intent: { ...DEFAULT_RULE, whatsapp_destinations: [] }
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
      whatsapp_destinations: normalizeE164List(r.whatsapp_destinations)
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

/** Instrucciones inyectadas en el system prompt cuando hay reglas activas. */
export function buildNotifyTeamPromptBlock(rules: NotifyTeamRules): string {
  const enabled = enabledNotifyTeamEvents(rules);
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
- Llama la tool en cuanto el evento quede claro (cita confirmada, o intención de compra alta).
- Incluye un \`summary\` breve en español con lo esencial (quién, qué, cuándo si aplica).
- Si hay fecha/hora de cita, pásala en \`when_label\`.
- No llames la tool por dudas ambiguas ni por cada mensaje; solo cuando el evento sea concreto.
- Después de llamar la tool, continúa la conversación con el cliente con normalidad (confirma la cita o el siguiente paso).
`.trim();
}
