"use client";

import Link from "next/link";
import Image from "next/image";
import {
  MessageSquare,
  Zap,
  ArrowRight,
  Flame,
  TrendingUp,
  Brain,
  Radio,
  BarChart3,
  FileText,
  ClipboardList,
  Calculator,
  ScanLine,
  PhoneCall,
  Target,
  Bell,
  Link2,
  Users,
  Shield,
  Calendar,
  Mail,
  Search,
  Handshake,
  Inbox,
  Megaphone,
  Building2
} from "lucide-react";
import PricingSection from "@/components/landing/PricingSection";
import LeadCaptureButton from "@/components/landing/LeadCaptureButton";
import { LeadCaptureProvider } from "@/components/landing/LeadCaptureProvider";
import LandingWidgetEmbed from "@/components/landing/LandingWidgetEmbed";

const USE_CASES = [
  {
    icon: MessageSquare,
    title: "Atención al cliente 24/7",
    desc: "Responde dudas, cotizaciones y estado de póliza por WhatsApp o web, a cualquier hora.",
    tag: "WhatsApp · Mi Link"
  },
  {
    icon: Calculator,
    title: "Cotizaciones al instante",
    desc: "Arma propuestas y comparativos por ramo según el perfil del cliente, listos para enviar.",
    tag: "Agente entrenado"
  },
  {
    icon: Target,
    title: "Calificación de leads",
    desc: "Filtra prospectos por ramo, presupuesto e intención antes de pasarlos a un asesor.",
    tag: "Voz · WhatsApp"
  },
  {
    icon: Link2,
    title: "Captación con Mi Link",
    desc: "Micrositio con su marca y chat ia: un link para redes, tarjetas y campañas.",
    tag: "Mi Link"
  },
  {
    icon: PhoneCall,
    title: "Llamadas de renovación",
    desc: "Agente de voz que contacta antes del vencimiento, confirma datos y agenda la renovación.",
    tag: "Voz"
  },
  {
    icon: Bell,
    title: "Alertas de vencimiento",
    desc: "Notifica a clientes y equipo cuando una póliza está por vencer o requiere acción.",
    tag: "WhatsApp · Email"
  },
  {
    icon: Handshake,
    title: "Seguimiento comercial",
    desc: "Recordatorios y mensajes de seguimiento para no perder oportunidades en el embudo.",
    tag: "Voz · WhatsApp"
  },
  {
    icon: ScanLine,
    title: "Lectura de pólizas PDF",
    desc: "Extrae datos de pólizas, certificados, cédulas y anexos en segundos.",
    tag: "Agente entrenado"
  },
  {
    icon: ClipboardList,
    title: "Llenado de formatos",
    desc: "Convierte la información del cliente en formatos operativos listos para radicar.",
    tag: "Agente entrenado"
  },
  {
    icon: Search,
    title: "Consulta de pólizas",
    desc: "El cliente pregunta por su cobertura, vigencia o beneficios y recibe respuesta inmediata.",
    tag: "WhatsApp · Mi Link"
  },
  {
    icon: Users,
    title: "Onboarding de clientes",
    desc: "Guía al asegurado nuevo: documentos, pasos y preguntas frecuentes sin saturar al equipo.",
    tag: "WhatsApp · Mi Link"
  },
  {
    icon: Shield,
    title: "Orientación en siniestros",
    desc: "Primer contacto e instrucciones iniciales cuando el cliente reporta un evento.",
    tag: "WhatsApp · Voz"
  },
  {
    icon: Calendar,
    title: "Agendar citas",
    desc: "Coordina reuniones con asesores humanos según disponibilidad y tipo de negocio.",
    tag: "Voz · WhatsApp"
  },
  {
    icon: Mail,
    title: "Emails de seguimiento",
    desc: "Redacta y envía comunicaciones post-cotización, post-venta o de recordatorio.",
    tag: "Agente entrenado"
  },
  {
    icon: Inbox,
    title: "Inbox omnicanal",
    desc: "WhatsApp, web y otros canales en una sola bandeja con ia o handoff a humano.",
    tag: "Inbox"
  },
  {
    icon: Megaphone,
    title: "Campañas por WhatsApp",
    desc: "Comunicaciones masivas o segmentadas: renovaciones, promociones y avisos operativos.",
    tag: "WhatsApp"
  },
  {
    icon: Building2,
    title: "Seguros empresariales",
    desc: "Atiende consultas de pymes y corporativos con contexto de ramos empresariales.",
    tag: "Agente entrenado"
  },
  {
    icon: FileText,
    title: "Documentación operativa",
    desc: "Resúmenes, minutas y guiones listos para el equipo comercial y de servicio.",
    tag: "Agente entrenado"
  }
] as const;

