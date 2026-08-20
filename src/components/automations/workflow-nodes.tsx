"use client";

import { createContext, useContext, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Zap, Webhook, Globe, Copy, Check, Bot } from "lucide-react";
import { WhatsAppLogo } from "@/components/icons/brands/WhatsAppLogo";
import type { AutomationConnectionRecord } from "@/lib/automations/connections-db";
import type { WorkflowNodeData, WorkflowNodeType } from "@/lib/automations/node-types";
import type { WhatsAppChannelRecord } from "@/types/whatsapp-channel";

/** Lista de conexiones disponibles, para que el nodo de acción resuelva el nombre del conector elegido. */
export const ConnectionsContext = createContext<AutomationConnectionRecord[]>([]);
/** Líneas de WhatsApp disponibles, para que el nodo disparador resuelva el nombre del canal elegido. */
export const ChannelsContext = createContext<WhatsAppChannelRecord[]>([]);

/** Color corporativo sólido de cada nodo — reutilizado por el nodo en canvas y por la paleta. */
export const NODE_BRAND_COLOR: Record<string, string> = {
  "trigger.whatsapp_message": "#25D366",
  "trigger.webhook": "#F5A623",
  "action.ai_extract": "#8B5CF6",
  "action.webhook": "#0EA5E9",
  "action.send_whatsapp_message": "#25D366"
};

/** Nombre "de fábrica" de cada tipo de nodo — lo que se ve cuando no hay canal/conexión elegido ni nombre propio. */
export const NODE_TITLE: Record<WorkflowNodeType, string> = {
  "trigger.whatsapp_message": "Mensaje de WhatsApp recibido",
  "trigger.webhook": "Webhook entrante",
  "action.ai_extract": "IA",
  "action.webhook": "HTTP Request",
  "action.send_whatsapp_message": "Enviar mensaje de WhatsApp"
};

const MEDIA_FILTER_LABEL: Record<string, string> = {
  image: "Imagen de WhatsApp",
  document: "Documento (PDF) de WhatsApp",
  text: "Texto de WhatsApp"
};

/**
 * Etiqueta que se muestra para un nodo — la misma función la usa el nodo en
 * el canvas y el panel de configuración, para que nunca queden desincronizados.
 * Prioridad: nombre propio (`data.label`, puesto a mano con el lápiz) > valor
 * calculado (canal/conexión elegidos, o el filtro de imagen/texto) > nombre
 * de fábrica del tipo de nodo.
 */
export function resolveNodeLabel(
  type: WorkflowNodeType,
  data: WorkflowNodeData,
  channels: WhatsAppChannelRecord[],
  connections: AutomationConnectionRecord[]
): string {
  if (data.label?.trim()) return data.label.trim();

  if (type === "trigger.whatsapp_message") {
    const channel = channels.find(c => c.id === data.channelId);
    if (channel) return channel.friendly_name || channel.e164;
    if (data.mediaFilter && data.mediaFilter !== "any") return MEDIA_FILTER_LABEL[data.mediaFilter] ?? NODE_TITLE[type];
  }
  if (type === "action.webhook") {
    const connection = connections.find(c => c.id === data.connectionId);
    if (connection) return connection.name;
  }
  return NODE_TITLE[type];
}

function NodeShell({
  selected,
  label,
  isTrigger,
  color,
  children
}: {
  selected?: boolean;
  label: string;
  isTrigger?: boolean;
  color: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5 w-[84px]">
      <div
        className={`relative w-[84px] h-[84px] rounded-2xl flex items-center justify-center transition-shadow ${
          selected ? "ring-2 ring-white ring-offset-2 ring-offset-[#111218]" : "shadow-[0_2px_6px_rgba(0,0,0,.4)]"
        }`}
        style={{ backgroundColor: color }}
      >
        {isTrigger && (
          <span className="absolute -top-1.5 -left-1.5 w-5 h-5 rounded-full bg-white border-2 border-[#111218] flex items-center justify-center">
            <Zap className="w-2.5 h-2.5" style={{ color }} fill={color} />
          </span>
        )}
        {children}
      </div>
      <div className="text-[11px] font-semibold text-gray-200 text-center leading-tight max-w-[104px] truncate">
        {label}
      </div>
    </div>
  );
}

