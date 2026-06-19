"use client";

import Link from "next/link";
import Image from "next/image";
import {
  MessageSquare,
  Zap,
  ArrowRight,
  Sparkles,
  TrendingUp,
  Brain,
  Radio,
  BarChart3,
  PhoneCall,
  Target,
  Bell,
  Link2,
  Users,
  Calendar,
  Mail,
  Inbox,
  Megaphone,
  ShoppingBag,
  UtensilsCrossed,
  Stethoscope,
  Building2,
  Workflow,
  Plug,
  Layers,
  Clock,
  ChevronDown,
  Bot,
  LineChart
} from "lucide-react";
import PricingSection from "@/components/landing/PricingSection";
import LeadCaptureButton from "@/components/landing/LeadCaptureButton";
import { LeadCaptureProvider, LeadCaptureUrlOpener } from "@/components/landing/LeadCaptureProvider";
import LandingWidgetEmbed from "@/components/landing/LandingWidgetEmbed";

const STATS = [
  { value: "+300K", label: "Conversaciones gestionadas" },
  { value: "−62%", label: "Tareas manuales reducidas" },
  { value: "4.8×", label: "ROI promedio primer año" },
  { value: "24/7", label: "Operación continua" }
] as const;

const PROBLEMS = [
  {
    num: "01",
    title: "Canales desconectados",
    desc: "WhatsApp, web y teléfono viven en silos. El equipo copia datos a mano y pierde contexto en cada conversación."
  },
  {
    num: "02",
    title: "Equipos en trabajo repetitivo",
    desc: "Seguimientos, recordatorios y preguntas frecuentes consumen horas que la IA puede resolver en segundos."
  },
  {
    num: "03",
    title: "IA que no ejecuta",
    desc: "Un chatbot genérico responde, pero no califica leads, no actualiza el CRM ni cierra el ciclo comercial."
  }
] as const;

const SCENARIOS = [
  {
    icon: Plug,
    title: "Conecte lo que ya tiene",
    desc: "Integre agentes de ia con su operación actual: CRM, catálogos y flujos que ya funcionan, sin reemplazar todo.",
    tags: ["CRM", "WhatsApp", "Mi Link"]
  },
  {
    icon: Layers,
    title: "Empiece con lo esencial",
    desc: "CRM, inbox omnicanal y agentes listos en días. Ideal si parte desde cero o quiere modernizar sin proyectos eternos.",
    tags: ["CRM incluido", "Inbox", "Setup ágil"]
  },
  {
    icon: Bot,
    title: "Escale con ia que actúa",
    desc: "Agentes que califican, cotizan, agendan y hacen seguimiento — con traspaso a humano cuando hace falta.",
    tags: ["Voz", "WhatsApp", "Automatización"]
  }
] as const;

const USE_CASES = [
  {
    icon: MessageSquare,
    title: "Atención al cliente 24/7",
    desc: "Responde consultas, horarios, precios y estado de pedidos por WhatsApp o web, a cualquier hora.",
    tag: "WhatsApp · Mi Link"
  },
  {
    icon: Target,
    title: "Calificación de leads",
    desc: "Filtra prospectos por interés, presupuesto y urgencia antes de pasarlos a ventas.",
    tag: "Voz · WhatsApp"
  },
  {
    icon: ShoppingBag,
    title: "Consultas de catálogo",
    desc: "El cliente pregunta por productos, disponibilidad o variantes y recibe respuesta al instante.",
    tag: "Agente entrenado"
  },
  {
    icon: Link2,
    title: "Captación con Mi Link",
    desc: "Micrositio con su marca y chat ia: un link para redes, tarjetas y campañas.",
    tag: "Mi Link"
  },
  {
    icon: PhoneCall,
    title: "Llamadas y seguimiento",
    desc: "Agente de voz que contacta leads, confirma citas y retoma conversaciones pendientes.",
    tag: "Voz"
  },
  {
    icon: Bell,
    title: "Recordatorios automáticos",
    desc: "Notifica a clientes y equipo sobre citas, pagos pendientes o acciones requeridas.",
    tag: "WhatsApp · Email"
  },
  {
    icon: UtensilsCrossed,
    title: "Restaurantes y delivery",
    desc: "Toma pedidos, responde menú y horarios, y escala al equipo en horas pico.",
    tag: "WhatsApp"
  },
  {
    icon: Stethoscope,
    title: "Salud y servicios",
    desc: "Agenda citas, orienta sobre preparación de exámenes y responde preguntas frecuentes.",
    tag: "Voz · WhatsApp"
  },
  {
    icon: Users,
    title: "Onboarding de clientes",
    desc: "Guía al cliente nuevo: documentos, pasos y preguntas frecuentes sin saturar al equipo.",
    tag: "WhatsApp · Mi Link"
  },
  {
    icon: Calendar,
    title: "Agendar citas",
    desc: "Coordina reuniones con su equipo según disponibilidad y tipo de servicio.",
    tag: "Voz · WhatsApp"
  },
  {
    icon: Mail,
    title: "Emails de seguimiento",
    desc: "Redacta y envía comunicaciones post-venta, post-cotización o de recordatorio.",
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
    desc: "Comunicaciones segmentadas: promociones, avisos operativos y reactivación de clientes.",
    tag: "WhatsApp"
  },
  {
    icon: Building2,
    title: "B2B y corporativo",
    desc: "Atiende consultas de empresas con contexto de productos, contratos y contactos clave.",
    tag: "Agente entrenado"
  },
  {
    icon: Workflow,
    title: "Operación documental",
    desc: "Extrae datos de PDFs, llena formatos y prepara cotizaciones listas para enviar.",
    tag: "Agente entrenado"
  },
  {
    icon: LineChart,
    title: "CRM y pipeline",
    desc: "Cada conversación alimenta contactos, leads y seguimiento comercial en un solo lugar.",
    tag: "CRM"
  }
] as const;

