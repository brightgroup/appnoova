"use client";

import { useAuth } from "@/hooks/useAuth";

export default function AdminUsers() {
  const { logout } = useAuth();

  return (
    <div style={{ padding: "2rem" }}>
      <h1>Gestión de Usuarios</h1>
      <p>Próximamente...</p>
      <button onClick={logout}>Logout</button>
    </div>
  );
}
