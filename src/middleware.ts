import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Rutas públicas — no requieren autenticación
  const publicPaths = ["/", "/login", "/signup", "/auth"];
  const isPublic = publicPaths.some(p =>
    pathname === p || pathname.startsWith(p + "/")
  );
  if (isPublic) return NextResponse.next();

  // Leer el token de la cookie de Supabase
  const cookieHeader = request.headers.get("cookie") || "";
  const tokenMatch = cookieHeader.match(/sb-[^-]+-auth-token=([^;]+)/);
  const rawToken = tokenMatch ? decodeURIComponent(tokenMatch[1]) : null;

  let accessToken: string | null = null;
  if (rawToken) {
    try {
      const parsed = JSON.parse(rawToken);
      accessToken = Array.isArray(parsed) ? parsed[0] : parsed?.access_token ?? null;
    } catch {
      accessToken = rawToken;
    }
  }

  // Sin sesión → login
  if (!accessToken) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Verificar rol si la ruta es /admin
  if (pathname.startsWith("/admin")) {
    try {
      const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      const { data: { user } } = await supabase.auth.getUser(accessToken);

      if (!user) {
        return NextResponse.redirect(new URL("/login", request.url));
      }

      // Consultar el rol en public.users
      const { data: profile } = await supabase
        .from("users")
        .select("rol")
        .eq("id", user.id)
        .single();

      if (!profile || profile.rol !== "admin") {
        // Usuario sin rol admin → redirigir al dashboard de cliente
        return NextResponse.redirect(new URL("/dashboard", request.url));
      }
    } catch {
      return NextResponse.redirect(new URL("/login", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|logo-noova.png|api/).*)",
  ],
};
