export interface PlatformHelpArticle {
  id: string;
  title: string;
  keywords: string[];
  route?: string;
  body: string;
}

/** Guías básicas de Noova 360 para ORI (Fase 1). */
export const PLATFORM_HELP_ARTICLES: PlatformHelpArticle[] = [
  {
    id: "crear-agente-voz",
    title: "Crear un agente de voz",
    keywords: ["agente", "voz", "crear", "nuevo", "llamada", "telefono", "teléfono", "wizard"],
    route: "/dashboard/agentes-voz",
    body: `1. Ve a **Agentes de voz** en el menú lateral.
2. Clic en **Nuevo agente** (wizard de 3 pasos).
3. Elige plantilla (calificación, recordatorios, seguimiento, etc.), nombre e idioma.
4. Asocia un **contexto de empresa** con productos y tono de la marca.
5. Revisa el prompt generado y crea el agente.
6. En **Configuración → Probar** puedes probar por web o teléfono.
7. Asigna un número en **Canales → Teléfono**.`,
  },
  {
    id: "registros-llamadas",
    title: "Ver registros de llamadas",
    keywords: ["llamadas", "registro", "historial", "grabacion", "grabación", "transcripcion", "transcripción", "voz"],
    route: "/dashboard/agentes-voz/configuracion",
    body: `1. Abre **Agentes de voz** y entra al agente.
2. Pestaña **Registro** — lista de llamadas con fecha, duración y estado.
3. Abre una fila para ver transcripción y detalles.
4. Las pruebas desde el dashboard también quedan registradas.`,
  },
  {
    id: "historial-chats",
    title: "Historial de chats (WhatsApp e inbox)",
    keywords: ["chat", "chats", "inbox", "whatsapp", "conversacion", "conversación", "mensajes", "historial"],
    route: "/dashboard/inbox",
    body: `1. Ve a **Inbox** en el menú lateral.
2. Lista de conversaciones por canal (WhatsApp, widget, Mi Link, etc.).
3. Clic en una conversación para ver el hilo completo.
4. Puedes cambiar a modo humano (handoff) si un asesor debe responder.`,
  },
  {
    id: "crear-agente-texto",
    title: "Crear un agente de texto",
    keywords: ["agente", "texto", "whatsapp", "widget", "chat", "crear"],
    route: "/dashboard/agentes-texto",
    body: `1. **Agentes de texto** → **Nuevo agente**.
2. Elige propósito, nombre y contexto de empresa.
3. Conecta canales en **Canales** (WhatsApp, widget web, Mi Link).
4. Prueba desde el dashboard antes de publicar.`,
  },
  {
    id: "contextos-empresa",
    title: "Contextos de empresa",
    keywords: ["contexto", "empresa", "marca", "productos", "ori", "conocimiento"],
    route: "/dashboard/contextos",
    body: `1. **Contextos** en el menú — crea o edita fichas de marca.
2. Incluye productos, servicios, tono y datos clave (sin inventar precios).
3. Marca uno como **predeterminado**.
4. En **ORI** selecciona el contexto en el encabezado del chat.
5. Los agentes de voz/texto también pueden vincular un contexto.`,
  },
  {
    id: "facturacion",
    title: "Facturación y créditos",
    keywords: ["facturacion", "facturación", "creditos", "créditos", "plan", "consumo", "factura"],
    route: "/dashboard/facturacion",
    body: `1. **Facturación** — pestaña **Resumen**: créditos disponibles y consumo.
2. **Uso detallado** — desglose por canal (voz, WhatsApp, ORI, etc.).
3. **Planes** — plan actual y opciones.
4. 1 crédito ≈ $1 COP en consumo unificado.`,
  },
  {
    id: "crm-contactos",
    title: "CRM y contactos",
    keywords: ["crm", "contacto", "contactos", "lead", "cotizacion", "cotización", "ficha"],
    route: "/dashboard/crm/contactos",
    body: `1. **CRM → Contactos** — fichas de clientes y prospectos.
2. Desde la ficha: cotización con ORI, captura IA de datos, documentos.
3. Pipeline de leads en el tablero Kanban.`,
  },
  {
    id: "ori-uso",
    title: "Usar ORI",
    keywords: ["ori", "copiloto", "asistente", "ayuda"],
    route: "/dashboard/ori",
    body: `ORI es el copiloto de Noova 360. Puede:
- Redactar cotizaciones, correos y mensajes comerciales según tu contexto de empresa.
- Ayudar a mejorar prompts de agentes.
- Responder dudas básicas sobre cómo usar la plataforma.
Selecciona el contexto de empresa en el selector superior antes de chatear.`,
  },
];
