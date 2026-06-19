import { normalizeText } from "@/lib/data-tables/search-rows";
import { PLATFORM_HELP_ARTICLES, type PlatformHelpArticle } from "@/lib/platform-help/articles";

const MAX_ARTICLES = 4;

function tokenize(text: string): string[] {
  return normalizeText(text)
    .split(/[^a-z0-9áéíóúñ]+/i)
    .filter(t => t.length >= 3);
}

function scoreArticle(article: PlatformHelpArticle, tokens: string[]): number {
  if (!tokens.length) return 0;
  let score = 0;
  const titleNorm = normalizeText(article.title);
  const keywordSet = new Set(article.keywords.map(k => normalizeText(k)));

  tokens.forEach(token => {
    if (keywordSet.has(token)) score += 4;
    article.keywords.forEach(kw => {
      const kn = normalizeText(kw);
      if (kn.includes(token) || token.includes(kn)) score += 2;
    });
    if (titleNorm.includes(token)) score += 3;
    if (article.id.includes(token)) score += 2;
  });

  return score;
}

/** Devuelve guías de plataforma relevantes para el mensaje del usuario. */
export function retrievePlatformHelp(userMessage: string): PlatformHelpArticle[] {
  const tokens = tokenize(userMessage);
  if (!tokens.length) return [];

  const scored = PLATFORM_HELP_ARTICLES.map(article => ({
    article,
    score: scoreArticle(article, tokens),
  }))
    .filter(row => row.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, MAX_ARTICLES).map(row => row.article);
}

export function formatPlatformHelpContext(articles: PlatformHelpArticle[]): string {
  if (!articles.length) return "";

  const blocks = articles.map(a => {
    const link = a.route ? `\nRuta: ${a.route}` : "";
    return `### ${a.title}${link}\n${a.body}`;
  });

  return `# Guía de Noova 360 (solo para preguntas sobre la plataforma)

${blocks.join("\n\n")}

Usa estas rutas exactas cuando expliques pasos. Si la pregunta no está cubierta, dilo con honestidad.`;
}

/** Detecta si el usuario probablemente pregunta sobre la plataforma. */
export function messageLooksLikePlatformQuestion(text: string): boolean {
  const n = normalizeText(text);
  const hints = [
    "como", "cómo", "donde", "dónde", "noova", "plataforma", "dashboard", "menu", "menú",
    "agente", "agentes", "llamada", "llamadas", "inbox", "facturacion", "facturación",
    "creditos", "créditos", "contexto", "crm", "configurar", "crear", "ver", "historial",
  ];
  return hints.some(h => n.includes(normalizeText(h)));
}
