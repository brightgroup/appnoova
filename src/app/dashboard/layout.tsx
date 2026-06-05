"use client";

import { useState, useEffect } from "react";
import { LogOut, Settings, ChevronLeft, ChevronRight, BarChart3, Radio, MessageSquare, Target, Bot, CreditCard } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [expandedMenu, setExpandedMenu] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.replace("/login");
      } else {
        setChecked(true);
      }
    });
  }, [router]);

  const logout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  if (!checked) return null;

  const toggleMenu = (menu: string) => {
    setExpandedMenu(expandedMenu === menu ? null : menu);
  };

  return (
    <div className="flex h-screen bg-[#0d0e14] text-white">
      {/* Sidebar */}
      <div className={`${sidebarOpen ? "w-64" : "w-20"} bg-[#09090f] border-r border-white/[.08] transition-all duration-300 flex flex-col overflow-hidden`}>
        {/* Logo */}
        <div className={`p-4 border-b border-white/[.08] flex items-center ${sidebarOpen ? "justify-between" : "justify-center"}`}>
          {sidebarOpen && (
            <Link href="/dashboard" className="relative h-10 w-44 flex-shrink-0">
              <Image
                src="/logo-noova.png"
                alt="Noova 360"
                fill
                className="object-contain object-left"
                priority
              />
            </Link>
          )}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-1.5 hover:bg-white/[.12] rounded-lg transition-colors text-gray-300 hover:text-white"
            title={sidebarOpen ? "Comprimir menú" : "Expandir menú"}
          >
            {sidebarOpen ? <ChevronLeft className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
          </button>
        </div>

        {/* Navigation */}
        <nav className={`flex-1 ${sidebarOpen ? "p-3 space-y-1" : "p-3 space-y-3"} overflow-y-auto scrollbar-thin`}>
          {/* Agentes de Voz */}
          <div>
            <button
              onClick={() => toggleMenu("voz")}
              className={`w-full flex items-center justify-center px-3 py-2.5 rounded-lg text-sm font-medium transition-all text-gray-300 ${
                sidebarOpen ? "hover:text-white hover:bg-white/[.08]" : "hover:text-white"
              } ${
                expandedMenu === "voz" && sidebarOpen ? "text-white bg-white/[.08]" : ""
              }`}
              title="Agentes de Voz"
            >
              {sidebarOpen ? (
                <>
                  <Radio className="w-5 h-5 flex-shrink-0 mr-3" />
                  <span className="flex-1 text-left">Agentes de Voz</span>
                  <ChevronRight className={`w-4 h-4 transition-transform ml-2 ${expandedMenu === "voz" ? "rotate-90" : ""}`} />
                </>
              ) : (
                <Radio className="w-5 h-5 flex-shrink-0" />
              )}
            </button>
            {sidebarOpen && expandedMenu === "voz" && (
              <div className="ml-8 mt-1 space-y-1.5 pb-2 border-l border-white/[.1]">
                {[{ name: "Agentes", href: "/dashboard/agentes-voz" }, { name: "Historial", href: "#" }, { name: "Números telefónicos", href: "#" }, { name: "Números de prueba", href: "#" }, { name: "Troncales SIP", href: "#" }, { name: "Canales", href: "#" }].map((item, i) => (
                  <Link key={i} href={item.href} className="w-full text-left px-3 py-2 text-sm text-white hover:text-gray-100 transition-colors font-medium block">
                    {item.name}
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Agentes de Texto */}
          <div>
            <button
              onClick={() => toggleMenu("texto")}
              className={`w-full flex items-center justify-center px-3 py-2.5 rounded-lg text-sm font-medium transition-all text-gray-300 ${
                sidebarOpen ? "hover:text-white hover:bg-white/[.08]" : "hover:text-white"
              } ${
                expandedMenu === "texto" && sidebarOpen ? "text-white bg-white/[.08]" : ""
              }`}
              title="Agentes de Texto"
            >
              {sidebarOpen ? (
                <>
                  <MessageSquare className="w-5 h-5 flex-shrink-0 mr-3" />
                  <span className="flex-1 text-left">Agentes de Texto</span>
                  <ChevronRight className={`w-4 h-4 transition-transform ml-2 ${expandedMenu === "texto" ? "rotate-90" : ""}`} />
                </>
              ) : (
                <MessageSquare className="w-5 h-5 flex-shrink-0" />
              )}
            </button>
            {sidebarOpen && expandedMenu === "texto" && (
              <div className="ml-8 mt-1 space-y-1.5 pb-2 border-l border-white/[.1]">
                {[{ name: "Agentes", href: "/dashboard/agentes-texto" }, { name: "Inbox", href: "#" }, { name: "Text Logs", href: "#" }, { name: "Equipos", href: "#" }, { name: "Plantillas", href: "#" }, { name: "Canales", href: "#" }].map((item, i) => (
                  <Link key={i} href={item.href} className="w-full text-left px-3 py-2 text-sm text-white hover:text-gray-100 transition-colors font-medium block">
                    {item.name}
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Campañas */}
          <button 
            className={`w-full flex items-center justify-center px-3 py-2.5 rounded-lg text-sm font-medium text-gray-300 transition-all ${
              sidebarOpen ? "hover:text-white hover:bg-white/[.08]" : "hover:text-white"
            }`}
            title="Campañas"
          >
            {sidebarOpen ? (
              <>
                <Target className="w-5 h-5 flex-shrink-0 mr-3" />
                <span className="flex-1 text-left">Campañas</span>
              </>
            ) : (
              <Target className="w-5 h-5 flex-shrink-0" />
            )}
          </button>

          {/* ORI (Copiloto) */}
          <Link
            href="/dashboard/ori"
            className={`w-full flex items-center justify-center px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
              pathname === "/dashboard/ori"
                ? "text-white bg-gradient-to-r from-violet-600/25 to-cyan-600/15 border border-violet-500/30"
                : `text-gray-300 ${sidebarOpen ? "hover:text-white hover:bg-white/[.08]" : "hover:text-white"}`
            }`}
            title="ORI - Copiloto"
          >
            {sidebarOpen ? (
              <>
                <Bot className="w-5 h-5 flex-shrink-0 mr-3 text-violet-400" />
                <div className="flex-1 flex items-center gap-2">
                  <span>ORI</span>
                  <span className="text-xs px-1.5 py-0.5 rounded-full bg-violet-500/20 text-violet-300 font-semibold">Copiloto</span>
                </div>
              </>
            ) : (
              <Bot className="w-5 h-5 flex-shrink-0 text-violet-400" />
            )}
          </Link>

          {sidebarOpen && <div className="h-px bg-white/[.08] my-2"></div>}

          {/* Dashboard */}
          <Link 
            href="/dashboard"
            className={`w-full flex items-center justify-center px-3 py-2.5 rounded-lg text-sm font-medium bg-gradient-to-r from-violet-600/25 to-blue-600/15 text-white border border-violet-500/30 transition-all ${
              sidebarOpen ? "hover:border-violet-500/50" : ""
            }`}
            title="Dashboard"
          >
            {sidebarOpen ? (
              <>
                <BarChart3 className="w-5 h-5 flex-shrink-0 mr-3" />
                <span className="flex-1 text-left">Dashboard</span>
              </>
            ) : (
              <BarChart3 className="w-5 h-5 flex-shrink-0" />
            )}
          </Link>

          {sidebarOpen && <div className="h-px bg-white/[.08] my-2"></div>}

          {/* Configuración */}
          <button 
            className={`w-full flex items-center justify-center px-3 py-2.5 rounded-lg text-sm font-medium text-gray-300 transition-all ${
              sidebarOpen ? "hover:text-white hover:bg-white/[.08]" : "hover:text-white"
            }`}
            title="Configuración"
          >
            {sidebarOpen ? (
              <>
                <Settings className="w-5 h-5 flex-shrink-0 mr-3" />
                <span className="flex-1 text-left">Configuración</span>
              </>
            ) : (
              <Settings className="w-5 h-5 flex-shrink-0" />
            )}
          </button>
        </nav>

        {/* Footer - Plan & Logout */}
        <div className={`${sidebarOpen ? "p-3 space-y-3" : "p-3 space-y-3"} border-t border-white/[.08]`}>
          {/* Plan Card */}
          {sidebarOpen && (
            <div className="bg-gradient-to-br from-violet-600/20 to-blue-600/10 border border-violet-500/20 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <CreditCard className="w-4 h-4 text-violet-400 flex-shrink-0" />
                <span className="text-xs font-semibold text-white">Pro Plan</span>
              </div>
              <p className="text-xs text-gray-400">Créditos usados</p>
              <p className="text-sm font-bold text-white">0 / 100.4K</p>
            </div>
          )}

          {/* Logout */}
          <button
            onClick={logout}
            className={`w-full flex items-center justify-center px-3 py-2.5 rounded-lg text-sm font-medium text-gray-300 transition-all ${
              sidebarOpen ? "hover:text-red-400 hover:bg-red-500/10" : "hover:text-red-400"
            }`}
            title="Cerrar sesión"
          >
            {sidebarOpen ? (
              <>
                <LogOut className="w-5 h-5 flex-shrink-0 mr-3" />
                <span className="flex-1 text-left">Cerrar sesión</span>
              </>
            ) : (
              <LogOut className="w-5 h-5 flex-shrink-0" />
            )}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {children}
      </div>
    </div>
  );
}
