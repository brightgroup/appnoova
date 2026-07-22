import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/voice-agents-server";
import { getAppBaseUrl } from "@/lib/telephony/app-url";
import { exchangeGoogleAuthCode, fetchGoogleUserEmail, verifyGoogleOAuthState } from "@/lib/google-calendar/oauth";
import { upsertCalendarConnection } from "@/lib/google-calendar/connections-db";

const RETURN_PATH = "/dashboard/conectores/google-calendar";

function redirectWith(params: Record<string, string>): NextResponse {
  const url = new URL(`${getAppBaseUrl()}${RETURN_PATH}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return NextResponse.redirect(url.toString());
}

/** GET — callback de Google tras el consentimiento OAuth. */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const stateRaw = req.nextUrl.searchParams.get("state");
  const oauthError = req.nextUrl.searchParams.get("error");

  if (oauthError) {
    return redirectWith({ error: oauthError === "access_denied" ? "cancelado" : oauthError });
  }
  if (!code || !stateRaw) {
    return redirectWith({ error: "callback_invalido" });
  }

  const state = verifyGoogleOAuthState(stateRaw);
  if (!state) {
    return redirectWith({ error: "state_invalido" });
  }

  try {
    const tokens = await exchangeGoogleAuthCode(code);
    const email = await fetchGoogleUserEmail(tokens.accessToken);

    const db = adminClient();
    await upsertCalendarConnection(db, {
      organizationId: state.organizationId,
      connectedByUserId: state.userId,
      googleEmail: email,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresInSec: tokens.expiresInSec,
      scope: tokens.scope
    });

    return redirectWith({ connected: "1" });
  } catch (err) {
    console.error("[conectores/google-calendar/callback]", err);
    return redirectWith({ error: err instanceof Error ? err.message : "error_desconocido" });
  }
}
