"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { authFetch } from "@/lib/telephony-api";
import { useMobileTheme } from "../../../useMobileTheme";
import { ReceiptIcon, ChevronRightIcon, MoonIcon, BellIcon, LogoutIcon } from "../../../icons";
import { formatShortDate, initialsOf } from "../../../format";
import {
  isPushSupported,
  isSubscribedToPush,
  subscribeToPush,
  unsubscribeFromPush,
  type SubscribeResult
} from "../../../push";

const PUSH_ERROR_LABELS: Record<string, string> = {
  unsupported: "Este navegador no soporta notificaciones push.",
  no_vapid_key: "Notificaciones no configuradas todavía en este servidor.",
  permission_denied: "Bloqueaste el permiso de notificaciones — actívalo desde los ajustes del navegador/teléfono.",
  server_rejected: "El servidor rechazó la suscripción. Intenta de nuevo en un momento.",
  subscribe_failed: "No se pudo activar. Intenta de nuevo."
};

interface OrgMeResponse {
  organization: { id: string; name: string } | null;
  membership: { role_name: string; role_slug: string };
}

interface BillingSummary {
  planName: string;
  priceUsd: number;
  nextChargeDate: string | null;
}

function displayNameFromUser(user: { email?: string | null; user_metadata?: Record<string, unknown> } | null): string {
  if (!user) return "Usuario";
  const meta = user.user_metadata ?? {};
  const name = meta.full_name || meta.name || meta.display_name;
  if (typeof name === "string" && name.trim()) return name.trim();
  if (user.email) return user.email.split("@")[0];
  return "Usuario";
}

export default function MobileCuentaPage() {
  const router = useRouter();
  const { theme, toggle } = useMobileTheme();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [org, setOrg] = useState<OrgMeResponse | null>(null);
  const [billing, setBilling] = useState<BillingSummary | null>(null);
  const [pushSupported, setPushSupported] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const supported = isPushSupported();
      if (cancelled) return;
      setPushSupported(supported);
      if (supported) {
        const subscribed = await isSubscribedToPush();
        if (!cancelled) setPushEnabled(subscribed);
      }
    })();

    supabase.auth.getUser().then(({ data }) => {
      if (cancelled || !data.user) return;
      setName(displayNameFromUser(data.user));
      setEmail(data.user.email ?? "");
    });

    authFetch("/api/org/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data) setOrg(data);
      })
      .catch(() => {});

    authFetch("/api/billing/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        const planName = data.subscription?.plans?.name ?? null;
        const priceUsd = Number(data.subscription?.price_usd ?? data.subscription?.plans?.price_usd ?? 0);
        const nextChargeDate = data.subscription?.current_period_end ?? null;
        if (planName) setBilling({ planName, priceUsd, nextChargeDate });
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace("/m/login");
  }

  async function handleTogglePush() {
    if (pushBusy) return;
    setPushBusy(true);
    setPushError(null);
    try {
      if (pushEnabled) {
        await unsubscribeFromPush();
        setPushEnabled(false);
      } else {
        const result: SubscribeResult = await subscribeToPush();
        if (result.ok) {
          setPushEnabled(true);
        } else {
          setPushEnabled(false);
          // tsconfig del proyecto tiene "strict": false → sin strictNullChecks,
          // TS no estrecha uniones discriminadas aquí (confirmado de forma
          // aislada); se afirma el tipo en vez de depender de la estrechada.
          const reason = (result as { reason: string }).reason;
          setPushError(PUSH_ERROR_LABELS[reason] ?? "No se pudo activar. Intenta de nuevo.");
        }
      }
    } finally {
      setPushBusy(false);
    }
  }

  const roleName = org?.membership?.role_name || "Agente";
  const orgName = org?.organization?.name || "";

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <div className="app-head">
        <p className="kicker">{orgName || "Noova360"}</p>
        <h1>Cuenta</h1>
      </div>
      <div className="nv-m-scroll">
        <div className="set-body">
          <div className="id-card">
            <span className="avatar" style={{ background: "#3b4a63" }}>
              {initialsOf(name || email || "U")}
            </span>
            <div className="id-who">
              <b>{name || "…"}</b>
              <span>{email}</span>
              <span className="id-role">
                {roleName}
                {orgName ? ` · ${orgName}` : ""}
              </span>
            </div>
          </div>

          <div className="set-group">
            <Link href="/m/cuenta/facturacion" className="set-item rich">
              <ReceiptIcon />
              <span className="lbl-stack">
                <span className="lbl">Facturación</span>
                <span className="sub">
                  {billing
                    ? `${billing.planName}${billing.nextChargeDate ? ` · próx. cobro ${formatShortDate(billing.nextChargeDate)}` : ""}`
                    : "Ver plan y facturas"}
                </span>
              </span>
              <ChevronRightIcon className="chev" />
            </Link>
          </div>

          <div className="set-group">
            <div className="set-item">
              <MoonIcon />
              <span className="lbl">Modo oscuro</span>
              <button
                type="button"
                className="switch"
                role="switch"
                aria-checked={theme === "dark"}
                aria-label="Alternar modo oscuro"
                onClick={toggle}
              />
            </div>
            {pushSupported ? (
              <div className="set-item">
                <BellIcon />
                <span className="lbl">Notificaciones</span>
                <button
                  type="button"
                  className="switch"
                  role="switch"
                  aria-checked={pushEnabled}
                  aria-label="Alternar notificaciones"
                  onClick={handleTogglePush}
                  disabled={pushBusy}
                />
              </div>
            ) : null}
          </div>
          {pushError ? <p className="form-error">{pushError}</p> : null}

          <div className="set-group">
            <button type="button" className="set-item danger" onClick={handleLogout}>
              <LogoutIcon />
              <span className="lbl">Cerrar sesión</span>
            </button>
          </div>

          <p className="set-caption">Noova360</p>
        </div>
      </div>
    </div>
  );
}
