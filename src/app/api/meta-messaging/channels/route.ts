import { NextRequest, NextResponse } from "next/server";
import { requireOrgModule } from "@/lib/module-auth";
import { isMissingTableError } from "@/lib/supabase-table-error";
import { textAgentsAdminClient } from "@/lib/text-agents-server";
import { toPublicMetaMessagingChannel } from "@/lib/meta-messaging/channel-public";
import type { MetaMessagingChannelRecord } from "@/lib/meta-messaging/types";

/** GET — canales Messenger / Instagram de la organización (sin tokens). */
export async function GET(req: NextRequest) {
  const orgCtx = await requireOrgModule(req, "channels", "view");
  if (orgCtx instanceof NextResponse) return orgCtx;

  const db = textAgentsAdminClient();
  const { data, error } = await db
    .from("meta_messaging_channels")
    .select("*")
    .eq("organization_id", orgCtx.organizationId)
    .neq("status", "disconnected")
    .order("created_at", { ascending: false });

  if (error) {
    if (isMissingTableError(error)) return NextResponse.json({ channels: [], dbReady: false });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    channels: ((data ?? []) as MetaMessagingChannelRecord[]).map(toPublicMetaMessagingChannel),
    dbReady: true
  });
}
