"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Search, Plus, Folder, MoreVertical, ChevronLeft, Mic, MicOff, PhoneCall, ShieldCheck, TrendingUp, ArrowRight, Sparkles, AlertTriangle, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

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

type MicState = "idle" | "requesting" | "active" | "denied" | "error";

export default function AgentesVozPage() {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState("");
  const [agents] = useState(agentesData);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [showMicrophoneModal, setShowMicrophoneModal] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);

  // Mic state
  const [micState, setMicState] = useState<MicState>("idle");
  const [audioLevel, setAudioLevel] = useState(0);
  const streamRef    = useRef<MediaStream | null>(null);
  const analyserRef  = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number>(0);

  const filteredAgents = agents.filter(a =>
    a.nombre.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Limpia el stream y la animación al cerrar el modal
  const stopMic = useCallback(() => {
    cancelAnimationFrame(animFrameRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    analyserRef.current = null;
    setAudioLevel(0);
    setMicState("idle");
  }, []);

  // Visualización de nivel de audio
  const startLevelMonitor = (stream: MediaStream) => {
    const ctx      = new AudioContext();
    const source   = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    analyserRef.current = analyser;

    const data = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      analyser.getByteFrequencyData(data);
      const avg = data.reduce((a, b) => a + b, 0) / data.length;
      setAudioLevel(Math.min(avg / 80, 1)); // normaliza 0-1
      animFrameRef.current = requestAnimationFrame(tick);
    };
    tick();
  };

  const handleActivateMicrophone = async () => {
    setMicState("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      streamRef.current = stream;
      startLevelMonitor(stream);
      setMicState("active");
    } catch (err: any) {
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        setMicState("denied");
      } else {
        setMicState("error");
      }
    }
  };

  const handleSelectTemplate = (templateId: string) => {
    setSelectedTemplate(templateId);
    setShowTemplateModal(false);
    setShowMicrophoneModal(true);
    setMicState("idle");
  };

  const handleCloseMicModal = () => {
    stopMic();
    setShowMicrophoneModal(false);
    setSelectedTemplate(null);
  };

  const handleContinue = () => {
    stopMic();
    setShowMicrophoneModal(false);
    router.push(`/dashboard/agentes-voz/sesion?template=${selectedTemplate ?? "lead-qualification"}`);
    setSelectedTemplate(null);
  };

  // Limpieza al desmontar
  useEffect(() => () => stopMic(), [stopMic]);

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
      {showMicrophoneModal && selectedTemplate && (() => {
        const tpl = AGENT_TEMPLATES.find(t => t.id === selectedTemplate)!;
        const TplIcon = tpl.icon;
        const pulse = 1 + audioLevel * 0.5; // escala el ring según el nivel de audio

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xl">
            <div className="relative bg-[#0b0c14] border border-white/[.10] rounded-3xl p-8 max-w-md w-full mx-4 shadow-2xl overflow-hidden">

              {/* Ambient glow que pulsa con el audio */}
              <div
                className="absolute inset-0 pointer-events-none transition-all duration-75"
                style={{
                  background: micState === "active"
                    ? `radial-gradient(ellipse 60% 40% at 50% 50%, rgba(99,102,241,${0.06 + audioLevel * 0.12}) 0%, transparent 70%)`
                    : "none"
                }}
              />

              {/* Header */}
              <div className="relative mb-6 text-center">
                <div className="flex items-center justify-center gap-2 mb-3">
                  <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${tpl.iconBg} flex items-center justify-center`}>
                    <TplIcon className="w-4 h-4 text-white" strokeWidth={1.8} />
                  </div>
                  <span className="text-sm font-semibold text-white">{tpl.name}</span>
                </div>
                <h2 className="text-xl font-bold text-white tracking-tight">
                  {micState === "active" ? "Micrófono activo" : "Activa tu micrófono"}
                </h2>
                <p className="text-xs text-gray-500 mt-1">
                  {micState === "idle"       && "El agente necesita escucharte para conversar"}
                  {micState === "requesting" && "Esperando permiso del navegador..."}
                  {micState === "active"     && "Te estamos escuchando — habla con tu agente"}
                  {micState === "denied"     && "Permiso denegado — revisa la configuración del navegador"}
                  {micState === "error"      && "No se pudo acceder al micrófono"}
                </p>
              </div>

              {/* Mic visualizer */}
              <div className="relative flex justify-center items-center mb-8" style={{ height: 160 }}>

                {/* Rings de audio — solo visibles cuando está activo */}
                {micState === "active" && (
                  <>
                    <div
                      className="absolute rounded-full border border-violet-500/20 transition-all duration-75"
                      style={{
                        width:  `${120 + audioLevel * 60}px`,
                        height: `${120 + audioLevel * 60}px`,
                        opacity: 0.4 + audioLevel * 0.4
                      }}
                    />
                    <div
                      className="absolute rounded-full border border-violet-500/10 transition-all duration-100"
                      style={{
                        width:  `${140 + audioLevel * 80}px`,
                        height: `${140 + audioLevel * 80}px`,
                        opacity: 0.2 + audioLevel * 0.3
                      }}
                    />
                  </>
                )}

                {/* Círculo principal */}
                <div
                  className={`relative w-24 h-24 rounded-full flex items-center justify-center transition-all duration-150 ${
                    micState === "active"
                      ? "bg-gradient-to-br from-violet-600 to-blue-600 shadow-lg shadow-violet-600/40"
                      : micState === "denied" || micState === "error"
                      ? "bg-red-500/10 border-2 border-red-500/30"
                      : "bg-white/[.04] border-2 border-white/[.10]"
                  }`}
                  style={micState === "active" ? { transform: `scale(${pulse})` } : {}}
                >
                  {micState === "idle"       && <MicOff  className="w-10 h-10 text-gray-500" />}
                  {micState === "requesting" && <Mic     className="w-10 h-10 text-violet-400 animate-pulse" />}
                  {micState === "active"     && <Mic     className="w-10 h-10 text-white" />}
                  {micState === "denied"     && <AlertTriangle className="w-10 h-10 text-red-400" />}
                  {micState === "error"      && <AlertTriangle className="w-10 h-10 text-red-400" />}
                </div>
              </div>

              {/* Barra de nivel de audio */}
              {micState === "active" && (
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-gray-500">Nivel de audio</span>
                    <div className="flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-green-400" />
                      <span className="text-xs text-green-400 font-medium">En vivo</span>
                    </div>
                  </div>
                  <div className="h-1.5 bg-white/[.06] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-violet-500 to-blue-500 rounded-full transition-all duration-75"
                      style={{ width: `${Math.max(audioLevel * 100, 2)}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Error / denied instructions */}
              {(micState === "denied" || micState === "error") && (
                <div className="mb-6 p-4 rounded-xl bg-red-500/[.07] border border-red-500/20 text-sm text-red-400">
                  {micState === "denied"
                    ? "Haz clic en el ícono 🔒 en la barra del navegador y permite el acceso al micrófono. Luego recarga la página."
                    : "No se detectó ningún micrófono. Verifica que esté conectado y vuelve a intentarlo."}
                </div>
              )}

              {/* Botones */}
              <div className="flex gap-3">
                <button
                  onClick={handleCloseMicModal}
                  className="flex-1 py-2.5 rounded-xl border border-white/[.08] text-sm text-gray-400 hover:text-white hover:bg-white/[.05] transition-colors font-medium"
                >
                  Cancelar
                </button>

                {micState === "active" ? (
                  <button
                    onClick={handleContinue}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 text-white text-sm font-semibold hover:from-violet-700 hover:to-blue-700 transition-all shadow-lg shadow-violet-600/25"
                  >
                    <ArrowRight className="w-4 h-4" />
                    Continuar
                  </button>
                ) : (
                  <button
                    onClick={handleActivateMicrophone}
                    disabled={micState === "requesting"}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 text-white text-sm font-semibold hover:from-violet-700 hover:to-blue-700 transition-all disabled:opacity-60 disabled:cursor-not-allowed shadow-lg shadow-violet-600/25"
                  >
                    <Mic className="w-4 h-4" />
                    {micState === "requesting" ? "Esperando..." : micState === "denied" || micState === "error" ? "Reintentar" : "Activar micrófono"}
                  </button>
                )}
              </div>

            </div>
          </div>
        );
      })()}
    </div>
  );
}
