import { GoogleGenAI } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";
import { fetchWebsiteText } from "@/lib/fetch-website-text";
import { getOriApiKey, getOriModel } from "@/lib/google-ai";
import { getUserIdFromRequest } from "@/lib/voice-agents-server";

const SUMMARY_PROMPT = `Eres un experto en corretaje de seguros en Colombia. Lee el sitio web y genera UN SOLO documento de contexto listo para copiar y pegar en un agente de IA (voz o texto).

IMPORTANTE: No escribas un informe genérico ni secciones tipo "Identidad y posicionamiento". Debes seguir EXACTAMENTE el formato de plantilla abajo, reemplazando el contenido con datos reales del sitio.

FORMATO OBLIGATORIO (respeta títulos, negritas **, viñetas; NO incluyas título principal ni encabezado introductorio):

**Resumen de la empresa:**
[Párrafo de 3-5 oraciones: qué es la empresa, sector, a quién atiende (B2C/B2B), cobertura geográfica, canales de contacto principales. Tono profesional y claro.]

**Productos / Servicios:**
- **[Nombre del producto/línea]:** [Descripción concreta de qué cubre y para quién es, 1-2 oraciones.]
- [Repite por CADA producto o línea de seguro mencionada en el sitio. Mínimo 3 ítems si hay información.]

**Casos de uso del cliente:**
- **[Sector o perfil]:** [Escenario realista de cómo un cliente usaría el seguro, 1-2 oraciones.]
- [Mínimo 3 casos de uso distintos inferidos del portafolio del sitio.]

**Propuesta de valor:**
- **[Beneficio clave]:** [Explicación breve del valor para el cliente.]
- [Mínimo 3 puntos de valor.]

**Diferenciadores clave:**
- [Bullet points con ventajas competitivas concretas del sitio: especialización, atención, canales, etc. Mínimo 3.]

**Voz y tono:**
El agente debe comunicarse de forma **[adjetivo], [adjetivo] y [adjetivo]**, [instrucción de estilo en 2-3 oraciones: lenguaje, empatía, tecnicismos, confianza].

**Frases importantes y branding:**
- "[Frase textual o parafraseada del sitio si existe]"
- [Mínimo 2-3 frases de marca, slogans o mensajes comerciales del sitio o inferidos con cuidado.]

**Puntos de prueba y confianza:**
- [Teléfonos, WhatsApp, emails, sedes, horarios, equipo especializado — solo datos que aparezcan en el sitio. Mínimo 2-3 puntos.]

REGLAS:
- Español colombiano. Texto final listo para usar, sin introducciones, sin título "Voice Agent Context" ni encabezado inicial.
- No inventes teléfonos, emails, precios ni coberturas que no estén en la fuente.
- Si falta un dato, omite ese bullet o escribe solo lo verificable.
- Sé detallado y específico: 600-900 palabras en total.
- Usa **negritas** en títulos de sección y nombres de productos como en la plantilla.`;

export async function POST(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const apiKey = getOriApiKey();
  if (!apiKey) {
    return NextResponse.json(
      { error: "Falta ORI_GOOGLE_AI_KEY en .env.local para generar contexto con IA." },
      { status: 500 }
    );
  }

  const body = await req.json();
  const websiteUrl = String(body.url ?? body.website_url ?? "").trim();
  if (!websiteUrl) {
    return NextResponse.json({ error: "URL requerida" }, { status: 400 });
  }

  try {
    const { url, text, title } = await fetchWebsiteText(websiteUrl);

    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: getOriModel(),
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `${SUMMARY_PROMPT}\n\n---\nFUENTE\nURL: ${url}\n\n${text}`
            }
          ]
        }
      ],
      config: {
        temperature: 0.35,
        maxOutputTokens: 4096
      }
    });

    const summary = response.text?.trim();
    if (!summary) {
      return NextResponse.json({ error: "La IA no generó un resumen" }, { status: 502 });
    }

    const suggestedName =
      title.split(/[|\-–—]/)[0]?.trim().slice(0, 80) ||
      new URL(url).hostname.replace(/^www\./, "");

    return NextResponse.json({
      content: summary,
      website_url: url,
      suggested_name: suggestedName,
      source_title: title
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error al procesar la URL";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
