"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Users, Shield, User, Search, RefreshCw, ChevronDown, CheckCircle, Clock, MailCheck, AlertCircle } from "lucide-react";

interface UserRecord {
  id: string;
  email: string;
  nombre: string;
  rol: string;
  empresa_id: string | null;
  created_at: string;
  updated_at: string;
  email_confirmed?: boolean;
}

const ROL_BADGE: Record<string, { label: string; color: string }> = {
  admin:   { label: "Admin",    color: "bg-violet-500/20 text-violet-400 border-violet-500/30" },
  user:    { label: "Usuario",  color: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  agente:  { label: "Agente",   color: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30" },
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-ES", {
    day: "2-digit", month: "short", year: "numeric"
  });
}

export default function AdminUsers() {
  const [users, setUsers]     = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState("");
  const [error, setError]     = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  async function fetchUsers() {
    setLoading(true);
    setError("");
    const { data, error: err } = await supabase
      .from("users")
      .select("*")
      .order("created_at", { ascending: false });

    if (err) {
      setError("No se pudieron cargar los usuarios: " + err.message);
    } else {
      setUsers(data || []);
    }
    setLoading(false);
  }

  useEffect(() => { fetchUsers(); }, []);

  async function confirmUser(userId: string) {
    setConfirmingId(userId);
    try {
      const res = await fetch("/api/admin/confirm-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId })
      });
      const json = await res.json();
      if (json.success) {
        setUsers(prev => prev.map(u => u.id === userId ? { ...u, email_confirmed: true } : u));
      } else {
        alert("Error al confirmar: " + json.error);
      }
    } catch (e) {
      alert("Error de red al confirmar usuario");
    }
    setConfirmingId(null);
  }

  async function changeRol(userId: string, newRol: string) {
    setUpdatingId(userId);
    const { error: err } = await supabase
      .from("users")
      .update({ rol: newRol, updated_at: new Date().toISOString() })
      .eq("id", userId);

    if (!err) {
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, rol: newRol } : u));
    }
    setUpdatingId(null);
  }

  const filtered = users.filter(u =>
    u.email.toLowerCase().includes(search.toLowerCase()) ||
    u.nombre?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex-1 flex flex-col bg-[#0d0e14] text-white min-h-screen">

      {/* Header */}
      <div className="border-b border-white/[.08] px-6 py-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Users className="w-5 h-5 text-violet-400" />
              <h1 className="text-xl font-bold">Gestión de Usuarios</h1>
            </div>
            <p className="text-sm text-gray-500">
              {users.length} usuario{users.length !== 1 ? "s" : ""} registrado{users.length !== 1 ? "s" : ""}
            </p>
          </div>
          <button
            onClick={fetchUsers}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/[.04] border border-white/[.08] text-sm text-gray-300 hover:text-white hover:bg-white/[.08] transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Actualizar
          </button>
        </div>

        {/* Search */}
        <div className="mt-4 relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder="Buscar por nombre o email..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-white/[.04] border border-white/[.08] rounded-lg pl-10 pr-4 py-2 text-sm placeholder-gray-600 focus:outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/20 transition-all"
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 p-6">

        {error && (
          <div className="mb-4 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-400">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <RefreshCw className="w-6 h-6 text-violet-400 animate-spin mr-3" />
            <span className="text-gray-400">Cargando usuarios...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <Users className="w-12 h-12 text-gray-700 mb-4" />
            <p className="text-gray-500 font-medium">
              {search ? "No se encontraron usuarios con ese criterio" : "Aún no hay usuarios registrados"}
            </p>
          </div>
        ) : (
          <div className="bg-white/[.02] border border-white/[.08] rounded-xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/[.08] bg-white/[.02]">
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Usuario</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Email</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Rol</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Registrado</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Email</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[.05]">
                {filtered.map(u => {
                  const badge = ROL_BADGE[u.rol] ?? { label: u.rol, color: "bg-gray-500/20 text-gray-400 border-gray-500/30" };
                  return (
                    <tr key={u.id} className="hover:bg-white/[.02] transition-colors">

                      {/* Avatar + Nombre */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                            u.rol === "admin"
                              ? "bg-violet-500/20 text-violet-400"
                              : "bg-white/[.08] text-gray-400"
                          }`}>
                            {u.nombre ? u.nombre[0].toUpperCase() : "?"}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-white leading-none mb-0.5">{u.nombre || "—"}</p>
                            <p className="text-xs text-gray-600 font-mono">{u.id.slice(0, 8)}…</p>
                          </div>
                        </div>
                      </td>

                      {/* Email */}
                      <td className="px-6 py-4 text-sm text-gray-300">{u.email}</td>

                      {/* Rol badge */}
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border ${badge.color}`}>
                          {u.rol === "admin" ? <Shield className="w-3 h-3" /> : <User className="w-3 h-3" />}
                          {badge.label}
                        </span>
                      </td>

                      {/* Fecha */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1.5 text-xs text-gray-500">
                          <Clock className="w-3 h-3" />
                          {formatDate(u.created_at)}
                        </div>
                      </td>

                      {/* Estado email */}
                      <td className="px-6 py-4">
                        {u.email_confirmed === false ? (
                          <div className="flex items-center gap-1.5 text-xs text-amber-400">
                            <AlertCircle className="w-3.5 h-3.5" />
                            Sin verificar
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 text-xs text-green-400">
                            <CheckCircle className="w-3.5 h-3.5" />
                            Verificado
                          </div>
                        )}
                      </td>

                      {/* Acciones */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          {/* Confirmar email */}
                          {u.email_confirmed === false && (
                            confirmingId === u.id ? (
                              <RefreshCw className="w-4 h-4 text-cyan-400 animate-spin" />
                            ) : (
                              <button
                                onClick={() => confirmUser(u.id)}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-xs text-cyan-400 hover:bg-cyan-500/20 transition-all"
                              >
                                <MailCheck className="w-3 h-3" />
                                Verificar
                              </button>
                            )
                          )}

                          {/* Cambiar rol */}
                          {updatingId === u.id ? (
                            <RefreshCw className="w-4 h-4 text-violet-400 animate-spin" />
                          ) : (
                            <div className="relative group">
                              <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[.04] border border-white/[.08] text-xs text-gray-400 hover:text-white hover:border-white/[.16] transition-all">
                                Rol
                                <ChevronDown className="w-3 h-3" />
                              </button>
                              <div className="absolute right-0 top-full mt-1 w-32 bg-[#0f1020] border border-white/[.12] rounded-xl shadow-2xl z-10 overflow-hidden opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-opacity">
                                {["admin", "user", "agente"].map(rol => (
                                  <button
                                    key={rol}
                                    onClick={() => changeRol(u.id, rol)}
                                    disabled={u.rol === rol}
                                    className={`w-full flex items-center gap-2 px-4 py-2.5 text-xs text-left transition-colors ${
                                      u.rol === rol
                                        ? "text-violet-400 bg-violet-500/10 cursor-default"
                                        : "text-gray-400 hover:text-white hover:bg-white/[.06]"
                                    }`}
                                  >
                                    {u.rol === rol && <CheckCircle className="w-3 h-3" />}
                                    <span className="capitalize">{rol}</span>
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Stats footer */}
        {!loading && users.length > 0 && (
          <div className="mt-4 flex items-center gap-6 text-xs text-gray-600">
            <span>{users.filter(u => u.rol === "admin").length} admin(s)</span>
            <span>{users.filter(u => u.rol === "user").length} usuario(s)</span>
            <span>{users.filter(u => u.rol === "agente").length} agente(s)</span>
          </div>
        )}
      </div>
    </div>
  );
}
