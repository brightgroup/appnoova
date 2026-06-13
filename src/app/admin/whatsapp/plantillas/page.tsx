"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, FileText, Loader2, Plus, Trash2 } from "lucide-react";
import { authFetch } from "@/lib/telephony-api";
import {
  btnGhost,
  btnPrimary,
  registryContent,
  registryTable,
  registryTableCell,
  registryTableHead,
  registryTableHeadCell,
  registryTableHeadRow,
  registryTableRowClickable,
  textMuted
} from "@/lib/brand-ui";
import {
  templateStatusColor,
  templateStatusLabel
} from "@/lib/whatsapp/template-record";
import type { WhatsAppChannelRecord } from "@/types/whatsapp-channel";
import type { WhatsAppTemplateRecord } from "@/types/whatsapp-template";

export default function AdminWhatsAppTemplatesPage() {
  const router = useRouter();
  const [templates, setTemplates] = useState<WhatsAppTemplateRecord[]>([]);
  const [channels, setChannels] = useState<WhatsAppChannelRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterChannel, setFilterChannel] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const [tplRes, chRes] = await Promise.all([
      authFetch(
        filterChannel
          ? `/api/admin/whatsapp/templates?whatsapp_channel_id=${filterChannel}`
          : "/api/admin/whatsapp/templates"
      ),
      authFetch("/api/admin/whatsapp/channels")
    ]);
    const tplData = await tplRes.json();
    const chData = await chRes.json();
    if (tplRes.ok) setTemplates(tplData.templates ?? []);
    if (chRes.ok) setChannels(chData.channels ?? []);
    setLoading(false);
  }, [filterChannel]);

  useEffect(() => { load(); }, [load]);

  const deleteTemplate = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("¿Eliminar esta plantilla de Noova?")) return;
    const res = await authFetch(`/api/admin/whatsapp/templates?id=${id}`, { method: "DELETE" });
    if (res.ok) load();
  };

  const channelLabel = (channelId: string) => {
    const ch = channels.find(c => c.id === channelId);
    return ch ? `${ch.e164}${ch.friendly_name ? ` — ${ch.friendly_name}` : ""}` : "—";
  };

  return (
    <div className="flex-1 flex flex-col bg-[#0d0e14] text-white min-h-0">
      <div className="border-b border-white/[.08] px-6 py-4 shrink-0">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href="/admin/whatsapp" className="p-1.5 hover:bg-white/[.08] rounded-lg text-gray-400">
              <ChevronLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-xl font-bold flex items-center gap-2">
                <FileText className="w-5 h-5 text-[#5b5bf6]" />
                Plantillas WhatsApp
              </h1>
              <p className={`${textMuted} text-xs mt-0.5`}>
                Crea, envía y monitorea la aprobación de plantillas
              </p>
            </div>
          </div>
          <Link href="/admin/whatsapp/plantillas/nueva" className={btnPrimary}>
            <Plus className="w-4 h-4" />
            Nueva plantilla
          </Link>
        </div>
      </div>

      <div className={registryContent}>
        <div className="flex items-center gap-3 mb-5">
          <select
            value={filterChannel}
            onChange={e => setFilterChannel(e.target.value)}
            className="bg-white/[.04] border border-white/[.10] rounded-lg px-3 py-2 text-sm min-w-[220px]"
          >
            <option value="">Todos los canales</option>
            {channels.map(ch => (
              <option key={ch.id} value={ch.id}>
                {ch.e164}
              </option>
            ))}
          </select>
          <button type="button" onClick={load} className={btnGhost}>
            Actualizar
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-gray-500" />
          </div>
        ) : templates.length === 0 ? (
          <div className="text-center py-20 space-y-4">
            <p className="text-sm text-gray-500">No hay plantillas todavía.</p>
            <Link href="/admin/whatsapp/plantillas/nueva" className={btnPrimary}>
              <Plus className="w-4 h-4" />
              Crear primera plantilla
            </Link>
          </div>
        ) : (
          <table className={`${registryTable} min-w-full`}>
            <thead className={registryTableHead}>
              <tr className={registryTableHeadRow}>
                <th className={registryTableHeadCell}>Nombre</th>
                <th className={registryTableHeadCell}>Canal</th>
                <th className={registryTableHeadCell}>Categoría</th>
                <th className={registryTableHeadCell}>Estado</th>
                <th className={registryTableHeadCell}>Actualizado</th>
                <th className={registryTableHeadCell} />
              </tr>
            </thead>
            <tbody>
              {templates.map(tpl => (
                <tr
                  key={tpl.id}
                  className={registryTableRowClickable}
                  onClick={() => router.push(`/admin/whatsapp/plantillas/${tpl.id}`)}
                >
                  <td className={`${registryTableCell} text-sm`}>
                    <div className="font-medium text-white">{tpl.template_name}</div>
                    <div className={`${textMuted} text-xs mt-1 line-clamp-1 max-w-xs`}>
                      {tpl.body_source ?? tpl.body_preview}
                    </div>
                  </td>
                  <td className={`${registryTableCell} text-xs font-mono text-gray-300`}>
                    {channelLabel(tpl.whatsapp_channel_id)}
                  </td>
                  <td className={`${registryTableCell} text-xs capitalize text-gray-300`}>
                    {tpl.category}
                  </td>
                  <td className={registryTableCell}>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${templateStatusColor(tpl.status)}`}>
                      {templateStatusLabel(tpl.status)}
                    </span>
                  </td>
                  <td className={`${registryTableCell} text-xs text-gray-400`}>
                    {tpl.updated_at
                      ? new Date(tpl.updated_at).toLocaleDateString("es", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric"
                        })
                      : "—"}
                  </td>
                  <td className={registryTableCell}>
                    <button
                      type="button"
                      onClick={e => deleteTemplate(tpl.id, e)}
                      className={btnGhost}
                      title="Eliminar"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
