import { Type } from "@google/genai";
import type { AgentToolDefinition, AgentToolContext, AgentToolResult } from "@/lib/agent-tools/registry";
import { executeNotifyTeamTool } from "@/lib/text-notify-team";
import { notifyContactAppointment } from "@/lib/email/notify-appointment";
import { getCalendarConnectionSecretsById } from "@/lib/google-calendar/connections-db";
import { getFreeBusy, createCalendarEvent } from "@/lib/google-calendar/client";
import {
  computeCandidateSlots,
  bogotaLocalToUtcIso,
  formatBogotaDateTimeLabel,
  renderEventTitle,
  buildSchedulingPromptBlock,
  type BusyInterval
} from "@/lib/scheduling/rules";

function schedulingEnabled(ctx: { schedulingRules: { enabled: boolean }; calendarConnection?: unknown }): boolean {
  return ctx.schedulingRules.enabled && Boolean(ctx.calendarConnection);
}

export const buscarHorariosDisponiblesTool: AgentToolDefinition = {
  name: "buscar_horarios_disponibles",
  declaration: {
    name: "buscar_horarios_disponibles",
    description:
      "Consulta los próximos horarios realmente disponibles en el calendario de la empresa, según su horario de atención configurado. Úsala SIEMPRE antes de ofrecer una fecha/hora al cliente.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        fecha_deseada: {
          type: Type.STRING,
          description: "Fecha preferida por el cliente en formato YYYY-MM-DD, si la mencionó. Opcional."
        }
      }
    }
  },
  isEnabled: schedulingEnabled,
  buildPromptBlock(ctx) {
    // Bloque combinado de las dos tools de agendamiento (evita duplicarlo en crear_cita).
    return buildSchedulingPromptBlock(ctx.schedulingRules);
  },
  async execute(args, ctx: AgentToolContext): Promise<AgentToolResult> {
    if (!ctx.calendarConnection) {
      return { ok: false, reason: "No hay un calendario conectado para esta empresa" };
    }
    const secrets = await getCalendarConnectionSecretsById(ctx.db, ctx.calendarConnection.id);
    if (!secrets) {
      return { ok: false, reason: "La conexión de calendario ya no existe" };
    }

    const rules = ctx.schedulingRules;
    const hours = ctx.businessHours;
    const now = new Date();

    // Si el cliente pidió una fecha puntual, la búsqueda debe arrancar ahí — si no,
    // como el resultado se corta en los primeros 6 horarios cronológicos, un día
    // cercano con mucha disponibilidad (ej. mañana) tapa por completo cualquier
    // fecha posterior (ej. pasado mañana), y el agente termina diciendo "sin
    // horarios" para un día que en realidad sí tiene cupo.
    const fechaDeseada = String(args.fecha_deseada ?? "").trim();
    let searchFrom = now;
    if (/^\d{4}-\d{2}-\d{2}$/.test(fechaDeseada)) {
      const requestedMs = new Date(bogotaLocalToUtcIso(fechaDeseada, "00:00")).getTime();
      if (Number.isFinite(requestedMs) && requestedMs > now.getTime()) {
        searchFrom = new Date(requestedMs);
      }
    }
    const daysAheadFromRequested = Math.max(
      0,
      hours.max_days_ahead - Math.floor((searchFrom.getTime() - now.getTime()) / 86_400_000)
    );
    const timeMax = new Date(searchFrom.getTime() + daysAheadFromRequested * 86_400_000);

    let busy: BusyInterval[];
    try {
      busy = await getFreeBusy(ctx.db, secrets, searchFrom.toISOString(), timeMax.toISOString());
    } catch (err) {
      return {
        ok: false,
        reason: `No pude consultar el calendario ahora mismo (${err instanceof Error ? err.message : "error"})`
      };
    }

    const slots = computeCandidateSlots(
      { ...hours, max_days_ahead: daysAheadFromRequested },
      rules,
      busy,
      searchFrom,
      { maxResults: 6 }
    );
    if (!slots.length) {
      return { ok: true, slots: [], reason: "No hay horarios disponibles en el rango configurado" };
    }

    return {
      ok: true,
      slots: slots.map(s => ({ fecha_hora_iso: s.startIso, etiqueta: s.label }))
    };
  }
};

