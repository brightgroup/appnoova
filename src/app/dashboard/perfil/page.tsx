"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, Loader2, Building2, Pencil } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { authFetch } from "@/lib/telephony-api";
import {
  registryContent,
  registryPage,
  registryPanel,
  registryToolbar,
  textMuted,
} from "@/lib/brand-ui";
import { BillingProfileForm, type BillingProfile } from "@/components/billing/BillingProfileForm";
import { isBillingProfileComplete } from "@/lib/billing/billing-profile";

function displayName(meta: Record<string, unknown> | undefined, email: string | undefined): string {
  const fromMeta =
    (meta?.nombre as string | undefined) ||
    (meta?.full_name as string | undefined) ||
    (meta?.name as string | undefined);
  if (fromMeta?.trim()) return fromMeta.trim();
  if (email) return email.split("@")[0] ?? "Usuario";
  return "Usuario";
}

export default function PerfilPage() {
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("—");
  const [email, setEmail] = useState("—");
  const [orgName, setOrgName] = useState("—");
  const [initials, setInitials] = useState("?");
  const [billingProfile, setBillingProfile] = useState<BillingProfile | null>(null);
  const [editingBillingProfile, setEditingBillingProfile] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [{ data: { user } }, billingRes, profileRes] = await Promise.all([
        supabase.auth.getUser(),
        authFetch("/api/billing/me"),
        authFetch("/api/billing/profile"),
      ]);
      if (cancelled) return;

      const dn = displayName(user?.user_metadata, user?.email ?? undefined);
      setName(dn);
      setEmail(user?.email ?? "—");
      setInitials(
        dn
          .split(/\s+/)
          .slice(0, 2)
          .map(p => p[0]?.toUpperCase() ?? "")
          .join("") || "?"
      );

      if (billingRes.ok) {
        const json = await billingRes.json();
        setOrgName(json.organization?.name ?? json.subscription?.plans?.name ?? "—");
      }
      if (profileRes.ok) {
        const json = await profileRes.json();
        setBillingProfile(json.profile ?? null);
        if (!isBillingProfileComplete(json.profile)) setEditingBillingProfile(true);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className={registryPage}>
      <div className={registryToolbar}>
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="p-1.5 rounded-lg text-[var(--nv-text-muted)] hover:bg-[var(--nv-hover-strong)] hover:text-[var(--nv-text)] transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-[var(--nv-text)]">Mi perfil</h1>
            <p className={`text-xs ${textMuted} mt-0.5`}>Datos de tu cuenta</p>
          </div>
        </div>
      </div>

      <div className={registryContent}>
        {loading ? (
          <div className="flex items-center justify-center py-20 text-[var(--nv-text-muted)]">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            Cargando perfil…
          </div>
        ) : (
          <div className={`${registryPanel} max-w-lg rounded-xl border border-[var(--nv-border)] bg-[var(--nv-bg-surface)] p-6`}>
            <div className="flex items-center gap-4 mb-6">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#0fe3ff] text-lg font-bold text-[#03289d]">
                {initials}
              </div>
              <div className="min-w-0">
                <p className="text-lg font-semibold text-[var(--nv-text)] truncate">{name}</p>
                <p className="text-sm text-[var(--nv-text-muted)] truncate">{email}</p>
              </div>
            </div>

            <dl className="space-y-4 text-sm">
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-[var(--nv-text-faint)]">
                  Nombre
                </dt>
                <dd className="mt-1 text-[var(--nv-text)]">{name}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-[var(--nv-text-faint)]">
                  Correo
                </dt>
                <dd className="mt-1 text-[var(--nv-text)]">{email}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-[var(--nv-text-faint)]">
                  Organización
                </dt>
                <dd className="mt-1 text-[var(--nv-text)]">{orgName}</dd>
              </div>
            </dl>
          </div>
        )}

        {!loading && (
          <div className={`${registryPanel} max-w-lg rounded-xl border border-[var(--nv-border)] bg-[var(--nv-bg-surface)] p-6 mt-5`}>
            <div className="flex items-center justify-between gap-3 mb-5">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-[var(--nv-accent)]" />
                <div>
                  <h2 className="text-sm font-bold text-[var(--nv-text)]">Datos de facturación</h2>
                  <p className="text-[11px] text-[var(--nv-text-muted)] mt-0.5">
                    Requeridos para poder pagar tu plan — así podemos emitir la factura.
                  </p>
                </div>
              </div>
              {isBillingProfileComplete(billingProfile) && !editingBillingProfile && (
                <button
                  onClick={() => setEditingBillingProfile(true)}
                  className="flex items-center gap-1 text-[11px] text-[var(--nv-accent)] hover:underline shrink-0"
                >
                  <Pencil className="w-3 h-3" /> Editar
                </button>
              )}
            </div>

            {isBillingProfileComplete(billingProfile) && !editingBillingProfile ? (
              <dl className="space-y-4 text-sm">
                <div>
                  <dt className="text-[11px] font-semibold uppercase tracking-wide text-[var(--nv-text-faint)]">
                    {billingProfile!.tipo_persona === "natural" ? "Nombre completo" : "Razón social"}
                  </dt>
                  <dd className="mt-1 text-[var(--nv-text)]">{billingProfile!.razon_social}</dd>
                </div>
                <div>
                  <dt className="text-[11px] font-semibold uppercase tracking-wide text-[var(--nv-text-faint)]">
                    Documento
                  </dt>
                  <dd className="mt-1 text-[var(--nv-text)]">
                    {billingProfile!.tipo_documento} {billingProfile!.numero_documento}
                    {billingProfile!.digito_verificacion ? `-${billingProfile!.digito_verificacion}` : ""}
                  </dd>
                </div>
                {billingProfile!.direccion && (
                  <div>
                    <dt className="text-[11px] font-semibold uppercase tracking-wide text-[var(--nv-text-faint)]">
                      Dirección
                    </dt>
                    <dd className="mt-1 text-[var(--nv-text)]">
                      {billingProfile!.direccion}{billingProfile!.ciudad ? `, ${billingProfile!.ciudad}` : ""}
                    </dd>
                  </div>
                )}
                {billingProfile!.email_facturacion && (
                  <div>
                    <dt className="text-[11px] font-semibold uppercase tracking-wide text-[var(--nv-text-faint)]">
                      Email de facturación
                    </dt>
                    <dd className="mt-1 text-[var(--nv-text)]">{billingProfile!.email_facturacion}</dd>
                  </div>
                )}
              </dl>
            ) : (
              <BillingProfileForm
                initial={billingProfile}
                onCancel={isBillingProfileComplete(billingProfile) ? () => setEditingBillingProfile(false) : undefined}
                onSaved={(profile) => {
                  setBillingProfile(profile);
                  setEditingBillingProfile(false);
                }}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