/** Disparador de imagen o de texto de WhatsApp — mismo componente, mismo ícono de marca, mismo selector de canal. */
export function WhatsAppTriggerNode({ selected, data, type }: NodeProps) {
  const channels = useContext(ChannelsContext);
  const nodeType = type as WorkflowNodeType;
  const label = resolveNodeLabel(nodeType, (data as WorkflowNodeData) ?? {}, channels, []);

  return (
    <NodeShell selected={selected} label={label} isTrigger color={NODE_BRAND_COLOR[nodeType]}>
      <WhatsAppLogo className="w-10 h-10 text-white" />
      <Handle type="source" position={Position.Right} className="!bg-white !w-2.5 !h-2.5 !border-2 !border-[#111218]" />
    </NodeShell>
  );
}

export function WebhookTriggerNode({ selected, data }: NodeProps) {
  const label = resolveNodeLabel("trigger.webhook", (data as WorkflowNodeData) ?? {}, [], []);
  return (
    <NodeShell selected={selected} label={label} isTrigger color={NODE_BRAND_COLOR["trigger.webhook"]}>
      <Webhook className="w-10 h-10 text-white" strokeWidth={1.8} />
      <Handle type="source" position={Position.Right} className="!bg-white !w-2.5 !h-2.5 !border-2 !border-[#111218]" />
    </NodeShell>
  );
}

export function WebhookActionNode({ selected, data }: NodeProps) {
  const connections = useContext(ConnectionsContext);
  const label = resolveNodeLabel("action.webhook", (data as WorkflowNodeData) ?? {}, [], connections);

  return (
    <NodeShell selected={selected} label={label} color={NODE_BRAND_COLOR["action.webhook"]}>
      <Handle type="target" position={Position.Left} className="!bg-white !w-2.5 !h-2.5 !border-2 !border-[#111218]" />
      <Globe className="w-10 h-10 text-white" strokeWidth={1.6} />
      <Handle type="source" position={Position.Right} className="!bg-white !w-2.5 !h-2.5 !border-2 !border-[#111218]" />
    </NodeShell>
  );
}

/**
 * Va en el medio de la cadena (trigger → ai_extract → webhook) — igual que WebhookActionNode,
 * tiene handle target Y source. Hoy solo hace extracción de campos, pero el nodo (y su ícono
 * genérico de robot, no de "extracción") está pensado para ganar más acciones de IA después.
 */
export function AiExtractNode({ selected, data }: NodeProps) {
  const label = resolveNodeLabel("action.ai_extract", (data as WorkflowNodeData) ?? {}, [], []);
  return (
    <NodeShell selected={selected} label={label} color={NODE_BRAND_COLOR["action.ai_extract"]}>
      <Handle type="target" position={Position.Left} className="!bg-white !w-2.5 !h-2.5 !border-2 !border-[#111218]" />
      <Bot className="w-10 h-10 text-white" strokeWidth={1.6} />
      <Handle type="source" position={Position.Right} className="!bg-white !w-2.5 !h-2.5 !border-2 !border-[#111218]" />
    </NodeShell>
  );
}

export function SendWhatsAppMessageNode({ selected, data }: NodeProps) {
  const label = resolveNodeLabel("action.send_whatsapp_message", (data as WorkflowNodeData) ?? {}, [], []);
  return (
    <NodeShell selected={selected} label={label} color={NODE_BRAND_COLOR["action.send_whatsapp_message"]}>
      <Handle type="target" position={Position.Left} className="!bg-white !w-2.5 !h-2.5 !border-2 !border-[#111218]" />
      <WhatsAppLogo className="w-10 h-10 text-white" />
      <Handle type="source" position={Position.Right} className="!bg-white !w-2.5 !h-2.5 !border-2 !border-[#111218]" />
    </NodeShell>
  );
}

export const WORKFLOW_NODE_TYPES = {
  "trigger.whatsapp_message": WhatsAppTriggerNode,
  "trigger.webhook": WebhookTriggerNode,
  "action.ai_extract": AiExtractNode,
  "action.webhook": WebhookActionNode,
  "action.send_whatsapp_message": SendWhatsAppMessageNode
};

/** Botón chiquito de copiar-al-portapapeles, usado en los paneles de configuración que muestran una URL. */
export function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="p-1.5 rounded-md text-gray-400 hover:text-white hover:bg-white/[.08] shrink-0"
      title="Copiar"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}
