"use client";

import { useEffect, useState } from "react";
import { X, UserPlus, Copy, Check } from "lucide-react";
import { NoovaSelect } from "@/components/ui/NoovaSelect";
import { btnPrimary, btnGhost } from "@/lib/brand-ui";
import { getAgencyAccessLoginUrl } from "@/lib/agency-access-url";

interface RoleOption {
  id: string;
  name: string;
  slug: string;
}

interface InviteMemberModalProps {
  open: boolean;
  roles: RoleOption[];
  saving?: boolean;
  seatsRemaining?: number | null;
  onClose: () => void;
  onSubmit: (data: { email: string; role_id: string; full_name: string; password?: string }) => void;
}

export function InviteMemberModal({
  open,
  roles,
  saving,
  seatsRemaining,
  onClose,
  onSubmit,
}: InviteMemberModalProps) {
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [roleId, setRoleId] = useState("");
  const [copied, setCopied] = useState(false);

  const loginUrl = getAgencyAccessLoginUrl();
  const seatsFull = seatsRemaining === 0;

  useEffect(() => {
    if (open) {
      setEmail("");
      setFullName("");
      setPassword("");
      setRoleId(roles.find((r) => r.slug === "advisor")?.id ?? roles[0]?.id ?? "");
      setCopied(false);
    }
  }, [open, roles]);

  if (!open) return null;

  const roleOptions = roles.map((r) => ({ value: r.id, label: r.name }));

  async function copyLoginUrl() {
    try {
      await navigator.clipboard.writeText(loginUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
      <div className="w-full max-w-md rounded-2xl bg-[var(--nv-bg-surface,#12131a)] border border-[var(--nv-border,white/10)] shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--nv-border,white/08)]">
          <div className="flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-[#5b5bf6]" />
            <h2 className="text-lg font-semibold text-[var(--nv-text,white)]">Agregar al equipo</h2>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded-lg hover:bg-white/[.08] text-gray-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {seatsFull ? (
            <p className="text-xs text-amber-400/90 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2">
              Alcanzaste el límite de usuarios de tu plan. Actualiza el plan en Facturación para agregar más.
            </p>
          ) : (
            <>
              <p className="text-xs text-gray-500 leading-relaxed">
                Se crea la cuenta de inmediato. Puedes definir una contraseña o dejar en blanco para generar una temporal.
                Comparte el link de ingreso con el nuevo usuario.
              </p>
              <div className="rounded-lg border border-white/[.08] bg-white/[.02] px-3 py-2 flex items-center gap-2">
                <code className="flex-1 min-w-0 text-[10px] text-gray-500 truncate">{loginUrl}</code>
                <button
                  type="button"
                  onClick={copyLoginUrl}
                  className="shrink-0 inline-flex items-center gap-1 text-[10px] text-gray-400 hover:text-white"
                >
                  {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  {copied ? "Copiado" : "Copiar"}
                </button>
              </div>
            </>
          )}

          <div>
            <label className="block text-xs text-gray-500 mb-1.5">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="asesor@empresa.com"
              disabled={seatsFull}
              className="w-full px-4 py-2.5 rounded-xl bg-[var(--nv-bg,#0d0e14)] border border-[var(--nv-border,white/12)] text-sm text-white disabled:opacity-50"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">Nombre (opcional)</label>
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Nombre del asesor"
              disabled={seatsFull}
              className="w-full px-4 py-2.5 rounded-xl bg-[var(--nv-bg,#0d0e14)] border border-[var(--nv-border,white/12)] text-sm text-white disabled:opacity-50"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">Contraseña (opcional)</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Generar automática si queda vacío"
              disabled={seatsFull}
              className="w-full px-4 py-2.5 rounded-xl bg-[var(--nv-bg,#0d0e14)] border border-[var(--nv-border,white/12)] text-sm text-white disabled:opacity-50"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">Rol</label>
            <NoovaSelect
              value={roleId}
              onChange={setRoleId}
              options={roleOptions}
              allowEmpty={false}
              disabled={seatsFull}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-[var(--nv-border,white/08)]">
          <button type="button" onClick={onClose} className={btnGhost}>Cancelar</button>
          <button
            type="button"
            disabled={seatsFull || !email.trim() || !roleId || saving}
            onClick={() =>
              onSubmit({
                email: email.trim(),
                role_id: roleId,
                full_name: fullName.trim(),
                password: password.trim() || undefined,
              })
            }
            className={btnPrimary}
          >
            {saving ? "Guardando…" : "Crear usuario"}
          </button>
        </div>
      </div>
    </div>
  );
}
