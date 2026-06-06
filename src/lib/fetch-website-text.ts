const MAX_BYTES = 500_000;
const MAX_TEXT = 14_000;
const FETCH_TIMEOUT_MS = 12_000;

/** Valida URL pública (http/https) y bloquea hosts locales/privados. */
export function parsePublicWebsiteUrl(raw: string): URL {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error("URL vacía");

  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new Error("URL inválida");
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Solo se permiten URLs http o https");
  }

  const host = url.hostname.toLowerCase();
  const blocked =
    host === "localhost" ||
    host.endsWith(".local") ||
    host === "127.0.0.1" ||
    host.startsWith("10.") ||
    host.startsWith("192.168.") ||
    host.startsWith("172.16.") ||
    host === "0.0.0.0" ||
    host === "[::1]";

  if (blocked) {
    throw new Error("URL no permitida");
  }

  return url;
}

function extractMeta(html: string, attr: string, value: string): string {
  const re = new RegExp(
    `<meta[^>]+${attr}=["']${value}["'][^>]+content=["']([^"']+)["']|` +
      `<meta[^>]+content=["']([^"']+)["'][^>]+${attr}=["']${value}["']`,
    "i"
  );
  const m = html.match(re);
  return (m?.[1] || m?.[2] || "").replace(/\s+/g, " ").trim();
}

function extractHeadings(html: string): string[] {
  const headings: string[] = [];
  const re = /<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null && headings.length < 24) {
    const t = m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (t.length > 2 && t.length < 120) headings.push(t);
  }
  return headings;
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_TEXT);
}

/** Descarga una URL y extrae texto visible para alimentar a la IA. */
export async function fetchWebsiteText(rawUrl: string): Promise<{
  url: string;
  text: string;
  title: string;
  meta: string;
}> {
  const url = parsePublicWebsiteUrl(rawUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      signal: controller.signal,
      headers: {
        "User-Agent": "Noova360-ContextBot/1.0 (+https://noova360.com)",
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8"
      },
      redirect: "follow"
    });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    throw new Error(`No se pudo leer la página (${res.status})`);
  }

  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html") && !contentType.includes("text/plain")) {
    throw new Error("La URL no devolvió una página HTML legible");
  }

  const buf = await res.arrayBuffer();
  if (buf.byteLength > MAX_BYTES) {
    throw new Error("La página es demasiado grande");
  }

  const html = new TextDecoder("utf-8", { fatal: false }).decode(buf);
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch?.[1]?.replace(/\s+/g, " ").trim() ?? "";
  const description = extractMeta(html, "name", "description") || extractMeta(html, "property", "og:description");
  const headings = extractHeadings(html);
  const bodyText = htmlToText(html);

  const parts = [
    title && `TÍTULO: ${title}`,
    description && `DESCRIPCIÓN: ${description}`,
    headings.length && `ENCABEZADOS CLAVE:\n${headings.map(h => `- ${h}`).join("\n")}`,
    `CONTENIDO DE LA PÁGINA:\n${bodyText}`
  ].filter(Boolean);

  const text = parts.join("\n\n");
  if (bodyText.length < 80) {
    throw new Error("No se extrajo suficiente texto de la página. Prueba otra URL o escribe el contexto manualmente.");
  }

  const meta = [description, headings.join(" · ")].filter(Boolean).join(" | ");

  return { url: url.toString(), text, title, meta };
}
