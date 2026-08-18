/**
 * Corta un texto en varios mensajes de WhatsApp cuando excede el límite de un
 * solo envío. Twilio rechaza (error 21617) cualquier cuerpo mayor a 1.600
 * caracteres; Meta Cloud API permite hasta 4.096, así que 1.500 es un margen
 * seguro para los dos proveedores sin acercarse al límite real de ninguno.
 *
 * Antes esto no existía: una respuesta larga de la IA se generaba bien pero
 * Twilio la rechazaba en silencio al enviarla — el cliente nunca la recibía y
 * nada en el sistema lo detectaba (conversación de Customext/Laura,
 * 15-ago-2026, respuesta de 2.611 caracteres sobre el proceso de importación).
 */
export const WHATSAPP_MESSAGE_MAX_LENGTH = 1500;

function splitLongParagraph(paragraph: string, maxLen: number): string[] {
  const pieces: string[] = [];
  for (const line of paragraph.split("\n")) {
    if (line.length <= maxLen) {
      pieces.push(line);
      continue;
    }
    // Línea individual más larga que el límite (raro sin saltos de línea):
    // se parte por palabras para no cortar a mitad de una.
    let rest = line;
    while (rest.length > maxLen) {
      let cut = rest.lastIndexOf(" ", maxLen);
      if (cut <= 0) cut = maxLen;
      pieces.push(rest.slice(0, cut).trim());
      rest = rest.slice(cut).trim();
    }
    if (rest) pieces.push(rest);
  }
  return pieces;
}

export function splitWhatsAppMessage(
  text: string,
  maxLen: number = WHATSAPP_MESSAGE_MAX_LENGTH
): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.length <= maxLen) return [trimmed];

  const chunks: string[] = [];
  let current = "";

  const flush = () => {
    if (current.trim()) chunks.push(current.trim());
    current = "";
  };

  for (const paragraph of trimmed.split(/\n{2,}/)) {
    const candidate = current ? `${current}\n\n${paragraph}` : paragraph;
    if (candidate.length <= maxLen) {
      current = candidate;
      continue;
    }

    flush();

    if (paragraph.length <= maxLen) {
      current = paragraph;
      continue;
    }

    // El párrafo por sí solo supera el límite: se parte por líneas (y, si hace
    // falta, por palabras dentro de una línea).
    for (const piece of splitLongParagraph(paragraph, maxLen)) {
      const withPiece = current ? `${current}\n${piece}` : piece;
      if (withPiece.length <= maxLen) {
        current = withPiece;
      } else {
        flush();
        current = piece;
      }
    }
  }
  flush();

  return chunks;
}
