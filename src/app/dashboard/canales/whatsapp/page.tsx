"use client";

import { useState } from "react";
import { MessageCircle, Plus, Clock } from "lucide-react";
import { btnPrimary, registryTable, registryTableHead, registryTableHeadRow, registryTableHeadCell, registryTableEmpty } from "@/lib/brand-ui";
import { ChannelListPage } from "@/components/dashboard/ChannelListPage";

export default function WhatsAppListPage() {
  const [search, setSearch] = useState("");

  return (
    <ChannelListPage
      title="WhatsApp"
      description="Conecte líneas de WhatsApp Business y asigne un agente de texto a cada una."
      tableDescription="Puede conectar varias cuentas de WhatsApp. Cada línea tendrá su propia configuración."
      search={search}
      onSearchChange={setSearch}
      action={
        <button type="button" disabled className={`${btnPrimary} opacity-50 cursor-not-allowed`}>
          <Plus className="w-4 h-4" /> Conectar WhatsApp
        </button>
      }
    >
      <table className={`${registryTable} min-w-[720px]`}>
        <thead className={registryTableHead}>
          <tr className={registryTableHeadRow}>
            <th className={registryTableHeadCell}>Línea</th>
            <th className={registryTableHeadCell}>Número</th>
            <th className={registryTableHeadCell}>Agente</th>
            <th className={registryTableHeadCell}>Estado</th>
          </tr>
        </thead>
      </table>
      <div className={registryTableEmpty}>
        <MessageCircle className="w-10 h-10 text-emerald-500/50 mb-3 mx-auto" />
        <p className="text-sm text-gray-400 mb-2">Aún no hay líneas de WhatsApp conectadas</p>
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[.04] border border-white/[.08] text-xs text-gray-500">
          <Clock className="w-3.5 h-3.5" />
          Próximamente
        </div>
      </div>
    </ChannelListPage>
  );
}
