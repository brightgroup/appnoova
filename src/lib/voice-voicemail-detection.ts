/** Detecta frases típicas de buzón/contestadora en transcripciones de voz. */
const VOICEMAIL_PATTERNS: RegExp[] = [
  /\bdeje (su |un )?mensaje\b/i,
  /\bdespues del tono\b/i,
  /\bdespu[eé]s del tono\b/i,
  /\b(al|despu[eé]s del) (tono|pitido|se[ñn]al)\b/i,
  /\bno (se encuentra|est[aá]) disponible\b/i,
  /\bno puede atender\b/i,
  /\bfavor dejar (su |un )?mensaje\b/i,
  /\bpor favor deje\b/i,
  /\bcontestador(a)?\b/i,
  /\bdeja(r)? (su |tu |un )?mensaje\b/i,
  /\bservicio de contestador\b/i,
  /\bgrabadora\b/i,
  /\bbuz[oó]n\b/i,
  /\bbuz[oó]n de mensajes\b/i,
  /\bbuz[oó]n.*lleno\b/i,
  /\bcorreo de voz\b/i,
  /\bmailbox\b/i,
  /\bleave a message\b/i,
  /\bnot available\b/i,
  /\breturn your call\b/i,
  /\bmarque la tecla\b/i,
  /\bpulse (la tecla|el)\b/i,
  /\bgrabe su (nombre|mensaje)\b/i,
  /\bha llamado al\b/i,
  /\bse comunic[oó] con\b/i,
  /\bllamada ha sido transferida\b/i,
  /\bno contesta\b/i,
  /\bresponda cuando suene\b/i,
];

const VOICEMAIL_GREETING_ONLY =
  /^(bienvenido|welcome|hello,? (this is|you have reached)|you have reached)[!.?\s]*$/i;

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

export function isVoicemailUtterance(text: string): boolean {
  const normalized = normalize(text);
  if (!normalized || normalized.length < 8) return false;
  if (VOICEMAIL_GREETING_ONLY.test(normalized)) return false;
  return VOICEMAIL_PATTERNS.some(p => p.test(normalized));
}

export function transcriptIndicatesVoicemail(
  transcript: Array<{ role: string; text: string }>,
  summary?: string | null
): boolean {
  if (summary?.trim() && isVoicemailUtterance(summary)) return true;
  for (const line of transcript) {
    if (line.role === "user" && isVoicemailUtterance(line.text)) return true;
  }
  return false;
}

/** Usuario habló en vivo (no solo mensaje de buzón/contestadora). */
export function userHadLiveConversation(
  transcript: Array<{ role: string; text: string }>
): boolean {
  for (const line of transcript) {
    if (line.role !== "user") continue;
    const text = line.text.trim();
    if (text.length < 3) continue;
    if (isVoicemailUtterance(text)) continue;
    return true;
  }
  return false;
}
