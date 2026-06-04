"use client";

import Link from "next/link";
import { MessageSquare, Zap, Users, ArrowRight, Flame, TrendingUp, Brain, Radio, BarChart3 } from "lucide-react";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#06070d] text-white">
      {/* Navigation */}
      <header className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between h-14 px-6 bg-[#06070d]/80 backdrop-blur-xl border-b border-white/[.06]">
        <div className="flex items-center gap-2">
          <div className="text-lg font-bold tracking-tight">Noova 360</div>
          <span className="text-xs px-2.5 py-1 rounded-full bg-violet-600/30 text-violet-200 border border-violet-500/30 font-medium">
            IA Operativa
          </span>
        </div>
        <Link
          href="/login"
          className="h-9 px-4 rounded-lg border border-white/[.1] text-sm font-medium text-white hover:bg-white/[.05] transition-all"
        >
          Ingresar
        </Link>
      </header>

      <main className="relative z-10" style={{ paddingTop: "5.5rem" }}>
        {/* Hero Section */}
        <section className="relative mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-20 sm:py-32 lg:py-40">
          {/* Background gradient */}
          <div className="absolute inset-0 -z-10 overflow-hidden">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-96 bg-violet-600/15 rounded-full blur-3xl"></div>
            <div className="absolute bottom-20 right-1/4 w-64 h-64 bg-blue-600/10 rounded-full blur-3xl"></div>
          </div>

          <div className="text-center max-w-3xl mx-auto">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 mb-8 px-4 py-2 rounded-full border border-violet-500/30 bg-violet-500/10">
              <Flame className="w-4 h-4 text-violet-400" />
              <span className="text-sm font-semibold text-violet-200">La próxima capa inteligente de seguros</span>
            </div>

            {/* Main headline */}
            <h1 className="text-6xl sm:text-7xl lg:text-8xl font-extrabold leading-tight mb-6 text-white tracking-tight">
              IA Operativa para corredores de seguros
            </h1>

            {/* Subheadline */}
            <p className="text-lg text-gray-400 mb-10 leading-relaxed">
              No es otra IA genérica. Noova 360 especializa en seguros: perfila leads, entiende contexto técnico, intención comercial y gestiona activamente todo tu pipeline.
            </p>

            {/* Key metrics */}
            <div className="flex flex-wrap gap-3 justify-center mb-10">
              <div className="flex items-center gap-2 px-4 py-2 rounded-lg border border-violet-500/20 bg-white/[.03]">
                <TrendingUp className="w-4 h-4 text-violet-400" />
                <span className="text-sm font-medium">+30% Productividad</span>
              </div>
              <div className="flex items-center gap-2 px-4 py-2 rounded-lg border border-blue-500/20 bg-white/[.03]">
                <Brain className="w-4 h-4 text-blue-400" />
                <span className="text-sm font-medium">Especializada en seguros</span>
              </div>
              <div className="flex items-center gap-2 px-4 py-2 rounded-lg border border-cyan-500/20 bg-white/[.03]">
                <Zap className="w-4 h-4 text-cyan-400" />
                <span className="text-sm font-medium">Operativa 24/7</span>
              </div>
            </div>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
              <Link
                href="/login"
                className="inline-flex items-center justify-center gap-2 px-8 py-3.5 text-sm font-semibold text-white rounded-lg bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-700 hover:to-blue-700 transition-all shadow-lg shadow-violet-600/25"
              >
                Probar demo gratis
                <ArrowRight className="w-4 h-4" />
              </Link>
              <a
                href="#features"
                className="inline-flex items-center justify-center gap-2 px-8 py-3.5 text-sm font-semibold text-white rounded-lg border border-white/[.15] hover:bg-white/[.05] transition-all backdrop-blur-sm"
              >
                Ver cómo funciona
              </a>
            </div>

            {/* Social proof */}
            <div className="flex items-center justify-center gap-3 text-sm text-gray-500">
              <div className="flex -space-x-2">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-blue-500 border border-[#06070d] flex items-center justify-center text-xs font-bold text-white"
                  >
                    {i}
                  </div>
                ))}
              </div>
              <span>Usado por agencias en expansión</span>
            </div>
          </div>
        </section>

        {/* Specialization Section */}
        <section className="relative mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-20 sm:py-24">
          <div className="absolute inset-0 -z-10">
            <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-slate-900/50 via-slate-900/30 to-slate-950/50 border border-violet-500/10"></div>
          </div>

          <div className="grid md:grid-cols-2 gap-12 items-center">
            {/* Left side */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-violet-400 mb-4">Diferenciador Core</p>
              <h2 className="text-4xl sm:text-5xl font-bold leading-tight mb-8">
                IA entrenada como corredor de seguros
              </h2>
              
              <p className="text-base text-gray-400 mb-8 leading-relaxed">
                No es una IA genérica. Noova 360 está especializada y entrenada con todo el conocimiento técnico, comercial y operativo de un corredor profesional.
              </p>

              <div className="space-y-4">
                {[
                  "Entiende cada ramo de seguros (autos, salud, hogar, empresariales, vida)",
                  "Maneja la lógica comercial de cotizaciones y renovaciones",
                  "Realiza perfilamiento técnico como un experto",
                  "Toma decisiones comerciales profesionales"
                ].map((item, i) => (
                  <div key={i} className="flex gap-3 items-start">
                    <div className="w-5 h-5 rounded-full bg-gradient-to-r from-violet-500 to-blue-500 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-white text-xs font-bold">✓</span>
                    </div>
                    <span className="text-gray-300 text-sm">{item}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Right side - Feature cards */}
            <div className="space-y-5">
              {[
                { icon: Brain, color: "violet", title: "Conocimiento Especializado", desc: "Entrenada en seguros con data de 1000+ políticas" },
                { icon: Zap, color: "blue", title: "Operativa 24/7", desc: "Actúa como corredor sin pausas, sin errores" },
                { icon: Users, color: "cyan", title: "Propuestas Comerciales", desc: "Genera cotizaciones y negocia profesionalmente" }
              ].map((item, i) => {
                const Icon = item.icon;
                const colorClass = item.color === "violet" ? "from-violet-600/20 to-blue-600/20 text-violet-300" : 
                                 item.color === "blue" ? "from-blue-600/20 to-cyan-600/20 text-blue-300" :
                                 "from-cyan-600/20 to-blue-600/20 text-cyan-300";
                return (
                  <div key={i} className={`bg-gradient-to-br ${colorClass} p-6 rounded-2xl border border-white/[.06] backdrop-blur`}>
                    <Icon className="w-8 h-8 mb-3" />
                    <h3 className="font-semibold mb-2">{item.title}</h3>
                    <p className="text-sm text-gray-300">{item.desc}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Agents Section */}
        <section id="features" className="relative mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-20 sm:py-24">
          <div className="text-center mb-16">
            <p className="text-xs font-semibold uppercase tracking-widest text-violet-400 mb-4">Agentes Especializados</p>
            <h2 className="text-4xl sm:text-5xl font-bold leading-tight">
              Tres agentes IA para tu operación
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                icon: Radio,
                title: "Agentes de Voz",
                desc: "Llamadas automáticas para calificar leads, recordar vencimientos y más",
                color: "violet"
              },
              {
                icon: MessageSquare,
                title: "Agentes de Texto",
                desc: "WhatsApp, email, SMS - comunícate donde están tus clientes",
                color: "blue"
              },
              {
                icon: BarChart3,
                title: "Agentes de Campañas",
                desc: "Automatiza toda tu estrategia de prospección y seguimiento",
                color: "cyan"
              }
            ].map((agent, i) => {
              const Icon = agent.icon;
              const bgGradient = agent.color === "violet" ? "from-violet-600/10 to-blue-600/10 border-violet-500/20" :
                               agent.color === "blue" ? "from-blue-600/10 to-cyan-600/10 border-blue-500/20" :
                               "from-cyan-600/10 to-blue-600/10 border-cyan-500/20";
              const iconColor = agent.color === "violet" ? "text-violet-400" :
                              agent.color === "blue" ? "text-blue-400" :
                              "text-cyan-400";
              
              return (
                <div key={i} className={`bg-gradient-to-br ${bgGradient} p-8 rounded-2xl border backdrop-blur`}>
                  <div className={`w-12 h-12 rounded-lg bg-gradient-to-br from-white/10 to-white/5 flex items-center justify-center mb-4`}>
                    <Icon className={`w-6 h-6 ${iconColor}`} />
                  </div>
                  <h3 className="text-xl font-bold mb-3">{agent.title}</h3>
                  <p className="text-gray-400 text-sm leading-relaxed">{agent.desc}</p>
                  <Link
                    href="/dashboard"
                    className="inline-flex items-center gap-2 mt-6 px-4 py-2 text-sm font-medium text-white rounded-lg border border-white/[.1] hover:bg-white/[.05] transition-all"
                  >
                    Explorar
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              );
            })}
          </div>
        </section>

        {/* CTA Section */}
        <section className="relative mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-20">
          <div className="relative rounded-3xl border border-violet-500/20 bg-gradient-to-br from-violet-600/10 via-slate-900/50 to-blue-600/10 p-12 text-center backdrop-blur">
            <div className="absolute inset-0 -z-10 rounded-3xl blur-2xl bg-violet-600/5"></div>
            
            <h2 className="text-4xl sm:text-5xl font-bold mb-6">
              Comienza tu transformación hoy
            </h2>
            <p className="text-lg text-gray-400 mb-8 max-w-2xl mx-auto">
              Únete a corredores que ya están usando IA para cerrar más deals y automatizar su operación completa.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/login"
                className="inline-flex items-center justify-center gap-2 px-8 py-3.5 text-sm font-semibold text-white rounded-lg bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-700 hover:to-blue-700 transition-all"
              >
                Acceso Gratis
                <ArrowRight className="w-4 h-4" />
              </Link>
              <a
                href="mailto:hello@noova360.com"
                className="inline-flex items-center justify-center px-8 py-3.5 text-sm font-semibold text-white rounded-lg border border-white/[.15] hover:bg-white/[.05] transition-all"
              >
                Contactar Ventas
              </a>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/[.06] py-12 px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-8">
            <div>
              <p className="text-sm font-semibold text-gray-400 mb-4">Producto</p>
              <ul className="space-y-2 text-sm text-gray-500">
                <li><a href="#" className="hover:text-white transition-colors">Agentes de Voz</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Agentes de Texto</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Campañas</a></li>
              </ul>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-400 mb-4">Empresa</p>
              <ul className="space-y-2 text-sm text-gray-500">
                <li><a href="#" className="hover:text-white transition-colors">Sobre nosotros</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Blog</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Contacto</a></li>
              </ul>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-400 mb-4">Legal</p>
              <ul className="space-y-2 text-sm text-gray-500">
                <li><a href="#" className="hover:text-white transition-colors">Privacidad</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Términos</a></li>
              </ul>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-400 mb-4">Social</p>
              <ul className="space-y-2 text-sm text-gray-500">
                <li><a href="#" className="hover:text-white transition-colors">Twitter</a></li>
                <li><a href="#" className="hover:text-white transition-colors">LinkedIn</a></li>
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