export const crearCitaTool: AgentToolDefinition = {
  name: "crear_cita",
  declaration: {
    name: "crear_cita",
    description:
      "Crea la cita en el calendario real de la empresa. Solo llámala después de confirmar con el cliente un horario devuelto por buscar_horarios_disponibles.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        fecha: { type: Type.STRING, description: "Fecha de la cita, formato YYYY-MM-DD" },
        hora: { type: Type.STRING, description: "Hora de la cita, formato HH:mm (24h, hora Colombia)" },
        nombre_contacto: { type: Type.STRING, description: "Nombre completo del contacto" },
        motivo: { type: Type.STRING, description: "Motivo breve de la cita" },
        correo_contacto: {
          type: Type.STRING,
          description:
            "Correo electrónico del contacto, para enviarle la confirmación por correo. Opcional: pídelo, pero si el cliente no lo tiene a la mano o prefiere no darlo (ej. cita presencial en el local), continúa sin él — no es obligatorio."
        },
        telefono: { type: Type.STRING, description: "Teléfono del contacto, si lo tienes. Opcional." }
      },
      required: ["fecha", "hora", "nombre_contacto", "motivo"]
    }
  },
  isEnabled: schedulingEnabled,
  buildPromptBlock() {
    // El bloque de instrucciones ya lo aporta buscar_horarios_disponibles (misma sección de prompt).
    return "";
  },
  async execute(args, ctx: AgentToolContext): Promise<AgentToolResult> {
    if (!ctx.calendarConnection) {
      return { ok: false, reason: "No hay un calendario conectado para esta empresa" };
    }

    const nombre = String(args.nombre_contacto ?? "").trim();
    const motivo = String(args.motivo ?? "").trim();
    const correoRaw = String(args.correo_contacto ?? "").trim().toLowerCase();
    const correo = correoRaw.includes("@") ? correoRaw : null;
    const fecha = String(args.fecha ?? "").trim();
    const hora = String(args.hora ?? "").trim();
    const telefono = args.telefono ? String(args.telefono).trim() : null;

    if (!nombre || !/^\d{4}-\d{2}-\d{2}$/.test(fecha) || !/^\d{2}:\d{2}$/.test(hora)) {
      return { ok: false, reason: "Faltan datos obligatorios o el formato de fecha/hora es inválido" };
    }

    const rules = ctx.schedulingRules;
    const startIso = bogotaLocalToUtcIso(fecha, hora);
    const endIso = new Date(new Date(startIso).getTime() + rules.event_duration_min * 60_000).toISOString();

    const secrets = await getCalendarConnectionSecretsById(ctx.db, ctx.calendarConnection.id);
    if (!secrets) {
      return { ok: false, reason: "La conexión de calendario ya no existe" };
    }

    // Revalida contra free/busy justo antes de crear — evita doble-booking por condición de carrera.
    let busy: BusyInterval[];
    try {
      busy = await getFreeBusy(ctx.db, secrets, startIso, endIso);
    } catch (err) {
      return {
        ok: false,
        reason: `No pude validar disponibilidad ahora mismo (${err instanceof Error ? err.message : "error"})`
      };
    }
    const startMs = new Date(startIso).getTime();
    const endMs = new Date(endIso).getTime();
    const overlaps = busy.some(b => new Date(b.start).getTime() < endMs && new Date(b.end).getTime() > startMs);
    if (overlaps) {
      return { ok: false, reason: "Ese horario ya se ocupó. Vuelve a llamar buscar_horarios_disponibles y ofrece otro." };
    }

    const title = renderEventTitle(rules.event_title_template, { nombre, motivo });
    const description = [
      `Contacto: ${nombre}`,
      telefono ? `Teléfono: ${telefono}` : null,
      correo ? `Correo: ${correo}` : null,
      motivo ? `Motivo: ${motivo}` : null,
      `Agendado por el agente IA de Noova (canal: ${ctx.channel})`
    ]
      .filter(Boolean)
      .join("\n");

    let googleEvent;
    try {
      googleEvent = await createCalendarEvent(ctx.db, secrets, {
        summary: title,
        description,
        startIso,
        endIso,
        createMeetLink: rules.create_meet_link,
        attendeeEmail: correo
      });
    } catch (err) {
      return {
        ok: false,
        reason: err instanceof Error ? err.message : "Error creando el evento en Google Calendar"
      };
    }

    const { data: inserted, error: insertErr } = await ctx.db
      .from("appointments")
      .insert({
        organization_id: ctx.organizationId,
        agent_id: ctx.agentId ?? null,
        agent_type: ctx.agentType ?? "text",
        calendar_connection_id: secrets.id,
        google_event_id: googleEvent.id,
        contact_name: nombre,
        contact_email: correo,
        contact_phone: telefono,
        reason: motivo || null,
        starts_at: startIso,
        ends_at: endIso,
        conversation_id: ctx.conversationId,
        source_channel: ctx.channel,
        status: "confirmed"
      })
      .select("id")
      .single();

    if (insertErr) {
      // El evento ya existe en Google Calendar (fuente de verdad); no revertimos por un fallo
      // de registro local, solo lo dejamos en logs.
      console.error("[crear_cita] insert appointments:", insertErr);
    }

    const whenLabel = formatBogotaDateTimeLabel(startIso);

    const notifyResult = await executeNotifyTeamTool(
      {
        event: "appointment_booked",
        summary: `${nombre} agendó: ${motivo || "cita"}`,
        when_label: whenLabel
      },
      ctx
    );

    let contactEmailSent = false;
    if (correo) {
      try {
        const { data: org } = await ctx.db
          .from("organizations")
          .select("name")
          .eq("id", ctx.organizationId)
          .maybeSingle();
        const emailResult = await notifyContactAppointment({
          contactEmail: correo,
          contactName: nombre,
          organizationName: org?.name ? String(org.name) : null,
          whenLabel,
          reason: motivo || null,
          meetLink: googleEvent.meetLink
        });
        contactEmailSent = emailResult.sent;
      } catch (err) {
        console.warn("[crear_cita] email contacto:", err);
      }
    }

    return {
      ok: true,
      appointment_id: inserted?.id ?? null,
      google_event_id: googleEvent.id,
      when_label: whenLabel,
      team_notified: notifyResult.ok && !notifyResult.skipped,
      contact_email_sent: contactEmailSent,
      meet_link: googleEvent.meetLink
    };
  }
};

export const SCHEDULING_TOOLS: AgentToolDefinition[] = [buscarHorariosDisponiblesTool, crearCitaTool];
