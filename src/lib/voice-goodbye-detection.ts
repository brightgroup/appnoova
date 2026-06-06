/** Detecta despedidas en español (colombiano) en transcripciones de voz. */
const GOODBYE_PATTERNS: RegExp[] = [
  /\badi[oó]s\b/i,
  /\bhasta luego\b/i,
  /\bhasta pronto\b/i,
  /\bhasta la pr[oó]xima\b/i,
  /\bnos vemos\b/i,
  /\b(chao|chau)\b/i,
  /\bfue un gusto\b/i,
  /\bgracias por (llamar|contactarnos|contactar|comunicarte|su llamada|llamarnos)\b/i,
  /\bque tengas (un )?(buen|excelente|lindo|hermoso) (d[ií]a|tarde|noche)\b/i,
  /\bque le vaya bien\b/i,
  /\bque est[eé]s bien\b/i,
  /\bme despido\b/i,
  /\bterminamos (la )?llamada\b/i,
  /\b(cierro|cerramos) (la )?llamada\b/i,
  /\bbye\b/i,
  /\bgood\s?bye\b/i,
  /\bhasta (m[aá]s )?tarde\b/i
];

const GREETING_ONLY =
  /^(hola|buenos d[ií]as|buenas tardes|buenas noches|bienvenido)[!.?\s]*$/i;

export function isGoodbyeUtterance(text: string): boolean {
  const normalized = text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();

  if (normalized.length < 5) return false;
  if (GREETING_ONLY.test(normalized)) return false;

  return GOODBYE_PATTERNS.some(p => p.test(normalized));
}
