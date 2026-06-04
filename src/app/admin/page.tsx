"use client";

import Link from "next/link";
import { Users, BarChart3, Phone, Settings } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

export default function AdminDashboard() {
  const { user } = useAuth();

  const stats = [
    { label: "Clientes Totales", value: "0", icon: Users, color: "violet" },
    { label: "Llamadas Hoy", value: "0", icon: Phone, color: "blue" },
    { label: "Templates", value: "3", icon: Settings, color: "cyan" },
    { label: "Duración Promedio", value: "4:23", icon: BarChart3, color: "green" }
  ];

  const menuItems = [
    {
      href: "/admin/users",
      label: "Gestionar Usuarios",
      description: "Crear, editar y eliminar usuarios",
      icon: Users
    },
    {
      href: "/admin/clients",
      label: "Gestionar Clientes",
      description: "Crear, editar y eliminar clientes",
      icon: Users
    },
    {
      href: "/admin/templates",
      label: "Configurar Agentes",
      description: "Editar prompts y configuraciones",
      icon: Settings
    },
    {
      href: "/admin/calls",
      label: "Historial de Llamadas",
      description: "Ver transcripciones y análisis",
      icon: Phone
    }
  ];

  return (
    <div className="flex-1 flex flex-col bg-[#0d0e14] text-white">
      {/* Header */}
      <div className="border-b border-white/[.08] px-6 py-6">
        <h1 className="text-2xl font-bold mb-1">Panel Administrador</h1>
        {user?.email && <p className="text-sm text-gray-500">Sesión: {user.email}</p>}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-12">
          {stats.map((stat, i) => {
            const Icon = stat.icon;
            return (
              <div key={i} className="bg-white/[.02] border border-white/[.08] rounded-xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-gray-400 text-sm">{stat.label}</p>
                  <Icon className={`w-5 h-5 text-${stat.color}-400`} />
                </div>
                <p className="text-3xl font-bold">{stat.value}</p>
              </div>
            );
          })}
        </div>

        {/* Menu Grid */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold mb-6">Opciones</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {menuItems.map((item, i) => {
              const Icon = item.icon;
              return (
                <Link
                  key={i}
                  href={item.href}
                  className="group relative overflow-hidden rounded-xl bg-white/[.02] border border-white/[.08] p-6 hover:border-violet-500/50 hover:bg-white/[.04] transition-all"
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-violet-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="relative">
                    <Icon className="w-8 h-8 text-violet-400 mb-3" />
                    <h3 className="font-semibold mb-1">{item.label}</h3>
                    <p className="text-sm text-gray-400">{item.description}</p>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
