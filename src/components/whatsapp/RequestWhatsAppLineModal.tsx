"use client";

import { useEffect, useState } from "react";
import { X, Loader2, MessageCircle, AlertCircle } from "lucide-react";
import { getAuthHeaders } from "@/lib/text-agents-api";
import { accentFocus, btnPrimary, btnGhost } from "@/lib/brand-ui";
import type { TextAgentListItem } from "@/types/text-agent";

interface RequestWhatsAppLineModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function RequestWhatsAppLineModal({ open, onClose, onSuccess }: RequestWhatsAppLineModalProps) {
  const [loading, setLoading] = useState(false);
  const [agents, setAgents] = useState<TextAgentListItem[]>([]);
  const [form, setForm] = useState({
    friendly_name: "",
    phone_e164: "",
    text_agent_id: "",
    notes: ""
  });
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      getAuthHeaders()
        .then(headers => fetch("/api/text/agents", { headers }))
        .then(res => res.json())
        .then(data => {
          if (data.agents) setAgents(data.agents);
        })
        .catch(console.error);
    }
  }, [open]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/whatsapp/requests", {
        method: "POST",
        headers,
        body: JSON.stringify(form)
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al enviar solicitud");

      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md bg-[#13141c] border border-white/[.08] rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[.08]">
          <div className="flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-emerald-400" />
            <h2 className="text-lg font-bold text-white">Solicitar línea WhatsApp</h2>
          </div>
          <button onClick={onClose} className="p-1 text-gray-500 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
              Nombre de la línea
            </label>
            <input
              type="text"
              required
              placeholder="Ej: Ventas Principal"
              className={`w-full bg-white/[.03] border border-white/[.1] rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 ${accentFocus}`}
              value={form.friendly_name}
              onChange={e => setForm({ ...form, friendly_name: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
              Número sugerido (opcional)
            </label>
            <input
              type="text"
              placeholder="+57300..."
              className={`w-full bg-white/[.03] border border-white/[.1] rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 ${accentFocus}`}
              value={form.phone_e164}
              onChange={e => setForm({ ...form, phone_e164: e.target.value })}
            />
            <p className="mt-1.5 text-[11px] text-gray-500 leading-relaxed">
              Si ya tienes un número WhatsApp Business, podemos intentar vincularlo.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
              Agente IA asignado
            </label>
            <select
              className={`w-full bg-white/[.03] border border-white/[.1] rounded-xl px-4 py-2.5 text-sm text-white appearance-none ${accentFocus}`}
              value={form.text_agent_id}
              onChange={e => setForm({ ...form, text_agent_id: e.target.value })}
            >
              <option value="">Seleccionar agente...</option>
              {agents.map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
              Notas adicionales
            </label>
            <textarea
              rows={3}
              placeholder="¿Alguna instrucción especial?"
              className={`w-full bg-white/[.03] border border-white/[.1] rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 resize-none ${accentFocus}`}
              value={form.notes}
              onChange={e => setForm({ ...form, notes: e.target.value })}
            />
          </div>

          <div className="pt-2 flex gap-3">
            <button type="button" onClick={onClose} className={`flex-1 ${btnGhost}`}>
              Cancelar
            </button>
            <button type="submit" disabled={loading} className={`flex-1 ${btnPrimary}`}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Enviar solicitud"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