function LandingPageContent() {
  return (
    <div className="min-h-screen bg-[#06070d] text-white">
      <header className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between h-14 px-6 bg-[#06070d]/80 backdrop-blur-xl border-b border-white/[.06]">
        <div className="flex items-center gap-3">
          <Link href="/" className="relative h-8 w-28 sm:w-32 flex-shrink-0">
            <Image
              src="/logo-noova.png"
              alt="Noova 360"
              fill
              className="object-contain object-left"
              priority
            />
          </Link>
          <span className="hidden sm:inline text-xs px-2.5 py-1 rounded-full bg-[#5b5bf6]/20 text-[#c4c4ff] border border-[#5b5bf6]/30 font-medium">
            ia operativa
          </span>
        </div>
        <div className="flex items-center gap-4 sm:gap-6">
          <nav className="hidden sm:flex items-center gap-6 text-sm text-gray-400">
            <a href="#casos" className="hover:text-white transition-colors">
              Casos de uso
            </a>
            <a href="#features" className="hover:text-white transition-colors">
              Canales
            </a>
            <a href="#precios" className="hover:text-white transition-colors">
              Precios
            </a>
          </nav>
          <Link
            href="/login"
            className="inline-flex items-center justify-center h-9 px-4 rounded-lg border border-white/[.1] text-sm font-medium text-white hover:bg-white/[.05] transition-all"
          >
            Ingresar
          </Link>
        </div>
      </header>

      <main className="relative z-10" style={{ paddingTop: "5.5rem" }}>
        {/* Hero */}
        <section className="relative mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-16 sm:py-24 lg:py-28">
          <div className="absolute inset-0 -z-10 overflow-hidden">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-96 bg-[#5b5bf6]/15 rounded-full blur-3xl" />
            <div className="absolute bottom-20 right-1/4 w-64 h-64 bg-blue-600/10 rounded-full blur-3xl" />
          </div>

          <div className="text-center max-w-3xl mx-auto">
            <div className="inline-flex items-center gap-2 mb-6 px-4 py-2 rounded-full border border-[#5b5bf6]/30 bg-[#5b5bf6]/10">
              <Flame className="w-4 h-4 text-[#5b5bf6]" />
              <span className="text-sm font-semibold text-[#c4c4ff]">
                Corredores · Aseguradoras · Sector asegurador
              </span>
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold leading-tight mb-5 text-white tracking-tight">
              La ia que{" "}
              <span className="text-[#a5a5ff]">atiende y opera</span>{" "}
              su operación de seguros
            </h1>

            <p className="text-lg sm:text-xl text-gray-300 mb-8 leading-relaxed max-w-2xl mx-auto font-medium">
              Agentes de voz y WhatsApp que cotizan, renuevan y resuelven — más ia que
              lee pólizas, llena formatos y ejecuta su operación documental.{" "}
              <span className="text-white">Aumente productividad a escala.</span>
            </p>

            <div className="flex flex-wrap gap-2 justify-center mb-8">
              {[
                "Cotizaciones con ia",
                "Atención 24/7",
                "Captación de leads",
                "Voz y WhatsApp",
                "Documentos y formatos"
              ].map(label => (
                <span
                  key={label}
                  className="px-3 py-1.5 rounded-full text-xs font-medium border border-white/[.08] bg-white/[.03] text-gray-300"
                >
                  {label}
                </span>
              ))}
            </div>

            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-10">
              <LeadCaptureButton
                intent={{ source: "hero_demo", planInterest: "explorador" }}
                className="inline-flex items-center justify-center gap-2 px-8 py-3.5 text-sm font-semibold text-white rounded-lg bg-[#5b5bf6] hover:bg-[#7070f8] transition-all shadow-lg shadow-[#5b5bf6]/25"
              >
                Probar gratis
                <ArrowRight className="w-4 h-4" />
              </LeadCaptureButton>
              <LeadCaptureButton
                intent={{ source: "hero_demo", planInterest: "demo", title: "Agendar demo gratuita" }}
                className="inline-flex items-center justify-center gap-2 px-8 py-3.5 text-sm font-semibold text-white rounded-lg border border-white/[.15] hover:bg-white/[.05] transition-all"
              >
                Agendar demo
              </LeadCaptureButton>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6 text-sm text-gray-500">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-[#5b5bf6]" />
                <span>+30% productividad operativa</span>
              </div>
              <div className="flex items-center gap-2">
                <Brain className="w-4 h-4 text-blue-400" />
                <span>Especializada en seguros</span>
              </div>
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-cyan-400" />
                <span>Operativa 24/7</span>
              </div>
            </div>
          </div>
        </section>

        {/* Casos de uso */}
        <section id="casos" className="relative mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-16 sm:py-20 scroll-mt-20">
          <div className="text-center mb-12">
            <p className="text-xs font-semibold uppercase tracking-widest text-[#5b5bf6] mb-3">
              Casos de uso
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold leading-tight mb-3">
              Lo que puede automatizar hoy
            </h2>
            <p className="text-gray-400 max-w-xl mx-auto text-sm sm:text-base">
              Servicio al cliente, operación documental y seguimiento comercial —
              en voz, WhatsApp, web e inbox, desde un solo lugar.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {USE_CASES.map((item, i) => {
              const Icon = item.icon;
              return (
                <div
                  key={i}
                  className="rounded-2xl border border-white/[.08] bg-white/[.02] p-6 hover:border-[#5b5bf6]/25 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div className="w-10 h-10 rounded-lg bg-[#5b5bf6]/15 flex items-center justify-center flex-shrink-0">
                      <Icon className="w-5 h-5 text-[#a5a5ff]" />
                    </div>
                    <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-1 rounded-md bg-white/[.05] text-gray-400 border border-white/[.06]">
                      {item.tag}
                    </span>
                  </div>
                  <h3 className="font-semibold mb-2">{item.title}</h3>
                  <p className="text-sm text-gray-400 leading-relaxed">{item.desc}</p>
                </div>
              );
            })}
          </div>
        </section>

        {/* Canales */}
        <section id="features" className="relative mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-16 sm:py-20 scroll-mt-20">
          <div className="text-center mb-12">
            <p className="text-xs font-semibold uppercase tracking-widest text-[#5b5bf6] mb-3">
              Canales
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold leading-tight">
              Un agente, todos sus canales
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                icon: Radio,
                title: "Agentes de Voz",
                desc: "Llama, califica leads, hace seguimiento comercial y coordina citas con asesores.",
                color: "primary"
              },
              {
                icon: MessageSquare,
                title: "WhatsApp e Inbox",
                desc: "Atiende clientes, envía alertas y responde cotizaciones con ia o traspaso a humano.",
                color: "blue"
              },
              {
                icon: BarChart3,
                title: "Mi Link",
                desc: "Su micrositio con chat ia: un link para redes, tarjetas y campañas que captura leads calificados.",
                color: "cyan"
              }
            ].map((agent, i) => {
              const Icon = agent.icon;
              const bgGradient =
                agent.color === "primary"
                  ? "from-[#5b5bf6]/10 to-[#7070f8]/10 border-[#5b5bf6]/20"
                  : agent.color === "blue"
                    ? "from-blue-600/10 to-cyan-600/10 border-blue-500/20"
                    : "from-cyan-600/10 to-[#7070f8]/10 border-cyan-500/20";
              const iconColor =
                agent.color === "primary"
                  ? "text-[#5b5bf6]"
                  : agent.color === "blue"
                    ? "text-blue-400"
                    : "text-cyan-400";

              return (
                <div
                  key={i}
                  className={`bg-gradient-to-br ${bgGradient} p-7 rounded-2xl border`}
                >
                  <div className="w-11 h-11 rounded-lg bg-white/[.06] flex items-center justify-center mb-4">
                    <Icon className={`w-5 h-5 ${iconColor}`} />
                  </div>
                  <h3 className="text-lg font-bold mb-2">{agent.title}</h3>
                  <p className="text-gray-400 text-sm leading-relaxed">{agent.desc}</p>
                </div>
              );
            })}
          </div>

          <div className="mt-8 text-center">
            <LeadCaptureButton
              intent={{ source: "features_explore", planInterest: "demo" }}
              className="inline-flex items-center gap-2 px-6 py-3 text-sm font-medium text-white rounded-lg border border-white/[.1] hover:bg-white/[.05] transition-all"
            >
              Ver demo en vivo
              <ArrowRight className="w-4 h-4" />
            </LeadCaptureButton>
          </div>
        </section>

        <PricingSection />

        {/* CTA */}
        <section className="relative mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-16 sm:py-20">
          <div className="relative rounded-3xl border border-[#5b5bf6]/20 bg-gradient-to-br from-[#5b5bf6]/10 via-slate-900/50 to-[#7070f8]/10 p-10 sm:p-12 text-center">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              Comience con 14 días gratis
            </h2>
            <p className="text-gray-400 mb-8 max-w-xl mx-auto">
              Pruebe agentes de voz, WhatsApp con ia y documentos automatizados — 14 días
              sin tarjeta de crédito.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <LeadCaptureButton
                intent={{ source: "footer_cta", planInterest: "explorador" }}
                className="inline-flex items-center justify-center gap-2 px-8 py-3.5 text-sm font-semibold text-white rounded-lg bg-[#5b5bf6] hover:bg-[#7070f8] transition-all"
              >
                Probar gratis
                <ArrowRight className="w-4 h-4" />
              </LeadCaptureButton>
              <LeadCaptureButton
                intent={{ source: "footer_sales", planInterest: "corporativo" }}
                className="inline-flex items-center justify-center gap-2 px-8 py-3.5 text-sm font-semibold text-white rounded-lg border border-white/[.15] hover:bg-white/[.05] transition-all"
              >
                Contactar ventas
                <ArrowRight className="w-4 h-4" />
              </LeadCaptureButton>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/[.06] py-12 px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-8">
            <div>
              <Link href="/" className="relative block h-8 w-28 mb-4">
                <Image
                  src="/logo-noova.png"
                  alt="Noova 360"
                  fill
                  className="object-contain object-left"
                />
              </Link>
              <p className="text-xs text-gray-500 leading-relaxed">
                ia operativa para corredores, aseguradoras y equipos de seguros.
              </p>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-400 mb-4">Producto</p>
              <ul className="space-y-2 text-sm text-gray-500">
                <li>
                  <a href="#casos" className="hover:text-white transition-colors">
                    Casos de uso
                  </a>
                </li>
                <li>
                  <a href="#features" className="hover:text-white transition-colors">
                    Canales
                  </a>
                </li>
                <li>
                  <a href="#precios" className="hover:text-white transition-colors">
                    Precios
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-400 mb-4">Empresa</p>
              <ul className="space-y-2 text-sm text-gray-500">
                <li>
                  <LeadCaptureButton
                    intent={{ source: "footer_contact", planInterest: "demo" }}
                    className="hover:text-white transition-colors text-left"
                  >
                    Contacto
                  </LeadCaptureButton>
                </li>
              </ul>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-400 mb-4">Acceso</p>
              <ul className="space-y-2 text-sm text-gray-500">
                <li>
                  <Link href="/login" className="hover:text-white transition-colors">
                    Ingresar
                  </Link>
                </li>
              </ul>
            </div>
          </div>
          <div className="border-t border-white/[.06] pt-8">
            <p className="text-sm text-gray-500 text-center">
              © 2026 Noova 360. Todos los derechos reservados.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default function LandingPage() {
  return (
    <LeadCaptureProvider>
      <LandingPageContent />
      <LandingWidgetEmbed />
    </LeadCaptureProvider>
  );
}
