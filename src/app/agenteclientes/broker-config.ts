import type { PublicMicrositeConfig } from "@/types/microsite";
import type { MicrositeQuickAction } from "@/types/microsite";

/** Demo estático — /agenteclientes sin slug */
export const BROKER = {
  name: "Allianz",
  agentName: "Valentina",
  initials: "AZ",
  logoUrl: "/logos/allianz.png",
  faviconUrl: "/logos/allianz-icon.png",
  accent: "#0f7eff"
};

const DEMO_QUICK_ACTIONS: MicrositeQuickAction[] = [
  {
    id: "cotizar",
    label: "Cotizar",
    prompt: "Quiero cotizar un seguro. ¿Qué información necesitas?",
    icon: "Calculator",
    enabled: true
  },
  {
    id: "consultar",
    label: "Consultar",
    prompt: "Tengo una duda sobre mi seguro, ¿me puedes ayudar?",
    icon: "HelpCircle",
    enabled: true
  },
  {
    id: "polizas",
    label: "Mis pólizas",
    prompt: "Quiero consultar el estado de mis pólizas vigentes.",
    icon: "FileCheck",
    enabled: true
  },
  {
    id: "siniestro",
    label: "Siniestro",
    prompt: "Necesito reportar un siniestro. ¿Cuál es el proceso?",
    icon: "AlertTriangle",
    enabled: true
  },
  {
    id: "renovar",
    label: "Renovar",
    prompt: "Mi póliza está por vencer, quiero saber cómo renovarla.",
    icon: "RefreshCw",
    enabled: true
  }
];

export const DEMO_MICROSITE_CONFIG: PublicMicrositeConfig = {
  slug: "default",
  name: BROKER.name,
  agentName: BROKER.agentName,
  initials: BROKER.initials,
  logoUrl: BROKER.logoUrl,
  faviconUrl: BROKER.faviconUrl,
  accent: BROKER.accent,
  buttonColor: BROKER.accent,
  quickActions: DEMO_QUICK_ACTIONS,
  chatEndpoint: "/api/agenteclientes/chat"
};
