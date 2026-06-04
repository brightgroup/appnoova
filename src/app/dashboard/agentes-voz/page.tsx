"use client";

import { useState } from "react";
import { Search, Plus, Folder, MoreVertical, ChevronLeft, Mic, MicOff, Zap, Target, Calendar } from "lucide-react";
import Link from "next/link";

interface Agent {
  id: string;
  nombre: string;
  contactos: number;
  contactados: number;
  llamadas: number;
  metasLogradas: number;
  costo: string;
  costoResultado: string;
  calidad: string;
}

const agentesData: Agent[] = [
  {
    id: "1",
    nombre: "Lia - Calificación De Leads",
    contactos: 0,
    contactados: 0,
    llamadas: 1,
    metasLogradas: 0,
    costo: "US$ 0.00",
    costoResultado: "-",
    calidad: "Aprendiendo"
  }
];

const AGENT_TEMPLATES = [
  {
    id: "lead-qualification",
    name: "Calificación de Leads",
    icon: Target,
    color: "violet",
    desc: "Llamadas para calificar prospectos y entender sus necesidades"
  },
  {
    id: "policy-reminder",
    name: "Recordatorio de Póliza",
    icon: Calendar,
    color: "cyan",
    desc: "Llamadas automáticas para recordar renovaciones"
  },
  {
    id: "follow-up",
    name: "Follow-up",
    icon: Zap,
    color: "blue",
    desc: "Seguimiento automatizado de oportunidades abiertas"
  }
];

