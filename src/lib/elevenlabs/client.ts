import {
  ELEVENLABS_API_BASE,
  requireElevenLabsApiKey,
} from "@/lib/elevenlabs/config";

export class ElevenLabsApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: unknown
  ) {
    super(message);
    this.name = "ElevenLabsApiError";
  }
}

export async function elevenLabsFetch<T>(
  path: string,
  init?: RequestInit & { json?: unknown }
): Promise<T> {
  const apiKey = requireElevenLabsApiKey();
  const headers: Record<string, string> = {
    "xi-api-key": apiKey,
    Accept: "application/json",
  };

  let body: string | undefined;
  if (init?.json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(init.json);
  }

  const res = await fetch(`${ELEVENLABS_API_BASE}${path}`, {
    ...init,
    headers: { ...headers, ...(init?.headers as Record<string, string> | undefined) },
    body: body ?? init?.body,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail =
      (data as { detail?: { message?: string } | string })?.detail;
    const msg =
      typeof detail === "string"
        ? detail
        : detail && typeof detail === "object" && "message" in detail
          ? String(detail.message)
          : (data as { message?: string })?.message || `ElevenLabs ${path} (${res.status})`;
    throw new ElevenLabsApiError(msg, res.status, data);
  }

  return data as T;
}
