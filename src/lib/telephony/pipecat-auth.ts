import { NextRequest } from "next/server";

export function getPipecatInternalSecret(): string | null {
  return process.env.PIPECAT_INTERNAL_SECRET?.trim() || null;
}

export function isPipecatInternalRequest(req: NextRequest): boolean {
  const secret = getPipecatInternalSecret();
  if (!secret) return false;

  const auth = req.headers.get("authorization")?.trim() ?? "";
  if (auth === `Bearer ${secret}`) return true;

  const header = req.headers.get("x-pipecat-secret")?.trim() ?? "";
  return header === secret;
}
