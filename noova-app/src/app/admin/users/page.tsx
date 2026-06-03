"use client";

import { useState, useEffect } from "react";
import { Plus, Edit2, Trash2, Loader, LogOut } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import type { User } from "@/types";

export default function AdminUsers() {
  const { user, logout } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    email: "",
    nombre: "",
    rol: "agent" as const
  });

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("users")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setUsers(data || []);
    } catch (error) {
      console.error("Error loading users:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      if (editingId) {
        // Actualizar usuario
        const { error } = await supabase
          .from("users")
          .update({
            nombre: formData.nombre,
            rol: formData.rol,
            updated_at: new Date().toISOString()
          })
          .eq("id", editingId);

        if (error) throw error;
        await loadUsers();
      } else {
        // Crear usuario via Supabase Auth
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email: formData.email,
          password: Math.random().toString(36).slice(-8), // Contraseña temporal
          options: {
            data: { nombre: formData.nombre }
          }
        });

        if (authError) throw authError;

        if (authData.user) {
          await supabase.from("users").insert({
            id: authData.user.id,
            email: formData.email,
            nombre: formData.nombre,
            rol: formData.rol
          });

          await loadUsers();
        }
      }

      setFormData({ email: "", nombre: "", rol: "agent" });
      setEditingId(null);
      setShowForm(false);
    } catch (error: any) {
      console.error("Error saving user:", error.message);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Estás seguro de que quieres eliminar este usuario?")) return;

    try {
      await supabase.from("users").delete().eq("id", id);
      await loadUsers();
    } catch (error) {
      console.error("Error deleting user:", error);
    }
  };

  const handleEdit = (u: User) => {
    setFormData({
      email: u.email,
      nombre: u.nombre,
      rol: u.rol
    });
    setEditingId(u.id);
    setShowForm(true);
  };

  return (
    <div className="flex-1 flex flex-col bg-[#0d0e14] text-white">
      {/* Header */}
      <div className="border-b border-white/[.08] px-6 py-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold">Usuarios</h1>
            <p className="text-sm text-gray-400 mt-1">Logueado como: {user?.email}</p>
          </div>
          <button
            onClick={logout}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors"
          >
            <LogOut className="w-5 h-5" />
            Logout
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="mb-8 flex items-center justify-between">
          <h2 className="text-2xl font-bold">Gestionar Usuarios</h2>
          <button
            onClick={() => {
              setShowForm(!showForm);
              setEditingId(null);
              setFormData({ email: "", nombre: "", rol: "agent" });
            }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 transition-colors"
          >
            <Plus className="w-5 h-5" />
            Nuevo Usuario
          </button>
        </div>

        {/* Formulario */}
        {showForm && (
          <div className="mb-8 p-6 rounded-xl bg-white/[.02] border border-white/[.08]">
            <h3 className="text-xl font-bold mb-4">
              {editingId ? "Editar Usuario" : "Nuevo Usuario"}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Nombre *</label>
                <input
                  type="text"
                  required
                  value={formData.nombre}
                  onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                  className="w-full bg-white/[.05] border border-white/[.08] rounded-lg px-4 py-2 text-white focus:outline-none focus:border-violet-500/50"
                  placeholder="Juan García"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Email *</label>
                <input
                  type="email"
                  required
                  disabled={!!editingId}
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full bg-white/[.05] border border-white/[.08] rounded-lg px-4 py-2 text-white focus:outline-none focus:border-violet-500/50 disabled:opacity-50"
                  placeholder="usuario@email.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Rol</label>
                <select
                  value={formData.rol}
                  onChange={(e) => setFormData({ ...formData, rol: e.target.value as any })}
                  className="w-full bg-white/[.05] border border-white/[.08] rounded-lg px-4 py-2 text-white focus:outline-none focus:border-violet-500/50"
                >
                  <option value="admin">Admin</option>
                  <option value="agent">Agent</option>
                  <option value="viewer">Viewer</option>
                </select>
              </div>

              <div className="flex gap-3">
                <button
                  type="submit"
                  className="px-6 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 transition-colors font-semibold"
                >
                  {editingId ? "Actualizar" : "Crear"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setEditingId(null);
                    setFormData({ email: "", nombre: "", rol: "agent" });
                  }}
                  className="px-6 py-2 rounded-lg border border-white/[.08] hover:bg-white/[.05] transition-colors font-semibold"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Tabla de Usuarios */}
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Loader className="w-8 h-8 animate-spin text-violet-400" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/[.08] bg-white/[.02]">
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase">Nombre</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase">Email</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase">Rol</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-8 text-center text-gray-500">
                      No hay usuarios
                    </td>
                  </tr>
                ) : (
                  users.map((u) => (
                    <tr key={u.id} className="border-b border-white/[.08] hover:bg-white/[.02]">
                      <td className="px-6 py-4 text-sm text-white font-medium">{u.nombre}</td>
                      <td className="px-6 py-4 text-sm text-gray-400">{u.email}</td>
                      <td className="px-6 py-4 text-sm">
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                          u.rol === 'admin' ? 'bg-red-500/20 text-red-400' :
                          u.rol === 'agent' ? 'bg-blue-500/20 text-blue-400' :
                          'bg-gray-500/20 text-gray-400'
                        }`}>
                          {u.rol}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm flex gap-2">
                        <button
                          onClick={() => handleEdit(u)}
                          className="p-2 hover:bg-blue-500/10 text-blue-400 rounded transition-colors"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(u.id)}
                          className="p-2 hover:bg-red-500/10 text-red-400 rounded transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