const PROCESS = [
  {
    step: "01",
    title: "Diagnóstico operativo",
    desc: "Mapeamos sus canales, procesos y prioridades. Identificamos qué automatizar primero para el mayor impacto.",
    meta: "45 min · Gratuito"
  },
  {
    step: "02",
    title: "Configuración e integración",
    desc: "Entrenamos agentes con el contexto de su negocio, conectamos canales y activamos flujos reales.",
    meta: "Por sprints guiados"
  },
  {
    step: "03",
    title: "Operación y optimización",
    desc: "Sus agentes trabajan 24/7. Usted monitorea, ajusta y escala con datos — nosotros afinamos el rendimiento.",
    meta: "Continuo · 24/7"
  }
] as const;

const FAQ = [
  {
    q: "¿Funciona para mi industria?",
    a: "Sí. Noova 360 es agnóstica de sector: retail, servicios, salud, restaurantes, seguros y más. Entrenamos cada agente con el contexto, catálogo y tono de su empresa."
  },
  {
    q: "¿Cuánto tarda la implementación?",
    a: "Empezamos con un diagnóstico gratuito y avanzamos por ciclos cortos: primero lo crítico, luego ampliamos. Muchas empresas operan en días, no meses."
  },
  {
    q: "¿Cómo funciona el consumo de créditos?",
    a: "Cada acción de ia consume créditos según el canal (texto, WhatsApp, voz). Ve el uso en tiempo real y elige el plan según su volumen mensual estimado."
  },
  {
    q: "¿Los agentes suenan naturales?",
    a: "Sí. Los configuramos con el tono y vocabulario de su marca. Pueden escalar a un humano en cualquier momento, conservando el contexto de la conversación."
  },
  {
    q: "¿Trabaja con WhatsApp Business?",
    a: "Es uno de nuestros canales principales. Atiende conversaciones, responde con ia, registra en CRM y permite traspaso al equipo cuando hace falta."
  },
  {
    q: "¿Hay soporte en español?",
    a: "100%. Somos equipo latinoamericano. Soporte en español, entendemos WhatsApp como canal principal y procesos reales de pymes en la región."
  }
] as const;

