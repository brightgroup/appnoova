"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, FileText, Loader2, Plus, Trash2 } from "lucide-react";
import { getAuthHeaders } from "@/lib/text-agents-api";
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
import { NoovaSelect } from "@/components/ui/NoovaSelect";

export default function DashboardWhatsAppTemplatesPage() {
  const router = useRouter();
  const [templates, setTemplates] = useState<WhatsAppTemplateRecord[]>([]);
  const [channels, setChannels] = useState<WhatsAppChannelRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterChannel, setFilterChannel] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const headers = await getAuthHeaders();
      const tplUrl = filterChannel
        ? `/api/whatsapp/templates?whatsapp_channel_id=${filterChannel}`
        : "/api/whatsapp/templates";
      const [tplRes, chRes] = await Promise.all([
        fetch(tplUrl, { headers }),
        fetch("/api/whatsapp/channels", { headers })
      ]);
      const tplData = await tplRes.json();
      const chData = await chRes.json();
      if (tplRes.ok) setTemplates(tplData.templates ?? []);
      if (chRes.ok) setChannels(chData.channels ?? []);
    } finally {
      setLoading(false);
    }
  }, [filterChannel]);

  useEffect(() => { load(); }, [load]);

  const deleteTemplate = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("¿Eliminar esta plantilla?")) return;
    const headers = await getAuthHeaders();
    const res = await fetch(`/api/whatsapp/templates?id=${id}`, { method: "DELETE", headers });
    if (res.ok) load();
  };

  const channelLabel = (channelId: string) => {
    const ch = channels.find(c => c.id === channelId);
    return ch ? `${ch.e164}${ch.friendly_name ? ` — ${ch.friendly_name}` : ""}` : "—";
  };

  return (
    <div className="flex-1 flex flex-col bg-noova-main text-white min-h-0">
      <div className="border-b border-white/[.08] px-6 py-4 shrink-0">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard/canales/whatsapp"
              className="p-1.5 hover:bg-white/[.08] rounded-lg text-gray-400"
            >
              <ChevronLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-xl font-bold flex items-center gap-2">
                <FileText className="w-5 h-5 text-[#5b5bf6]" />
                Plantillas WhatsApp
              </h1>
              <p className={`${textMuted} text-xs mt-0.5`}>
                Crea mensajes para recontactar clientes fuera de la ventana de 24 h
              </p>
            </div>
          </div>
          <Link href="/dashboard/canales/whatsapp/plantillas/nueva" className={btnPrimary}>
            <Plus className="w-4 h-4" />
            Nueva plantilla
          </Link>
        </div>
      </div>

      <div className={registryContent}>
        <div className="flex items-center gap-3 mb-5">
          <NoovaSelect
            value={filterChannel}
            onChange={setFilterChannel}
            allowEmpty={true}
            emptyLabel="Todas las líneas"
            className="min-w-[220px]"
            options={channels.map(ch => ({ value: ch.id, label: ch.e164 }))}
          />
          <button type="button" onClick={load} className={btnGhost}>
            Actualizar
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-gray-500" />
          </div>
        ) : channels.length === 0 ? (
          <div className="text-center py-20 space-y-4">
            <p className="text-sm text-gray-500">Primero necesitas una línea WhatsApp activa.</p>
            <Link href="/dashboard/canales/whatsapp" className={btnPrimary}>
              Ver líneas WhatsApp
            </Link>
          </div>
        ) : templates.length === 0 ? (
          <div className="text-center py-20 space-y-4">
            <p className="text-sm text-gray-500">Aún no tienes plantillas para tu negocio.</p>
            <Link href="/dashboard/canales/whatsapp/plantillas/nueva" className={btnPrimary}>
              <Plus className="w-4 h-4" />
              Crear primera plantilla
            </Link>
          </div>
        ) : (
          <table className={`${registryTable} min-w-full`}>
            <thead className={registryTableHead}>
              <tr className={registryTableHeadRow}>
                <th className={registryTableHeadCell}>Nombre</th>
                <th className={registryTableHeadCell}>Línea</th>
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
                  onClick={() => router.push(`/dashboard/canales/whatsapp/plantillas/${tpl.id}`)}
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
                    {(tpl.status === "draft" || tpl.status === "rejected") && (
                      <button
                        type="button"
                        onClick={e => deleteTemplate(tpl.id, e)}
                        className={btnGhost}
                        title="Eliminar"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
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
