"use client";

import { createContext, useContext, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Zap, Webhook, Globe, MessageSquareText, Copy, Check } from "lucide-react";
import { WhatsAppLogo } from "@/components/icons/brands/WhatsAppLogo";
import type { AutomationConnectionRecord } from "@/lib/automations/connections-db";
import type { WorkflowNodeData } from "@/lib/automations/node-types";
import type { WhatsAppChannelRecord } from "@/types/whatsapp-channel";

/** Lista de conexiones disponibles, para que el nodo de acción resuelva el nombre del conector elegido. */
export const ConnectionsContext = createContext<AutomationConnectionRecord[]>([]);
/** Líneas de WhatsApp disponibles, para que el nodo disparador resuelva el nombre del canal elegido. */
export const ChannelsContext = createContext<WhatsAppChannelRecord[]>([]);

/** Color corporativo sólido de cada nodo — reutilizado por el nodo en canvas y por la paleta. */
export const NODE_BRAND_COLOR: Record<string, string> = {
  "trigger.whatsapp_image": "#25D366",
  "trigger.whatsapp_text": "#25D366",
  "trigger.webhook": "#F5A623",
  "action.webhook": "#0EA5E9",
  "action.send_whatsapp_message": "#25D366"
};

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

const WHATSAPP_TRIGGER_DEFAULT_LABEL: Record<string, string> = {
  "trigger.whatsapp_image": "Imagen de WhatsApp",
  "trigger.whatsapp_text": "Mensaje de WhatsApp"
};

/** Disparador de imagen o de texto de WhatsApp — mismo componente, mismo selector de canal (ver ChannelSelectField). */
export function WhatsAppTriggerNode({ selected, data, type }: NodeProps) {
  const channels = useContext(ChannelsContext);
  const channelId = (data as WorkflowNodeData | undefined)?.channelId;
  const channel = channels.find(c => c.id === channelId);

  return (
    <NodeShell
      selected={selected}
      label={channel ? channel.friendly_name || channel.e164 : WHATSAPP_TRIGGER_DEFAULT_LABEL[type] ?? "WhatsApp"}
      isTrigger
      color={NODE_BRAND_COLOR[type]}
    >
      {type === "trigger.whatsapp_text" ? (
        <MessageSquareText className="w-10 h-10 text-white" strokeWidth={1.8} />
      ) : (
        <WhatsAppLogo className="w-10 h-10 text-white" />
      )}
      <Handle type="source" position={Position.Right} className="!bg-white !w-2.5 !h-2.5 !border-2 !border-[#111218]" />
    </NodeShell>
  );
}

export function WebhookTriggerNode({ selected }: NodeProps) {
  return (
    <NodeShell selected={selected} label="Webhook entrante" isTrigger color={NODE_BRAND_COLOR["trigger.webhook"]}>
      <Webhook className="w-10 h-10 text-white" strokeWidth={1.8} />
      <Handle type="source" position={Position.Right} className="!bg-white !w-2.5 !h-2.5 !border-2 !border-[#111218]" />
    </NodeShell>
  );
}

export function WebhookActionNode({ selected, data }: NodeProps) {
  const connections = useContext(ConnectionsContext);
  const connectionId = (data as WorkflowNodeData | undefined)?.connectionId;
  const connection = connections.find(c => c.id === connectionId);

  return (
    <NodeShell
      selected={selected}
      label={connection ? connection.name : "HTTP Request"}
      color={NODE_BRAND_COLOR["action.webhook"]}
    >
      <Handle type="target" position={Position.Left} className="!bg-white !w-2.5 !h-2.5 !border-2 !border-[#111218]" />
      <Globe className="w-10 h-10 text-white" strokeWidth={1.6} />
      <Handle type="source" position={Position.Right} className="!bg-white !w-2.5 !h-2.5 !border-2 !border-[#111218]" />
    </NodeShell>
  );
}

export function SendWhatsAppMessageNode({ selected }: NodeProps) {
  return (
    <NodeShell selected={selected} label="Enviar mensaje" color={NODE_BRAND_COLOR["action.send_whatsapp_message"]}>
      <Handle type="target" position={Position.Left} className="!bg-white !w-2.5 !h-2.5 !border-2 !border-[#111218]" />
      <WhatsAppLogo className="w-10 h-10 text-white" />
      <Handle type="source" position={Position.Right} className="!bg-white !w-2.5 !h-2.5 !border-2 !border-[#111218]" />
    </NodeShell>
  );
}

export const WORKFLOW_NODE_TYPES = {
  "trigger.whatsapp_image": WhatsAppTriggerNode,
  "trigger.whatsapp_text": WhatsAppTriggerNode,
  "trigger.webhook": WebhookTriggerNode,
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
