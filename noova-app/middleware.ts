import { type NextRequest, NextResponse } from 'next/server'
import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs'

export async function middleware(request: NextRequest) {
  const { supabase, response } = createMiddlewareClient(request)
  const { data: { session } } = await supabase.auth.getSession()

  // Rutas protegidas que necesitan autenticación
  if (request.nextUrl.pathname.startsWith('/dashboard') ||
      request.nextUrl.pathname.startsWith('/admin')) {
    
    if (!session) {
      return NextResponse.redirect(new URL('/login', request.url))
    }
  }

  // Si estás logueado y vas a login/signup, redirige a dashboard
  if ((request.nextUrl.pathname === '/login' || 
       request.nextUrl.pathname === '/signup') && session) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return response
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/admin/:path*',
    '/login',
    '/signup',
  ]
}
