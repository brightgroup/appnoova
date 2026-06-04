"use client";

import { useState } from "react";
import { Search, Plus, Folder, MoreVertical, ChevronLeft, Mic, MicOff, PhoneCall, ShieldCheck, TrendingUp, ArrowRight, Sparkles } from "lucide-react";
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
    tag: "Inbound",
    icon: PhoneCall,
    iconBg: "from-violet-500 to-purple-600",
    ringColor: "hover:ring-violet-500/40",
    stat: "+40% conversión",
    statColor: "text-violet-400",
    desc: "Llama a prospectos, califica su intención de compra y obtén información clave automáticamente."
  },
  {
    id: "policy-reminder",
    name: "Recordatorio de Póliza",
    tag: "Outbound",
    icon: ShieldCheck,
    iconBg: "from-cyan-500 to-blue-600",
    ringColor: "hover:ring-cyan-500/40",
    stat: "+65% renovaciones",
    statColor: "text-cyan-400",
    desc: "Contacta clientes antes del vencimiento y agenda renovaciones de pólizas sin esfuerzo."
  },
  {
    id: "follow-up",
    name: "Follow-up Inteligente",
    tag: "Outbound",
    icon: TrendingUp,
    iconBg: "from-blue-500 to-indigo-600",
    ringColor: "hover:ring-blue-500/40",
    stat: "+30% cierre",
    statColor: "text-blue-400",
    desc: "Da seguimiento automático a oportunidades abiertas y reactiva leads sin respuesta."
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xl">
          <div className="relative bg-[#0b0c14] border border-white/[.10] rounded-3xl p-8 max-w-2xl w-full mx-4 shadow-2xl overflow-hidden">

            {/* Ambient glow */}
            <div className="absolute -top-20 -right-20 w-64 h-64 bg-violet-600/10 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-20 -left-20 w-64 h-64 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />

            {/* Header */}
            <div className="relative mb-8">
              <div className="flex items-center gap-2 mb-3">
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-violet-500/10 border border-violet-500/20">
                  <Sparkles className="w-3 h-3 text-violet-400" />
                  <span className="text-xs font-medium text-violet-400">IA de Voz</span>
                </div>
              </div>
              <h2 className="text-2xl font-bold text-white tracking-tight">Elige tu plantilla</h2>
              <p className="text-sm text-gray-500 mt-1">Selecciona el tipo de agente que necesitas</p>
            </div>

            {/* Templates Grid */}
            <div className="relative grid grid-cols-3 gap-4 mb-8">
              {AGENT_TEMPLATES.map((template) => {
                const Icon = template.icon;
                return (
                  <button
                    key={template.id}
                    onClick={() => handleSelectTemplate(template.id)}
                    className={`group relative flex flex-col p-5 rounded-2xl bg-white/[.03] border border-white/[.08] hover:border-white/[.16] hover:bg-white/[.05] hover:ring-2 ${template.ringColor} hover:ring-offset-0 transition-all duration-200 cursor-pointer text-left`}
                  >
                    {/* Tag */}
                    <span className="text-[10px] font-semibold tracking-widest uppercase text-gray-500 mb-4">{template.tag}</span>

                    {/* Icon */}
                    <div className={`mb-4 w-11 h-11 rounded-xl bg-gradient-to-br ${template.iconBg} flex items-center justify-center shadow-lg`}>
                      <Icon className="w-5 h-5 text-white" strokeWidth={1.8} />
                    </div>

                    {/* Title */}
                    <h3 className="font-semibold text-white text-sm leading-snug mb-2">{template.name}</h3>

                    {/* Description */}
                    <p className="text-xs text-gray-500 leading-relaxed flex-1">{template.desc}</p>

                    {/* Stat */}
                    <div className={`mt-4 text-xs font-semibold ${template.statColor}`}>
                      {template.stat}
                    </div>

                    {/* Arrow on hover */}
                    <ArrowRight className="absolute bottom-5 right-5 w-4 h-4 text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                );
              })}
            </div>

            {/* Footer */}
            <div className="relative flex items-center justify-between">
              <p className="text-xs text-gray-600">Podrás personalizar el agente después</p>
              <button
                onClick={() => setShowTemplateModal(false)}
                className="px-5 py-2 rounded-xl text-sm text-gray-400 hover:text-white hover:bg-white/[.05] transition-colors font-medium"
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
