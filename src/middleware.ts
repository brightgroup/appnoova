import { NextRequest, NextResponse } from "next/server";

// El middleware no verifica sesión porque @supabase/supabase-js
// guarda la sesión en localStorage (cliente). La protección de rutas
// se maneja en los layouts de cada sección (dashboard/layout.tsx, admin/layout.tsx).
export function middleware(_request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|logo-noova.png).*)"],
};
