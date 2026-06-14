import { NextRequest, NextResponse } from "next/server";

const LINK_HOSTS = new Set([
  "link.noova360.com",
  "link.localhost"
]);

const MICROSITE_PATH = (process.env.NEXT_PUBLIC_MICROSITE_PATH || "/c").replace(/\/$/, "") || "/c";

function requestHostname(request: NextRequest): string {
  // server.ts no pasa el host en nextUrl; usar Host / X-Forwarded-Host.
  const fromHeader =
    request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ||
    request.headers.get("host")?.split(":")[0]?.trim();
  return (fromHeader || request.nextUrl.hostname).toLowerCase();
}

function isLinkHost(hostname: string): boolean {
  const host = hostname.split(":")[0].toLowerCase();
  if (LINK_HOSTS.has(host)) return true;
  if (host.startsWith("link.")) return true;
  const envHost = process.env.MICROSITE_LINK_HOST?.split(":")[0]?.toLowerCase();
  return Boolean(envHost && host === envHost);
}

export function middleware(request: NextRequest) {
  const hostname = requestHostname(request);
  const { pathname } = request.nextUrl;

  if (pathname === "/admin/whatsapp/plantillas" || pathname.startsWith("/admin/whatsapp/plantillas/")) {
    const appBase = process.env.NEXT_PUBLIC_APP_URL || "https://app.noova360.com";
    return NextResponse.redirect(new URL("/admin/whatsapp?tab=aprobaciones", appBase));
  }

  if (!isLinkHost(hostname)) {
    return NextResponse.next();
  }

  if (
    pathname.startsWith("/api") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/admin") ||
    pathname === "/favicon.ico" ||
    pathname === "/logo-noova.png" ||
    pathname === "/noova-widget.js"
  ) {
    if (pathname.startsWith("/dashboard") || pathname.startsWith("/admin")) {
      const appBase = process.env.NEXT_PUBLIC_APP_URL || "https://app.noova360.com";
      return NextResponse.redirect(new URL(pathname + request.nextUrl.search, appBase));
    }
    return NextResponse.next();
  }

  if (pathname === "/" || pathname === "") {
    const rewriteUrl = request.nextUrl.clone();
    rewriteUrl.pathname = "/link";
    return NextResponse.rewrite(rewriteUrl);
  }

  const slug = pathname.replace(/^\//, "").split("/")[0];
  if (!slug) {
    return NextResponse.next();
  }

  const rewriteUrl = request.nextUrl.clone();
  rewriteUrl.pathname = `${MICROSITE_PATH}/${slug}`;
  return NextResponse.rewrite(rewriteUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|logo-noova.png|noova-widget.js).*)"],
};
