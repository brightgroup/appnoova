import { NextRequest, NextResponse } from "next/server";
import { isMissingColumnError, isMissingTableError } from "@/lib/supabase-table-error";
import { isValidMicrositeSlug, slugifyBrandName, buildWidgetPageUrl } from "@/lib/microsite-slug";
import { normalizeWidgetForm, toWidgetRecord, widgetDefaultForm } from "@/lib/widget-record";
import { getWidgetByUserId, mapWidgetDbError } from "@/lib/widget-server";
import { textAgentsAdminClient, getTextAgentUserIdFromRequest } from "@/lib/text-agents-server";

export async function GET(req: NextRequest) {
  const userId = await getTextAgentUserIdFromRequest(req);
  if (!userId) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const db = textAgentsAdminClient();
  const widget = await getWidgetByUserId(db, userId);

  if (!widget) {
    return NextResponse.json({ widget: null, dbReady: true });
  }

  return NextResponse.json({
    widget,
    widget_url: buildWidgetPageUrl(widget.slug),
    dbReady: true
  });
}

export async function POST(req: NextRequest) {
  const userId = await getTextAgentUserIdFromRequest(req);
  if (!userId) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const body = await req.json();
  const form = normalizeWidgetForm(body);
  const slugInput = body.slug != null ? slugifyBrandName(String(body.slug)) : "";

  if (!form.text_agent_id && form.is_published) {
    return NextResponse.json({ error: "Selecciona un agente de texto antes de publicar el widget" }, { status: 400 });
  }

  const db = textAgentsAdminClient();
  const existing = await getWidgetByUserId(db, userId);

  if (form.text_agent_id) {
    const { data: agent } = await db
      .from("text_agents")
      .select("id")
      .eq("id", form.text_agent_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (!agent) {
      return NextResponse.json({ error: "Agente de texto no encontrado" }, { status: 400 });
    }
  }

  if (!existing) {
    if (!isValidMicrositeSlug(slugInput)) {
      return NextResponse.json(
        { error: "Slug inválido. Usa letras minúsculas, números y guiones (3–50 caracteres)." },
        { status: 400 }
      );
    }

    const { data: slugTaken } = await db
      .from("broker_web_widgets")
      .select("id")
      .eq("slug", slugInput)
      .maybeSingle();
    if (slugTaken) {
      return NextResponse.json({ error: "Ese nombre de widget ya está en uso" }, { status: 409 });
    }

    const defaults = widgetDefaultForm();
    const { data, error } = await db
      .from("broker_web_widgets")
      .insert({
        user_id: userId,
        slug: slugInput,
        text_agent_id: form.text_agent_id ?? defaults.text_agent_id,
        accent_color: form.accent_color || defaults.accent_color,
        button_color: form.button_color || defaults.button_color,
        logo_url: form.logo_url ?? defaults.logo_url,
        favicon_url: form.favicon_url ?? defaults.favicon_url,
        agent_display_name: form.agent_display_name ?? defaults.agent_display_name,
        quick_actions: form.quick_actions.length ? form.quick_actions : defaults.quick_actions,
        is_published: form.is_published,
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      const mapped = mapWidgetDbError(error);
      if (mapped.ok === false) {
        const status = mapped.code === "missing_table" || mapped.code === "missing_column" ? 503 : 500;
        return NextResponse.json({ error: mapped.message, dbReady: false }, { status });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const widget = toWidgetRecord(data);
    return NextResponse.json({
      widget,
      widget_url: buildWidgetPageUrl(widget.slug),
      created: true
    });
  }

  if (slugInput && slugInput !== existing.slug) {
    return NextResponse.json(
      { error: "La URL del widget no se puede cambiar después de crearla." },
      { status: 400 }
    );
  }

  const row = {
    text_agent_id: form.text_agent_id,
    accent_color: form.accent_color,
    button_color: form.button_color,
    logo_url: form.logo_url,
    favicon_url: form.favicon_url,
    agent_display_name: form.agent_display_name,
    quick_actions: form.quick_actions,
    is_published: form.is_published,
    updated_at: new Date().toISOString()
  };

  const { data, error } = await db
    .from("broker_web_widgets")
    .update(row)
    .eq("user_id", userId)
    .select()
    .single();

  if (error) {
    if (isMissingTableError(error)) {
      return NextResponse.json({ error: "Ejecuta 018_broker_web_widgets.sql en Supabase", dbReady: false }, { status: 503 });
    }
    if (isMissingColumnError(error)) {
      return NextResponse.json({ error: "Ejecuta 020_widget_standalone.sql en Supabase", dbReady: false }, { status: 503 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const widget = toWidgetRecord(data);
  return NextResponse.json({
    widget,
    widget_url: buildWidgetPageUrl(widget.slug)
  });
}
