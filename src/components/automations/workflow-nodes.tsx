"use client";

import { createContext, useContext } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Zap, Reply } from "lucide-react";
import { N8nLogo } from "@/components/icons/brands/N8nLogo";
import { WhatsAppLogo } from "@/components/icons/brands/WhatsAppLogo";
import type { AutomationConnectionRecord } from "@/lib/automations/connections-db";
import type { WorkflowNodeData } from "@/lib/automations/node-types";

/** Lista de conexiones disponibles, para que el nodo de acción resuelva el nombre del conector elegido. */
export const ConnectionsContext = createContext<AutomationConnectionRecord[]>([]);

/** Color corporativo sólido de cada nodo — reutilizado por el nodo en canvas y por la paleta. */
export const NODE_BRAND_COLOR: Record<string, string> = {
  "trigger.whatsapp_image": "#25D366",
  "action.webhook": "#EA4B71",
  "result.whatsapp_reply": "#5b5bf6"
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
    <div className="flex flex-col items-center gap-1.5 w-[92px]">
      <div
        className={`relative w-[92px] h-[76px] rounded-2xl flex items-center justify-center transition-shadow ${
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

export function TriggerNode({ selected }: NodeProps) {
  return (
    <NodeShell selected={selected} label="Imagen recibida" isTrigger color={NODE_BRAND_COLOR["trigger.whatsapp_image"]}>
      <WhatsAppLogo className="w-11 h-11 text-white" />
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
      label={connection ? connection.name : "Sin configurar"}
      color={NODE_BRAND_COLOR["action.webhook"]}
    >
      <Handle type="target" position={Position.Left} className="!bg-white !w-2.5 !h-2.5 !border-2 !border-[#111218]" />
      <N8nLogo className="w-11 h-11 text-white" />
      <Handle type="source" position={Position.Right} className="!bg-white !w-2.5 !h-2.5 !border-2 !border-[#111218]" />
    </NodeShell>
  );
}

export function ResultNode({ selected }: NodeProps) {
  return (
    <NodeShell selected={selected} label="Responder al cliente" color={NODE_BRAND_COLOR["result.whatsapp_reply"]}>
      <Handle type="target" position={Position.Left} className="!bg-white !w-2.5 !h-2.5 !border-2 !border-[#111218]" />
      <Reply className="w-11 h-11 text-white" strokeWidth={1.8} />
    </NodeShell>
  );
}

export const WORKFLOW_NODE_TYPES = {
  "trigger.whatsapp_image": TriggerNode,
  "action.webhook": WebhookActionNode,
  "result.whatsapp_reply": ResultNode
};
