"use client";

import { Bell, MessageCircle, Zap, Phone } from "lucide-react";

export default function Dashboard() {
  return (
    <div className="flex-1 flex flex-col bg-[#0d0e14] text-white overflow-hidden">
      {/* Header */}
      <div className="border-b border-white/[.06] bg-[#0d0e14]/50 backdrop-blur px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <input
              type="text"
              placeholder="Buscar leads, agentes..."
              className="w-full max-w-md bg-white/[.05] border border-white/[.08] rounded-lg px-4 py-2 text-sm placeholder-gray-500 focus:outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/20"
            />
          </div>

          {/* Right Section - Notifications & Profile */}
          <div className="flex items-center gap-4">
            <button className="p-2 hover:bg-white/[.08] rounded-lg transition-colors relative">
              <Bell className="w-5 h-5 text-gray-400" />
              <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
            </button>

            {/* Profile Dropdown */}
            <div className="flex items-center gap-3 pl-4 border-l border-white/[.06]">
              <div>
                <p className="text-sm font-medium text-white">Juan García</p>
                <p className="text-xs text-gray-500">admin@noova360.com</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-gradient-to-br from-violet-500 to-blue-500 flex items-center justify-center cursor-pointer hover:ring-2 hover:ring-violet-500/50 transition-all">
                <span className="text-sm font-bold">JG</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-7xl">
          <div className="mb-8">
            <h1 className="text-3xl font-bold mb-2">Bienvenido a Noova 360</h1>
            <p className="text-gray-400">Panel de control - IA Operativa para Corredores de Seguros</p>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {[
              { label: "Leads Activos", value: "248", change: "+12%", color: "violet" },
              { label: "Conversaciones", value: "1,842", change: "+8%", color: "blue" },
              { label: "Cotizaciones Hoy", value: "45", change: "+23%", color: "cyan" },
              { label: "Tasa Conversión", value: "34.2%", change: "+5.1%", color: "green" },
            ].map((stat, i) => (
              <div key={i} className="bg-white/[.02] border border-white/[.08] rounded-xl p-6 hover:bg-white/[.04] transition-colors">
                <p className="text-gray-400 text-sm mb-2">{stat.label}</p>
                <div className="flex items-baseline gap-3">
                  <span className="text-3xl font-bold">{stat.value}</span>
                  <span className={`text-sm font-medium ${
                    stat.color === "violet" ? "text-violet-400" :
                    stat.color === "blue" ? "text-blue-400" :
                    stat.color === "cyan" ? "text-cyan-400" :
                    "text-green-400"
                  }`}>
                    {stat.change}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Main Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Column */}
            <div className="lg:col-span-2 space-y-6">
              {/* Leads Recientes */}
              <div className="bg-white/[.02] border border-white/[.08] rounded-xl p-6">
                <h2 className="text-lg font-bold mb-4">Leads Recientes</h2>
                <div className="space-y-3">
                  {[
                    { name: "Carlos González", ramo: "Auto", estado: "Cotizado", date: "Hace 2h" },
                    { name: "María López", ramo: "Salud", estado: "Perfilado", date: "Hace 4h" },
                    { name: "Juan Martínez", ramo: "Hogar", estado: "Capturado", date: "Hace 1h" },
                  ].map((lead, i) => (
                    <div key={i} className="flex items-center justify-between p-3 bg-white/[.02] rounded-lg hover:bg-white/[.04] transition-colors cursor-pointer">
                      <div>
                        <p className="font-medium text-white">{lead.name}</p>
                        <p className="text-xs text-gray-500">{lead.ramo}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs px-2 py-1 rounded-full bg-violet-500/20 text-violet-300">{lead.estado}</span>
                        <span className="text-xs text-gray-500">{lead.date}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Actividad IA */}
              <div className="bg-white/[.02] border border-white/[.08] rounded-xl p-6">
                <h2 className="text-lg font-bold mb-4">Actividad IA - Últimas 24h</h2>
                <div className="space-y-2 text-sm">
                  <p className="text-gray-400">✓ <span className="text-white">156</span> conversaciones procesadas</p>
                  <p className="text-gray-400">✓ <span className="text-white">42</span> cotizaciones generadas</p>
                  <p className="text-gray-400">✓ <span className="text-white">28</span> leads clasificados</p>
                  <p className="text-gray-400">✓ <span className="text-white">15</span> llamadas de renovación completadas</p>
                </div>
              </div>
            </div>

            {/* Right Column */}
            <div className="space-y-6">
              {/* Tip Card */}
              <div className="bg-gradient-to-br from-violet-600/20 to-blue-600/10 border border-violet-500/20 rounded-xl p-6">
                <p className="text-sm font-semibold text-violet-300 mb-3">💡 Pro Tip</p>
                <p className="text-sm text-gray-300 mb-4">Activa ORI Copiloto para recibir sugerencias automáticas en tus cotizaciones.</p>
                <button className="w-full px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium transition-colors">
                  Activar ORI
                </button>
              </div>

              {/* Quick Actions */}
              <div className="bg-white/[.02] border border-white/[.08] rounded-xl p-6">
                <h2 className="text-lg font-bold mb-4">Acciones Rápidas</h2>
                <div className="space-y-2">
                  <button className="w-full flex items-center gap-2 px-4 py-2.5 rounded-lg bg-white/[.05] hover:bg-white/[.08] text-white text-sm font-medium transition-colors">
                    <MessageCircle className="w-4 h-4" />
                    Nuevo Lead
                  </button>
                  <button className="w-full flex items-center gap-2 px-4 py-2.5 rounded-lg bg-white/[.05] hover:bg-white/[.08] text-white text-sm font-medium transition-colors">
                    <Zap className="w-4 h-4" />
                    Generar Cotización
                  </button>
                  <button className="w-full flex items-center gap-2 px-4 py-2.5 rounded-lg bg-white/[.05] hover:bg-white/[.08] text-white text-sm font-medium transition-colors">
                    <Phone className="w-4 h-4" />
                    Llamada IA
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