export default function AgentesVozPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [agents, setAgents] = useState(agentesData);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [showMicrophoneModal, setShowMicrophoneModal] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);

  const filteredAgents = agents.filter(agent =>
    agent.nombre.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSelectTemplate = (templateId: string) => {
    setSelectedTemplate(templateId);
    setShowTemplateModal(false);
    setShowMicrophoneModal(true);
  };

  const handleActivateMicrophone = () => {
    setShowMicrophoneModal(false);
    // Aquí irá la navegación a la página de configuración
    console.log("Micrófono activado, ir a configuración");
  };

  return (
    <div className="flex-1 flex flex-col bg-[#0d0e14] text-white overflow-hidden">
      <div className="border-b border-white/[.06] bg-[#0d0e14]/50 backdrop-blur px-6 py-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Link
              href="/dashboard"
              className="p-1 hover:bg-white/[.08] rounded-lg transition-colors text-gray-400 hover:text-white"
              title="Volver"
            >
              <ChevronLeft className="w-5 h-5" />
            </Link>
            <h1 className="text-2xl font-bold">Agentes de Voz</h1>
          </div>
          <p className="text-sm text-gray-400">
            Mejora la interacción con tus usuarios capacitando a agentes de voz con tecnología de inteligencia artificial que puedan realizar llamadas de cobro, confirmar reuniones o calificar clientes potenciales.
          </p>
        </div>

        {/* Search and Buttons */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="text"
              placeholder="Búsqueda de agentes"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-white/[.05] border border-white/[.08] rounded-lg pl-10 pr-4 py-2 text-sm placeholder-gray-500 focus:outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/20"
            />
          </div>
          <button className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/[.05] border border-white/[.08] text-white hover:bg-white/[.08] transition-colors text-sm font-medium">
            <Folder className="w-4 h-4" />
            Nueva carpeta
          </button>
          <button 
            onClick={() => setShowTemplateModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-violet-600 to-blue-600 text-white hover:from-violet-700 hover:to-blue-700 transition-all text-sm font-medium shadow-lg shadow-violet-600/25"
          >
            <Plus className="w-4 h-4" />
            Nuevo agente
          </button>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-7xl">
          {/* Table */}
          <div className="bg-white/[.02] border border-white/[.08] rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/[.08] bg-white/[.02]">
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">Nombre</th>
                    <th className="px-6 py-4 text-right text-xs font-semibold text-gray-400 uppercase tracking-wide">Contactos</th>
                    <th className="px-6 py-4 text-right text-xs font-semibold text-gray-400 uppercase tracking-wide">Contactados</th>
                    <th className="px-6 py-4 text-right text-xs font-semibold text-gray-400 uppercase tracking-wide">Llamadas</th>
                    <th className="px-6 py-4 text-right text-xs font-semibold text-gray-400 uppercase tracking-wide">Metas Logradas</th>
                    <th className="px-6 py-4 text-right text-xs font-semibold text-gray-400 uppercase tracking-wide">Costo</th>
                    <th className="px-6 py-4 text-right text-xs font-semibold text-gray-400 uppercase tracking-wide">Costo /Resultado</th>
                    <th className="px-6 py-4 text-right text-xs font-semibold text-gray-400 uppercase tracking-wide">Calidad</th>
                    <th className="px-6 py-4 text-center text-xs font-semibold text-gray-400 uppercase tracking-wide">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAgents.length > 0 ? (
                    filteredAgents.map((agent, idx) => (
                      <tr key={agent.id} className={`border-b border-white/[.08] hover:bg-white/[.02] transition-colors ${idx % 2 === 0 ? "bg-white/[.01]" : ""}`}>
                        <td className="px-6 py-4 text-sm font-medium text-white cursor-pointer hover:text-violet-400">
                          <div className="flex items-center gap-2">
                            <span>📞</span>
                            {agent.nombre}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-400 text-right">{agent.contactos}</td>
                        <td className="px-6 py-4 text-sm text-gray-400 text-right">{agent.contactados} ({((agent.contactados / Math.max(agent.contactos, 1)) * 100).toFixed(1)}%)</td>
                        <td className="px-6 py-4 text-sm text-gray-400 text-right">{agent.llamadas}</td>
                        <td className="px-6 py-4 text-sm text-gray-400 text-right">{agent.metasLogradas}</td>
                        <td className="px-6 py-4 text-sm text-gray-400 text-right">{agent.costo}</td>
                        <td className="px-6 py-4 text-sm text-gray-400 text-right">{agent.costoResultado}</td>
                        <td className="px-6 py-4 text-sm text-right">
                          <span className="px-3 py-1 rounded-full bg-amber-500/20 text-amber-400 text-xs font-medium">
                            {agent.calidad}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <button className="p-1 hover:bg-white/[.08] rounded transition-colors text-gray-400 hover:text-white">
                            <MoreVertical className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={9} className="px-6 py-12 text-center text-gray-500">
                        No se encontraron agentes
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          <div className="mt-4 flex items-center justify-between">
            <p className="text-sm text-gray-400">
              Mostrando <span className="font-medium text-white">{filteredAgents.length}</span> de <span className="font-medium text-white">{agents.length}</span> agentes
            </p>
            <div className="flex items-center gap-1">
              <button className="px-2 py-1 rounded border border-white/[.08] text-sm text-gray-400 hover:text-white hover:border-white/[.12] transition-colors">
                ←
              </button>
              <button className="px-3 py-1 rounded bg-violet-600/20 border border-violet-500/30 text-sm text-violet-400">
                1
              </button>
              <button className="px-2 py-1 rounded border border-white/[.08] text-sm text-gray-400 hover:text-white hover:border-white/[.12] transition-colors">
                →
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Template Selection Modal */}
      {showTemplateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md">
          <div className="bg-[#09090f] border border-white/[.15] rounded-3xl p-10 max-w-3xl w-full mx-4 shadow-2xl">
            {/* Header */}
            <div className="mb-10">
              <h2 className="text-3xl font-bold text-white mb-3">Crea tu agente de voz</h2>
              <p className="text-base text-gray-400">Elige una plantilla especializada para comenzar</p>
            </div>

            {/* Templates Grid */}
            <div className="grid grid-cols-3 gap-6 mb-10">
              {AGENT_TEMPLATES.map((template) => {
                const Icon = template.icon;
                const colorMap = {
                  violet: "from-violet-600/30 to-blue-600/30 border-violet-500/20 hover:border-violet-500/40",
                  cyan: "from-cyan-600/30 to-blue-600/30 border-cyan-500/20 hover:border-cyan-500/40",
                  blue: "from-blue-600/30 to-purple-600/30 border-blue-500/20 hover:border-blue-500/40"
                };
                
                return (
                  <button
                    key={template.id}
                    onClick={() => handleSelectTemplate(template.id)}
                    className={`group p-6 rounded-2xl border bg-gradient-to-br ${colorMap[template.color as keyof typeof colorMap]} hover:bg-white/[.03] transition-all cursor-pointer text-left`}
                  >
                    {/* Icon */}
                    <div className="mb-4 p-3 rounded-xl bg-white/[.05] group-hover:bg-white/[.08] transition-colors w-fit">
                      <Icon className="w-6 h-6 text-white" />
                    </div>
                    
                    {/* Content */}
                    <h3 className="font-semibold text-white text-lg mb-2 group-hover:text-violet-300 transition-colors">{template.name}</h3>
                    <p className="text-sm text-gray-400 leading-relaxed">{template.desc}</p>
                  </button>
                );
              })}
            </div>

            {/* Buttons */}
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowTemplateModal(false)}
                className="px-8 py-3 rounded-xl border border-white/[.1] text-white hover:bg-white/[.05] transition-colors font-medium"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Microphone Activation Modal */}
      {showMicrophoneModal && selectedTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md">
          <div className="bg-[#09090f] border border-white/[.15] rounded-3xl p-10 max-w-xl w-full mx-4 shadow-2xl">
            {/* Header */}
            <h2 className="text-3xl font-bold text-white mb-2 text-center">Activa tu micrófono</h2>
            <p className="text-center text-gray-400 mb-10">Tu agente necesita escucharte. Haz clic en el botón y permite el acceso cuando tu navegador lo solicite.</p>

            {/* Microphone Status */}
            <div className="mb-10 flex justify-center">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-r from-violet-600/20 to-blue-600/20 rounded-full blur-3xl"></div>
                <div className="relative w-32 h-32 rounded-full border-2 border-white/[.1] bg-white/[.02] flex items-center justify-center">
                  <MicOff className="w-12 h-12 text-gray-500" />
                </div>
              </div>
            </div>

            {/* Agent Info */}
            <div className="mb-10 p-6 rounded-xl bg-white/[.02] border border-white/[.08]">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-2">Agente seleccionado</p>
              <p className="text-lg font-semibold text-white">
                {AGENT_TEMPLATES.find(t => t.id === selectedTemplate)?.name}
              </p>
            </div>

            {/* Tip Box */}
            <div className="mb-10 p-4 rounded-xl bg-blue-600/10 border border-blue-500/20">
              <div className="flex gap-3 items-start">
                <span className="text-lg flex-shrink-0">💡</span>
                <p className="text-sm text-gray-300">Asegúrate de estar en un lugar tranquilo. Esto ayudará al agente a entenderte mejor.</p>
              </div>
            </div>

            {/* Buttons */}
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowMicrophoneModal(false);
                  setSelectedTemplate(null);
                }}
                className="px-8 py-3 rounded-xl border border-white/[.1] text-white hover:bg-white/[.05] transition-colors font-medium"
              >
                Cancelar
              </button>
              <button
                onClick={handleActivateMicrophone}
                className="flex items-center gap-2 px-8 py-3 rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 text-white hover:from-violet-700 hover:to-blue-700 transition-all font-medium shadow-lg shadow-violet-600/25"
              >
                <Mic className="w-4 h-4" />
                Activar micrófono
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
