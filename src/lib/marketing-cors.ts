import { NextRequest, NextResponse } from "next/server";

/** Orígenes del sitio marketing (noova360.com) que pueden llamar APIs públicas de app. */
export function getMarketingOrigins(): string[] {
  const raw = process.env.MARKETING_ORIGINS?.trim();
  if (raw) {
    return raw
      .split(",")
      .map(s => s.trim().replace(/\/$/, ""))
      .filter(Boolean);
  }
  return [
    "https://noova360.com",
    "https://www.noova360.com",
    "http://localhost:3000",
    "http://localhost:3001",
  ];
}

export function corsHeadersFor(req: NextRequest): HeadersInit {
  const origin = req.headers.get("origin")?.replace(/\/$/, "") ?? "";
  const allowed = getMarketingOrigins();
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };
  if (origin && allowed.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Vary"] = "Origin";
  }
  return headers;
}

export function withCors(req: NextRequest, res: NextResponse): NextResponse {
  const cors = corsHeadersFor(req);
  for (const [k, v] of Object.entries(cors)) {
    res.headers.set(k, v);
  }
  return res;
}

export function corsPreflight(req: NextRequest): NextResponse {
  return withCors(req, new NextResponse(null, { status: 204 }));
}