const INDUSTRIES = [
  "Retail",
  "Servicios",
  "Salud",
  "Restaurantes",
  "Seguros",
  "Pymes",
  "B2B"
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
            ia empresarial
          </span>
        </div>
        <div className="flex items-center gap-4 sm:gap-6">
          <nav className="hidden md:flex items-center gap-6 text-sm text-gray-400">
            <a href="#plataforma" className="hover:text-white transition-colors">
              Plataforma
            </a>
            <a href="#casos" className="hover:text-white transition-colors">
              Casos de uso
            </a>
            <a href="#precios" className="hover:text-white transition-colors">
              Precios
            </a>
            <a href="#faq" className="hover:text-white transition-colors">
              FAQ
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
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[28rem] h-[28rem] bg-[#5b5bf6]/15 rounded-full blur-3xl" />
            <div className="absolute bottom-20 right-1/4 w-64 h-64 bg-blue-600/10 rounded-full blur-3xl" />
          </div>

          <div className="text-center max-w-4xl mx-auto">
            <div className="inline-flex items-center gap-2 mb-6 px-4 py-2 rounded-full border border-[#5b5bf6]/30 bg-[#5b5bf6]/10">
              <Sparkles className="w-4 h-4 text-[#5b5bf6]" />
              <span className="text-sm font-semibold text-[#c4c4ff]">
                Plataforma todo en uno · IA empresarial
              </span>
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-[3.35rem] font-extrabold leading-[1.1] mb-5 text-white tracking-tight">
              Todo su negocio,{" "}
              <span className="text-[#a5a5ff]">un solo sistema inteligente</span>
            </h1>

            <p className="text-lg sm:text-xl text-gray-300 mb-8 leading-relaxed max-w-2xl mx-auto font-medium">
              Agentes de ia que atienden, venden y ejecutan en voz, WhatsApp y web.
              Para cualquier empresa que quiera operar mejor —{" "}
              <span className="text-white">sin depender de procesos manuales.</span>
            </p>

            <div className="flex flex-wrap gap-2 justify-center mb-8">
              {INDUSTRIES.map(label => (
                <span
                  key={label}
                  className="px-3 py-1.5 rounded-full text-xs font-medium border border-white/[.08] bg-white/[.03] text-gray-300"
                >
                  {label}
                </span>
              ))}
            </div>

            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
              <LeadCaptureButton
                intent={{ source: "hero_demo", planInterest: "demo", title: "Agendar demo gratuita" }}
                className="inline-flex items-center justify-center gap-2 px-8 py-3.5 text-sm font-semibold text-white rounded-lg bg-[#5b5bf6] hover:bg-[#7070f8] transition-all shadow-lg shadow-[#5b5bf6]/25"
              >
                Agendar demo gratuita
                <ArrowRight className="w-4 h-4" />
              </LeadCaptureButton>
              <LeadCaptureButton
                intent={{ source: "hero_trial", planInterest: "explorador" }}
                className="inline-flex items-center justify-center gap-2 px-8 py-3.5 text-sm font-semibold text-white rounded-lg border border-white/[.15] hover:bg-white/[.05] transition-all"
              >
                Probar 14 días gratis
              </LeadCaptureButton>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 max-w-3xl mx-auto">
              {STATS.map(stat => (
                <div
                  key={stat.label}
                  className="rounded-xl border border-white/[.08] bg-white/[.02] px-4 py-3"
                >
                  <p className="text-xl sm:text-2xl font-bold text-white">{stat.value}</p>
                  <p className="text-xs text-gray-500 mt-1 leading-snug">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Problema */}
        <section className="relative mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-16 sm:py-20 border-t border-white/[.06]">
          <div className="text-center mb-12 max-w-2xl mx-auto">
            <p className="text-xs font-semibold uppercase tracking-widest text-[#5b5bf6] mb-3">
              El problema
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold leading-tight mb-4">
              ¿Por qué sus procesos no escalan solos?
            </h2>
            <p className="text-gray-400 text-sm sm:text-base leading-relaxed">
              Ya tiene herramientas. El cuello de botella es que no se hablan entre sí — y su
              equipo termina siendo el pegamento manual de toda la operación.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-5">
            {PROBLEMS.map(item => (
              <div
                key={item.num}
                className="rounded-2xl border border-white/[.08] bg-white/[.02] p-6 sm:p-7"
              >
                <span className="text-xs font-bold text-[#5b5bf6] tracking-widest">{item.num}</span>
                <h3 className="text-lg font-semibold mt-3 mb-2">{item.title}</h3>
                <p className="text-sm text-gray-400 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Plataforma */}
        <section
          id="plataforma"
          className="relative mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-16 sm:py-20 scroll-mt-20"
        >
          <div className="text-center mb-12">
            <p className="text-xs font-semibold uppercase tracking-widest text-[#5b5bf6] mb-3">
              Plataforma
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold leading-tight mb-3">
              El cerebro operativo de su empresa
            </h2>
            <p className="text-gray-400 max-w-xl mx-auto text-sm sm:text-base">
              Tres caminos, una sola plataforma. Noova se adapta a donde está hoy y la lleva
              donde quiere llegar.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 mb-14">
            {SCENARIOS.map(item => {
              const Icon = item.icon;
              return (
                <div
                  key={item.title}
                  className="rounded-2xl border border-white/[.08] bg-gradient-to-b from-white/[.04] to-transparent p-7"
                >
                  <div className="w-11 h-11 rounded-lg bg-[#5b5bf6]/15 flex items-center justify-center mb-4">
                    <Icon className="w-5 h-5 text-[#a5a5ff]" />
                  </div>
                  <h3 className="text-lg font-bold mb-2">{item.title}</h3>
                  <p className="text-sm text-gray-400 leading-relaxed mb-4">{item.desc}</p>
                  <div className="flex flex-wrap gap-2">
                    {item.tags.map(tag => (
                      <span
                        key={tag}
                        className="text-[10px] font-semibold uppercase tracking-wide px-2 py-1 rounded-md bg-white/[.05] text-gray-400 border border-white/[.06]"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Canales */}
          <div className="text-center mb-10">
            <h3 className="text-2xl sm:text-3xl font-bold">Un agente, todos sus canales</h3>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                icon: Radio,
                title: "Agentes de voz",
                desc: "Llama, califica leads, hace seguimiento y coordina citas con su equipo comercial.",
                color: "primary"
              },
              {
                icon: MessageSquare,
                title: "WhatsApp e inbox",
                desc: "Atiende clientes, responde consultas y escala a humano con contexto completo.",
                color: "blue"
              },
              {
                icon: BarChart3,
                title: "Mi Link y widget",
                desc: "Micrositio y chat embebible: capture leads desde redes, web y campañas.",
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
                  <h4 className="text-lg font-bold mb-2">{agent.title}</h4>
                  <p className="text-gray-400 text-sm leading-relaxed">{agent.desc}</p>
                </div>
              );
            })}
          </div>
        </section>

        {/* Casos de uso */}
        <section id="casos" className="relative mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-16 sm:py-20 scroll-mt-20 border-t border-white/[.06]">
          <div className="text-center mb-12">
            <p className="text-xs font-semibold uppercase tracking-widest text-[#5b5bf6] mb-3">
              Casos de uso
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold leading-tight mb-3">
              Lo que puede automatizar hoy
            </h2>
            <p className="text-gray-400 max-w-xl mx-auto text-sm sm:text-base">
              Ventas, servicio al cliente y operación — en cualquier industria, desde un solo
              lugar.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {USE_CASES.map((item, i) => {
              const Icon = item.icon;
              return (
                <div
                  key={i}
                  className="rounded-2xl border border-white/[.08] bg-white/[.02] p-5 hover:border-[#5b5bf6]/25 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="w-9 h-9 rounded-lg bg-[#5b5bf6]/15 flex items-center justify-center flex-shrink-0">
                      <Icon className="w-4 h-4 text-[#a5a5ff]" />
                    </div>
                    <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-md bg-white/[.05] text-gray-400 border border-white/[.06]">
                      {item.tag}
                    </span>
                  </div>
                  <h3 className="font-semibold text-sm mb-1.5">{item.title}</h3>
                  <p className="text-xs text-gray-400 leading-relaxed">{item.desc}</p>
                </div>
              );
            })}
          </div>
        </section>

        {/* Proceso */}
        <section className="relative mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-16 sm:py-20">
          <div className="text-center mb-12">
            <p className="text-xs font-semibold uppercase tracking-widest text-[#5b5bf6] mb-3">
              Proceso
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold leading-tight mb-3">
              De diagnóstico a operación con ia
            </h2>
            <p className="text-gray-400 max-w-xl mx-auto text-sm sm:text-base">
              Implementación guiada por etapas: priorizamos lo que más impacto tiene y pasamos a
              producción con control.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {PROCESS.map(item => (
              <div
                key={item.step}
                className="relative rounded-2xl border border-white/[.08] bg-white/[.02] p-6 sm:p-7"
              >
                <span className="text-4xl font-black text-[#5b5bf6]/20 absolute top-4 right-5">
                  {item.step}
                </span>
                <Clock className="w-5 h-5 text-[#5b5bf6] mb-4" />
                <h3 className="text-lg font-semibold mb-2 pr-8">{item.title}</h3>
                <p className="text-sm text-gray-400 leading-relaxed mb-4">{item.desc}</p>
                <p className="text-xs font-medium text-[#a5a5ff]">{item.meta}</p>
              </div>
            ))}
          </div>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-6 text-sm text-gray-500">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-[#5b5bf6]" />
              <span>Implementación guiada</span>
            </div>
            <div className="flex items-center gap-2">
              <Brain className="w-4 h-4 text-blue-400" />
              <span>Agentes entrenados con su negocio</span>
            </div>
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-cyan-400" />
              <span>Soporte en español 24/7</span>
            </div>
          </div>
        </section>

        <PricingSection variant="generic" />

        {/* FAQ */}
        <section id="faq" className="relative mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-16 sm:py-20 scroll-mt-20">
          <div className="text-center mb-10">
            <p className="text-xs font-semibold uppercase tracking-widest text-[#5b5bf6] mb-3">
              FAQ
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold">Preguntas frecuentes</h2>
          </div>

          <div className="space-y-3">
            {FAQ.map(item => (
              <details
                key={item.q}
                className="group rounded-xl border border-white/[.08] bg-white/[.02] open:border-[#5b5bf6]/25 transition-colors"
              >
                <summary className="flex items-center justify-between gap-4 cursor-pointer list-none px-5 py-4 text-sm font-medium">
                  {item.q}
                  <ChevronDown className="w-4 h-4 text-gray-500 flex-shrink-0 transition-transform group-open:rotate-180" />
                </summary>
                <p className="px-5 pb-4 text-sm text-gray-400 leading-relaxed">{item.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="relative mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-16 sm:py-20">
          <div className="relative rounded-3xl border border-[#5b5bf6]/20 bg-gradient-to-br from-[#5b5bf6]/10 via-slate-900/50 to-[#7070f8]/10 p-10 sm:p-12 text-center">
            <p className="text-xs font-semibold uppercase tracking-widest text-[#a5a5ff] mb-3">
              Diagnóstico gratuito · Sin compromiso
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              ¿Listo para ver Noova 360 en acción?
            </h2>
            <p className="text-gray-400 mb-8 max-w-xl mx-auto">
              Reserve su diagnóstico operativo o empiece con 14 días gratis — agentes de voz,
              WhatsApp con ia e inbox omnicanal.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <LeadCaptureButton
                intent={{ source: "footer_cta", planInterest: "demo", title: "Solicitar diagnóstico gratuito" }}
                className="inline-flex items-center justify-center gap-2 px-8 py-3.5 text-sm font-semibold text-white rounded-lg bg-[#5b5bf6] hover:bg-[#7070f8] transition-all"
              >
                Solicitar diagnóstico gratuito
                <ArrowRight className="w-4 h-4" />
              </LeadCaptureButton>
              <LeadCaptureButton
                intent={{ source: "footer_trial", planInterest: "explorador" }}
                className="inline-flex items-center justify-center gap-2 px-8 py-3.5 text-sm font-semibold text-white rounded-lg border border-white/[.15] hover:bg-white/[.05] transition-all"
              >
                Probar 14 días gratis
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
                Plataforma de ia empresarial para empresas que quieren atender, vender y operar
                mejor — en cualquier industria.
              </p>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-400 mb-4">Producto</p>
              <ul className="space-y-2 text-sm text-gray-500">
                <li>
                  <a href="#plataforma" className="hover:text-white transition-colors">
                    Plataforma
                  </a>
                </li>
                <li>
                  <a href="#casos" className="hover:text-white transition-colors">
                    Casos de uso
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
              <p className="text-sm font-semibold text-gray-400 mb-4">Soluciones</p>
              <ul className="space-y-2 text-sm text-gray-500">
                <li>
                  <Link href="/iaseguros" className="hover:text-white transition-colors">
                    IA para seguros
                  </Link>
                </li>
                <li>
                  <LeadCaptureButton
                    intent={{ source: "footer_contact", planInterest: "demo" }}
                    className="hover:text-white transition-colors text-left"
                  >
                    Contacto
                  </LeadCaptureButton>
                </li>
                <li>
                  <Link href="/privacy" className="hover:text-white transition-colors">
                    Política de privacidad
                  </Link>
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
                <li>
                  <Link href="/signup" className="hover:text-white transition-colors">
                    Crear cuenta
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

export default function NoovaLandingPage() {
  return (
    <LeadCaptureProvider>
      <LeadCaptureUrlOpener />
      <LandingPageContent />
      <LandingWidgetEmbed />
    </LeadCaptureProvider>
  );
}
