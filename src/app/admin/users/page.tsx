"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { Users, Shield, User, RefreshCw, ChevronDown, CheckCircle, Clock, MailCheck, AlertCircle, Phone } from "lucide-react";
import {
  registryPage, registryToolbar, registryContent,
  registryTable, registryTableHead, registryTableHeadRow, registryTableHeadCell,
  registryTableRow, registryTableCell, registryTableCellFirst, registryTableCellMuted,
  registryTableLoading, registryTableEmpty, textMuted
} from "@/lib/brand-ui";
import { RegistryTableLayout } from "@/components/ui/RegistryTableLayout";
import { NoovaListMenu, NoovaListMenuItem } from "@/components/ui/NoovaSelect";

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
  admin:   { label: "Admin",    color: "bg-[#5b5bf6]/20 text-[#5b5bf6] border-[#5b5bf6]/30" },
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
  const [roleMenuUserId, setRoleMenuUserId] = useState<string | null>(null);

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
    <div className={registryPage}>

      <div className={registryToolbar}>
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Users className="w-5 h-5 text-[#5b5bf6]" />
            <h1 className="text-xl font-bold tracking-tight">Gestión de Usuarios</h1>
          </div>
          <p className={`text-xs ${textMuted}`}>
            {users.length} usuario{users.length !== 1 ? "s" : ""} registrado{users.length !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      <div className={registryContent}>
        <RegistryTableLayout
          search={search}
          onSearchChange={setSearch}
          onRefresh={fetchUsers}
          refreshing={loading}
          error={error || undefined}
          footer={!loading && users.length > 0 ? (
            <>
              <span>{filtered.length} de {users.length} usuarios</span>
              <span className="flex items-center gap-4">
                <span>{users.filter(u => u.rol === "admin").length} admin(s)</span>
                <span>{users.filter(u => u.rol === "user").length} usuario(s)</span>
                <span>{users.filter(u => u.rol === "agente").length} agente(s)</span>
              </span>
            </>
          ) : undefined}
        >
        {loading ? (
          <div className={registryTableLoading}>
            <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Cargando usuarios...
          </div>
        ) : filtered.length === 0 ? (
          <div className={registryTableEmpty}>
            {search ? "No se encontraron usuarios con ese criterio" : "Aún no hay usuarios registrados"}
          </div>
        ) : (
            <table className={registryTable}>
              <thead className={registryTableHead}>
                <tr className={registryTableHeadRow}>
                  <th className={registryTableHeadCell}>Usuario</th>
                  <th className={registryTableHeadCell}>Email</th>
                  <th className={registryTableHeadCell}>Rol</th>
                  <th className={registryTableHeadCell}>Registrado</th>
                  <th className={registryTableHeadCell}>Verificación</th>
                  <th className={registryTableHeadCell}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(u => {
                  const badge = ROL_BADGE[u.rol] ?? { label: u.rol, color: "bg-gray-500/20 text-gray-400 border-gray-500/30" };
                  return (
                    <tr key={u.id} className={registryTableRow}>

                      {/* Avatar + Nombre */}
                      <td className={registryTableCellFirst}>
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                            u.rol === "admin"
                              ? "bg-[#5b5bf6]/20 text-[#5b5bf6]"
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
                      <td className={`${registryTableCell} text-sm text-gray-300`}>{u.email}</td>

                      {/* Rol badge */}
                      <td className={registryTableCell}>
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border ${badge.color}`}>
                          {u.rol === "admin" ? <Shield className="w-3 h-3" /> : <User className="w-3 h-3" />}
                          {badge.label}
                        </span>
                      </td>

                      {/* Fecha */}
                      <td className={registryTableCellMuted}>
                        <div className="flex items-center gap-1.5 text-xs">
                          <Clock className="w-3 h-3" />
                          {formatDate(u.created_at)}
                        </div>
                      </td>

                      {/* Estado email */}
                      <td className={registryTableCell}>
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
                      <td className={registryTableCell}>
                        <div className="flex items-center gap-2">
                          {/* Asignar línea telefónica */}
                          <Link
                            href={`/admin/telephony?user_id=${u.id}`}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#5b5bf6]/10 border border-[#5b5bf6]/20 text-xs text-[#5b5bf6] hover:bg-[#5b5bf6]/20 transition-all"
                          >
                            <Phone className="w-3 h-3" />
                            Línea
                          </Link>

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
                            <RefreshCw className="w-4 h-4 text-[#5b5bf6] animate-spin" />
                          ) : (
                            <div className="relative">
                              <button
                                type="button"
                                onClick={() => setRoleMenuUserId(prev => (prev === u.id ? null : u.id))}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[.04] border border-white/[.08] text-xs text-gray-400 hover:text-white hover:border-white/[.16] transition-all"
                              >
                                Rol
                                <ChevronDown className="w-3 h-3" />
                              </button>
                              {roleMenuUserId === u.id && (
                                <NoovaListMenu className="absolute right-0 top-full mt-1 w-32 z-10">
                                  {["admin", "user", "agente"].map(rol => (
                                    <NoovaListMenuItem
                                      key={rol}
                                      active={u.rol === rol}
                                      onClick={() => {
                                        setRoleMenuUserId(null);
                                        if (u.rol !== rol) changeRol(u.id, rol);
                                      }}
                                    >
                                      <span className="capitalize flex items-center gap-2">
                                        {u.rol === rol && <CheckCircle className="w-3 h-3" />}
                                        {rol}
                                      </span>
                                    </NoovaListMenuItem>
                                  ))}
                                </NoovaListMenu>
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
        )}
        </RegistryTableLayout>
      </div>
    </div>
  );
}
