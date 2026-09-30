/**
 * Contenido de las políticas legales públicas de Noova 360.
 *
 * Fuente única para las páginas web (/privacy, /tratamiento-datos, /terminos,
 * /reembolsos) y para las versiones en Word con membrete. Solo datos: sin
 * imports, para poder leerlo también desde scripts de Node.
 *
 * Marcado en los textos: **negrita** y [texto](url).
 */

export type LegalBlock =
  | { p: string }
  | { ul: string[] }
  | { note: { title: string; text: string } };

export interface LegalSection {
  title: string;
  blocks: LegalBlock[];
}

export interface LegalDocument {
  slug: string;
  title: string;
  /** Título en la web; bilingüe donde la revisión de dominio de Paddle lo exige. */
  webTitle?: string;
  metaTitle: string;
  metaDescription: string;
  updated: string;
  effective: string;
  intro: string;
  sections: LegalSection[];
  footerNote?: string;
}

export const LEGAL_ENTITY = {
  name: "DOMAL SAS",
  nit: "901.356.627-4",
  brand: "Noova 360",
  address: "Calle 81 No. 114-50, Bogotá D.C., Colombia",
  email: "info@bgsoluciones.com.co",
  phone: "+57 315 250 1481",
  web: "https://app.noova360.com",
  officer: "John García, CEO"
} as const;

const E = LEGAL_ENTITY;
const MAIL = `[${E.email}](mailto:${E.email})`;
const UPDATED = "30 de septiembre de 2026";

const CONTACT_LIST = [
  `**Responsable:** ${E.name}, NIT ${E.nit} (marca comercial ${E.brand})`,
  `**Domicilio:** ${E.address}`,
  `**Correo:** ${MAIL}`,
  `**Teléfono:** ${E.phone}`,
  `**Sitio web:** [app.noova360.com](${E.web})`
];

// ─── Política de Tratamiento de Datos Personales (Ley 1581) ────────────────
const TRATAMIENTO: LegalDocument = {
  slug: "tratamiento-datos",
  title: "Política de Tratamiento de Datos Personales",
  metaTitle: "Política de Tratamiento de Datos Personales – Noova 360",
  metaDescription:
    "Política de Tratamiento de Datos Personales de DOMAL SAS (Noova 360) conforme a la Ley 1581 de 2012 y el Decreto 1377 de 2013: finalidades, derechos de los titulares y procedimiento de consultas y reclamos.",
  updated: UPDATED,
  effective: UPDATED,
  intro:
    "DOMAL SAS, en cumplimiento de la Ley Estatutaria 1581 de 2012, el Decreto 1377 de 2013 (compilado en el Decreto Único 1074 de 2015) y demás normas concordantes, adopta la presente política para el tratamiento de los datos personales que recolecta, almacena, usa, circula o suprime en desarrollo de su objeto social y de la operación de la plataforma Noova 360.",
  sections: [
    {
      title: "Identificación del Responsable",
      blocks: [{ ul: CONTACT_LIST }, { p: `**Área encargada de la atención de titulares:** Oficial de Protección de Datos (${E.officer}).` }]
    },
    {
      title: "Ámbito de aplicación y definiciones",
      blocks: [
        { p: "Esta política aplica a todas las bases de datos y archivos que contengan datos personales tratados por DOMAL SAS, en su calidad de **Responsable** o de **Encargado** del tratamiento." },
        {
          ul: [
            "**Titular:** persona natural cuyos datos personales son objeto de tratamiento.",
            "**Responsable del tratamiento:** quien decide sobre la base de datos y el tratamiento.",
            "**Encargado del tratamiento:** quien realiza el tratamiento por cuenta del Responsable.",
            "**Autorización:** consentimiento previo, expreso e informado del titular.",
            "**Dato sensible:** el que afecta la intimidad del titular o cuyo uso indebido puede generar discriminación, como los datos relativos a la salud.",
            "**Transmisión:** comunicación de datos a un Encargado, dentro o fuera de Colombia, para que realice un tratamiento por cuenta del Responsable."
          ]
        }
      ]
    },
    {
      title: "Calidad en la que actúa DOMAL SAS",
      blocks: [
        { p: "**Como Responsable:** respecto de los datos de sus clientes, de los usuarios de la plataforma, de prospectos comerciales, proveedores, colaboradores y visitantes de sus sitios web." },
        { p: "**Como Encargado:** respecto de los datos que sus clientes (empresas) cargan o gestionan en Noova 360 —sus contactos, prospectos, usuarios finales, asegurados, beneficiarios y conversaciones—. En ese caso el cliente es el Responsable, define las finalidades y debe contar con la autorización de los titulares; DOMAL SAS trata esos datos solo por cuenta del cliente, conforme a sus instrucciones y al contrato de servicio." }
      ]
    },
    {
      title: "Datos que tratamos",
      blocks: [
        {
          ul: [
            "**Clientes y usuarios de la plataforma:** nombre, correo, teléfono, cargo, empresa, datos de acceso y de uso.",
            "**Datos fiscales y de facturación:** tipo y número de documento o NIT, dígito de verificación, razón social, dirección, ciudad, teléfono y correo de facturación.",
            "**Usuarios finales de nuestros clientes:** número de teléfono, nombre de perfil, identificadores de Messenger o Instagram, contenido de mensajes y archivos adjuntos, y grabaciones, transcripciones y resúmenes de llamadas.",
            "**Datos de CRM y del módulo de seguros:** documento de identidad, fecha de nacimiento, datos de contacto, placa y datos del vehículo, pólizas, beneficiarios y siniestros.",
            "**Datos técnicos:** dirección IP, dispositivo, registros de acceso y de uso."
          ]
        },
        { note: { title: "Datos sensibles", text: "En el módulo de seguros, algunos productos (por ejemplo, seguros de vida) requieren información de salud o la condición de fumador. Su suministro es **facultativo**: el titular no está obligado a entregarla. El cliente, como Responsable, debe obtener autorización **expresa** y explícita para este tratamiento, informando su carácter sensible. DOMAL SAS no condiciona ninguna actividad al suministro de datos sensibles." } },
        { p: "Noova 360 está dirigido a empresas. No recolectamos intencionalmente datos de niños, niñas y adolescentes; cuando un cliente los trate, deberá respetar su interés superior y sus derechos prevalentes." }
      ]
    },
    {
      title: "Finalidades del tratamiento",
      blocks: [
        { p: "**Como Responsable, DOMAL SAS trata los datos para:**" },
        {
          ul: [
            "Prestar, mantener, soportar y mejorar la plataforma Noova 360 y sus funcionalidades.",
            "Crear y administrar cuentas, usuarios, permisos y organizaciones.",
            "Facturar, cobrar, procesar pagos y emitir factura electrónica.",
            "Enviar comunicaciones operativas, de seguridad, de facturación y de servicio.",
            "Enviar información comercial sobre nuestros servicios, cuando el titular lo haya autorizado; puede retirarse en cualquier momento.",
            "Atender solicitudes, peticiones, quejas y reclamos.",
            "Prevenir fraudes, proteger la seguridad de la plataforma y cumplir obligaciones legales, contables, tributarias y requerimientos de autoridades."
          ]
        },
        { p: "**Como Encargado, DOMAL SAS trata los datos exclusivamente para:** recibir, enviar y almacenar conversaciones; generar respuestas con inteligencia artificial en nombre del cliente; realizar y registrar llamadas; gestionar el CRM, campañas, citas, cotizaciones, pólizas y siniestros; y las demás funciones que el cliente active en la plataforma." },
        { p: "DOMAL SAS **no vende** datos personales, no los usa con fines publicitarios de terceros y no los utiliza para entrenar modelos de inteligencia artificial." }
      ]
    },
    {
      title: "Derechos de los titulares",
      blocks: [
        { p: "Conforme al artículo 8 de la Ley 1581 de 2012, el titular tiene derecho a:" },
        {
          ul: [
            "Conocer, actualizar y rectificar sus datos personales.",
            "Solicitar prueba de la autorización otorgada, salvo cuando no sea requerida por ley.",
            "Ser informado del uso que se ha dado a sus datos.",
            "Presentar quejas ante la Superintendencia de Industria y Comercio (SIC), una vez agotado el trámite de consulta o reclamo ante el Responsable.",
            "Revocar la autorización y/o solicitar la supresión de sus datos, cuando no exista un deber legal o contractual de conservarlos.",
            "Acceder en forma gratuita a sus datos personales."
          ]
        },
        { p: "Cuando los datos hayan sido cargados por un cliente de Noova 360, la solicitud debe dirigirse a ese cliente, como Responsable. Si llega a DOMAL SAS, la trasladaremos al cliente correspondiente y apoyaremos su atención." }
      ]
    },
    {
      title: "Procedimiento para consultas y reclamos",
      blocks: [
        { p: `**Canal:** correo ${MAIL}, con el asunto «Protección de datos». El titular, su causahabiente, representante o apoderado debe acreditar su identidad.` },
        { p: "**Consultas:** se atienden en un término máximo de **diez (10) días hábiles** desde su recibo. Si no es posible atenderlas en ese plazo, se informará el motivo y la nueva fecha, que no superará cinco (5) días hábiles adicionales." },
        { p: "**Reclamos** (corrección, actualización, supresión o incumplimiento): deben contener la identificación del titular, la descripción de los hechos, la dirección de notificación y los documentos que se quieran hacer valer. Si el reclamo está incompleto, se requerirá al interesado dentro de los cinco (5) días siguientes para que lo subsane; si pasan dos (2) meses sin respuesta, se entenderá desistido. El término máximo de atención es de **quince (15) días hábiles**, prorrogable por ocho (8) días hábiles más, informando el motivo." }
      ]
    },
    {
      title: "Transmisión y transferencia de datos",
      blocks: [
        { p: "Para prestar el servicio, DOMAL SAS transmite datos a proveedores que actúan como Encargados o subencargados, bajo contratos que les exigen confidencialidad y medidas de seguridad. Algunos se ubican en los Estados Unidos de América, país que la SIC reconoce con nivel adecuado de protección (Circular Externa 005 de 2017). La lista de subencargados se publica en nuestra [Política de Privacidad](/privacy)." }
      ]
    },
    {
      title: "Seguridad de la información",
      blocks: [
        { p: "DOMAL SAS aplica medidas técnicas, humanas y administrativas para proteger los datos contra adulteración, pérdida, consulta, uso o acceso no autorizado: cifrado en tránsito y en reposo, cifrado adicional de credenciales de integraciones, aislamiento entre clientes, control de acceso por roles, respaldos diarios y gestión de incidentes. Los incidentes que comprometan datos personales se notificarán a los afectados y a la SIC conforme a la ley." }
      ]
    },
    {
      title: "Conservación de los datos",
      blocks: [
        {
          ul: [
            "Los datos de la cuenta y los que el cliente gestiona en la plataforma se conservan mientras el contrato esté vigente.",
            "Las grabaciones de llamadas se conservan hasta **doce (12) meses** desde la llamada.",
            "A la terminación del contrato, el cliente dispone de **treinta (30) días** para exportar su información; luego se elimina de los sistemas productivos.",
            "Las copias de respaldo se eliminan automáticamente a los **noventa (90) días**.",
            "Los datos de facturación se conservan por el término que exigen las normas contables y tributarias."
          ]
        }
      ]
    },
    {
      title: "Vigencia y modificaciones",
      blocks: [
        { p: `Esta política rige desde el ${UPDATED}. Las bases de datos se conservarán mientras subsistan las finalidades descritas. Cualquier cambio sustancial se comunicará a los titulares por los canales habituales antes de su implementación.` }
      ]
    }
  ],
  footerNote: "Política adoptada conforme a la Ley 1581 de 2012 y el Decreto 1377 de 2013 (Decreto Único 1074 de 2015)."
};

// ─── Política de Privacidad ────────────────────────────────────────────────
const PRIVACIDAD: LegalDocument = {
  slug: "privacy",
  title: "Política de Privacidad",
  metaTitle: "Política de Privacidad – Noova 360",
  metaDescription:
    "Política de privacidad de Noova 360 (DOMAL SAS): datos que tratamos, WhatsApp Business Platform, Messenger, Instagram, Google Calendar, inteligencia artificial, voz, pagos, subencargados y derechos de los titulares.",
  updated: UPDATED,
  effective: "15 de junio de 2026",
  intro:
    "Noova 360 es una plataforma de automatización e inteligencia artificial para empresas. Esta política explica qué datos tratamos, para qué, con quién los compartimos y cómo los protegemos, tanto de nuestros clientes (las empresas que contratan el servicio) como de los usuarios finales con quienes esas empresas se comunican a través de WhatsApp, Messenger, Instagram, llamadas, chat web y otras integraciones. Complementa nuestra [Política de Tratamiento de Datos Personales](/tratamiento-datos).",
  sections: [
    {
      title: "Quiénes somos",
      blocks: [
        { p: `**Noova 360** es un software como servicio (SaaS) operado por **${E.name}**, NIT ${E.nit}, con domicilio en ${E.address}. Actuamos como proveedor de tecnología para el uso de la API de WhatsApp Business (WhatsApp Business Platform), y permitimos que nuestros clientes conecten su Página de Facebook y su cuenta profesional de Instagram para atender mensajes de Messenger e Instagram Direct mediante las APIs oficiales de Meta.` },
        { p: `Frente a los datos de los usuarios finales de nuestros clientes, **el cliente es el Responsable** del tratamiento y **DOMAL SAS actúa como Encargado**. Contacto: ${MAIL}.` }
      ]
    },
    {
      title: "Datos que recopilamos",
      blocks: [
        { p: "**De nuestros clientes (empresas):**" },
        {
          ul: [
            "Nombre, correo, teléfono y cargo del representante y de los usuarios de la cuenta.",
            "Razón social, NIT o documento, dirección, ciudad y correo de facturación (perfil fiscal para la factura electrónica).",
            "Datos de pago: la pasarela nos informa el resultado de la transacción y, en algunos casos, la marca y los últimos cuatro dígitos del medio de pago. **Nunca recibimos ni guardamos el número completo de tarjetas ni credenciales bancarias.**"
          ]
        },
        { p: "**De los usuarios finales (clientes de nuestros clientes):**" },
        {
          ul: [
            "Número de teléfono de WhatsApp y nombre de perfil, cuando está disponible.",
            "En Messenger e Instagram: el identificador que Meta asigna a la persona para esa Página o cuenta (PSID/IGSID), su nombre, foto de perfil y, en Instagram, su nombre de usuario.",
            "Contenido de mensajes, archivos adjuntos (imágenes, audios, documentos) y metadatos (hora, estado de entrega, tipo de mensaje, anuncio o enlace de origen).",
            "En llamadas: número telefónico, audio de la conversación, **grabación**, transcripción y resumen generado por IA.",
            "Datos que el cliente registre en su CRM o en el módulo de seguros: documento de identidad, fecha de nacimiento, datos del vehículo (placa), pólizas, beneficiarios, siniestros y, cuando el producto lo exige y el titular lo autoriza, datos de salud."
          ]
        },
        { p: "**Datos técnicos:** registros de acceso, dirección IP, datos del dispositivo y métricas de uso de la plataforma." }
      ]
    },
    {
      title: "Cómo usamos los datos",
      blocks: [
        {
          ul: [
            "Prestar el servicio de automatización e inteligencia artificial contratado por el cliente.",
            "Recibir, enrutar y almacenar conversaciones y llamadas en el espacio de cada cliente.",
            "Generar respuestas, transcripciones, resúmenes y datos estructurados mediante modelos de IA, en nombre del cliente.",
            "Gestionar el CRM, las campañas, las citas, las cotizaciones y las pólizas del cliente.",
            "Facturar, procesar pagos y emitir factura electrónica.",
            "Enviar notificaciones operativas, de seguridad y de servicio.",
            "Proteger la seguridad de la plataforma y cumplir obligaciones legales."
          ]
        },
        { note: { title: "Inteligencia artificial y entrenamiento de modelos", text: "Noova 360 **no utiliza** los mensajes, llamadas ni datos de los clientes o de sus usuarios finales para entrenar, ajustar o mejorar modelos de inteligencia artificial, propios o de terceros. Los proveedores de IA se usan mediante sus API empresariales, cuyos términos excluyen el uso de estos datos para entrenamiento. Si esta práctica cambiara, lo notificaríamos con al menos 30 días de anticipación y pediríamos consentimiento explícito." } }
      ]
    },
    {
      title: "Llamadas de voz y grabaciones",
      blocks: [
        { p: "Cuando el cliente usa agentes de voz, el audio de las llamadas se procesa en tiempo real por proveedores de telefonía y de voz con IA para mantener la conversación. Las llamadas se **graban y transcriben** para que el cliente pueda consultarlas, auditarlas y analizarlas." },
        { p: "El cliente es responsable de informar a sus interlocutores que la llamada es atendida por un asistente de IA y que puede ser grabada, y de contar con las autorizaciones necesarias. Las grabaciones se almacenan en repositorios privados, solo son accesibles a usuarios autorizados del cliente mediante enlaces temporales, y se conservan hasta 12 meses." }
      ]
    },
    {
      title: "Integración con Google Calendar",
      blocks: [
        { p: "Cuando un negocio cliente conecta su cuenta de Google Calendar en Noova 360 (mediante OAuth, con su consentimiento explícito), nuestros agentes de IA usan esa conexión exclusivamente para consultar la disponibilidad real de su calendario y crear eventos o citas cuando un usuario final agenda a través del asistente." },
        { p: "**Alcance de acceso (scopes):** únicamente calendar.events (crear y editar los eventos que el propio asistente crea), calendar.freebusy (consultar disponibilidad, sin leer el detalle de otros eventos) y userinfo.email (identificar la cuenta conectada). No accedemos al contenido de otros eventos ni a ningún otro dato de la cuenta de Google." },
        { p: "Nuestro uso de la información recibida a través de las APIs de Google se ajusta a la **Política de Datos de Usuario de los Servicios de API de Google**, incluidos los requisitos de **Uso Limitado (Limited Use)**: no usamos estos datos con fines publicitarios, no los vendemos ni los compartimos con terceros salvo lo estrictamente necesario para prestar el servicio, y no los usamos para entrenar modelos de inteligencia artificial." },
        { p: "El cliente puede revocar el acceso en cualquier momento desde Noova 360 (Conectores → Google Calendar → Desconectar) o desde [myaccount.google.com/permissions](https://myaccount.google.com/permissions). Al desconectar dejamos de acceder de inmediato. No almacenamos una copia del calendario; solo un registro de las citas que el asistente creó (fecha, nombre y motivo). Los tokens de acceso se guardan cifrados." }
      ]
    },
    {
      title: "Integración con Messenger e Instagram",
      blocks: [
        { p: "Cuando un negocio cliente conecta su Página de Facebook y, si la tiene vinculada, su cuenta profesional de Instagram (mediante Inicio de sesión con Facebook para empresas, con su consentimiento explícito), usamos esa conexión exclusivamente para:" },
        {
          ul: [
            "Listar las Páginas y cuentas de Instagram que el negocio eligió y registrarlas como canales.",
            "Suscribir esas Páginas a nuestras notificaciones (webhooks) para recibir los mensajes que llegan.",
            "Mostrar las conversaciones de Messenger e Instagram Direct en el inbox del negocio, con el nombre y la foto de la persona.",
            "Responder con el asistente de IA configurado por el negocio o por una persona de su equipo, solo en conversaciones iniciadas por el usuario final y dentro de los plazos que fija Meta."
          ]
        },
        { p: "**Permisos que usamos:** pages_show_list, pages_manage_metadata, pages_messaging, instagram_basic, instagram_manage_messages y business_management. No publicamos contenido en la Página ni en Instagram, no leemos sus publicaciones, anuncios ni seguidores, y no enviamos mensajes promocionales a nombre del negocio." },
        { p: `El token de acceso de la Página se guarda cifrado. Si el usuario final elimina un mensaje en Messenger o Instagram, lo eliminamos también del inbox junto con su adjunto. Los datos recibidos de Meta no se usan con fines publicitarios, no se venden y no se usan para entrenar modelos de IA. El negocio puede revocar el acceso desde Noova 360 (Canales → Messenger e Instagram → Desconectar) o desde Facebook (Configuración → Integraciones empresariales). Para solicitar la eliminación de estos datos escribe a ${MAIL}.` }
      ]
    },
    {
      title: "Proveedores y subencargados",
      blocks: [
        { p: "Compartimos datos únicamente con los siguientes proveedores y solo en la medida necesaria para prestar el servicio, bajo acuerdos de confidencialidad y seguridad:" },
        {
          ul: [
            "**Supabase (sobre Amazon Web Services, EE. UU.):** base de datos, autenticación y almacenamiento de archivos.",
            "**Hostinger:** servidores de aplicación.",
            "**Cloudflare:** red de entrega y protección del tráfico web.",
            "**Google (Google Workspace):** almacenamiento de copias de respaldo.",
            "**Meta Platforms:** WhatsApp Business Platform, Messenger e Instagram.",
            "**Twilio:** mensajería de WhatsApp y telefonía.",
            "**Telnyx:** telefonía y audio de llamadas en tiempo real.",
            "**Google (Gemini API), OpenAI y Anthropic:** modelos de inteligencia artificial para texto y voz.",
            "**ElevenLabs:** voz sintética y agentes de voz.",
            "**Resend:** correo electrónico transaccional.",
            "**Bold (Colombia):** pasarela de pagos en pesos y dólares.",
            "**Paddle.com Market Limited:** pasarela de pagos internacional y Merchant of Record.",
            "**Siigo (Colombia):** facturación electrónica ante la DIAN.",
            "**Integraciones que el cliente decide conectar:** Google Calendar, HubSpot, WooCommerce, Softseguros, aseguradoras, servicios de consulta vehicular y herramientas de automatización (webhooks). Los datos se intercambian solo cuando el cliente activa la integración y bajo su instrucción."
          ]
        },
        { p: "Varios de estos proveedores se ubican en los Estados Unidos de América, país reconocido por la SIC con nivel adecuado de protección de datos. **No vendemos, alquilamos ni compartimos datos personales con fines comerciales o publicitarios.** Informaremos a nuestros clientes antes de incorporar nuevos subencargados que traten datos personales." }
      ]
    },
    {
      title: "Pagos",
      blocks: [
        { p: "Los pagos se procesan en pasarelas certificadas PCI DSS. Con **Bold** el pago se realiza en una página alojada por Bold (tarjeta, PSE, Nequi o Botón Bancolombia); con **Paddle**, en su formulario seguro, y Paddle actúa como Merchant of Record. **Noova 360 nunca ve ni guarda el número de tu tarjeta.** Con tu perfil fiscal emitimos la factura electrónica a través de Siigo." }
      ]
    },
    {
      title: "Almacenamiento y retención",
      blocks: [
        {
          ul: [
            "Las conversaciones, contactos y demás información del cliente se conservan mientras su cuenta esté activa.",
            "Las grabaciones de llamadas se conservan hasta 12 meses desde la llamada.",
            "Al terminar el servicio, el cliente dispone de 30 días para exportar su información; luego se elimina de los sistemas productivos.",
            "Las copias de respaldo se eliminan automáticamente a los 90 días.",
            "Los datos de facturación se conservan por el término que exige la ley."
          ]
        },
        { p: `El cliente puede eliminar registros en cualquier momento desde la plataforma o solicitar la eliminación anticipada escribiendo a ${MAIL}.` }
      ]
    },
    {
      title: "Seguridad de los datos",
      blocks: [
        {
          ul: [
            "Cifrado en tránsito (HTTPS/TLS) en todas las comunicaciones y cifrado en reposo de la infraestructura.",
            "Cifrado adicional (AES-256-GCM) de las credenciales y tokens de integraciones que conectan nuestros clientes.",
            "Aislamiento de la información de cada cliente en la aplicación y en la base de datos.",
            "Control de acceso por roles y permisos, y archivos privados entregados mediante enlaces temporales.",
            "Respaldos diarios en una nube independiente."
          ]
        },
        { p: "Si ocurre un incidente de seguridad que afecte datos personales, notificaremos a los clientes afectados dentro de las 72 horas siguientes a su confirmación y a la Superintendencia de Industria y Comercio cuando corresponda." }
      ]
    },
    {
      title: "Derechos de los titulares",
      blocks: [
        { p: "De conformidad con la Ley 1581 de 2012, los titulares pueden conocer, actualizar, rectificar y suprimir sus datos, revocar la autorización, solicitar prueba de ella y presentar quejas ante la Superintendencia de Industria y Comercio (SIC). El procedimiento y los plazos se detallan en nuestra [Política de Tratamiento de Datos Personales](/tratamiento-datos)." },
        { p: `Para ejercer estos derechos escribe a ${MAIL}. Si tus datos fueron cargados por una empresa cliente de Noova 360, trasladaremos tu solicitud a esa empresa, que es la Responsable, y apoyaremos su atención.` }
      ]
    },
    {
      title: "Cookies y almacenamiento en el navegador",
      blocks: [
        { p: "La plataforma usa el almacenamiento local del navegador y, cuando es necesario, cookies técnicas para mantener la sesión iniciada y recordar preferencias. No usamos cookies de seguimiento publicitario ni compartimos datos de navegación con terceros con fines de publicidad." }
      ]
    },
    {
      title: "Cambios a esta política",
      blocks: [
        { p: "Podemos actualizar esta política. Cuando los cambios sean materiales, lo notificaremos a los clientes registrados por correo electrónico con al menos 15 días de anticipación a su entrada en vigor." }
      ]
    },
    { title: "Contacto", blocks: [{ ul: CONTACT_LIST }] }
  ],
  footerNote:
    "Esta política cumple con la Ley 1581 de 2012, los requisitos de Meta para proveedores de tecnología de WhatsApp Business Platform, las Condiciones de la Plataforma de Meta para Messenger e Instagram y la Política de Datos de Usuario de los Servicios de API de Google (incluidos los requisitos de Uso Limitado)."
};

// ─── Términos y Condiciones ────────────────────────────────────────────────
const TERMINOS: LegalDocument = {
  slug: "terminos",
  title: "Términos y Condiciones del Servicio",
  webTitle: "Terms and Conditions / Términos de Servicio",
  metaTitle: "Terms and Conditions – Términos de Servicio – Noova 360",
  metaDescription:
    "Términos y condiciones de uso de Noova 360 (DOMAL SAS): planes, pagos con Bold y Paddle, facturación electrónica, créditos, uso aceptable, respuestas generadas por IA, disponibilidad y responsabilidad.",
  updated: UPDATED,
  effective: UPDATED,
  intro:
    "Estos términos regulan el uso de Noova 360. Léelos con atención: al crear una cuenta, contratar un plan o usar la plataforma, los aceptas.",
  sections: [
    {
      title: "Quiénes somos y aceptación de estos términos",
      blocks: [
        { p: `**Noova 360** es un software como servicio (SaaS) operado por **${E.name}** («Noova», «nosotros»), NIT ${E.nit}, con domicilio en ${E.address}. Al crear una cuenta, contratar un plan o usar la plataforma, aceptas estos Términos en nombre tuyo o de la empresa que representas.` },
        { p: "Si no estás de acuerdo, no debes usar Noova 360. Si contratas en nombre de una empresa, declaras tener autoridad para vincularla a este acuerdo." }
      ]
    },
    {
      title: "Qué es el servicio",
      blocks: [
        { p: "Noova 360 es una plataforma de atención al cliente e inteligencia artificial: agentes de IA que atienden por WhatsApp, Messenger, Instagram, voz y chat web; una bandeja omnicanal; un CRM que se alimenta de esas conversaciones; campañas, automatizaciones, agendamiento, ERP e inventario, el copiloto Ori y, para intermediarios de seguros, cotizaciones, pólizas, siniestros y renovaciones. Los detalles de cada plan, sus créditos y funcionalidades se muestran en la plataforma y pueden actualizarse." }
      ]
    },
    {
      title: "Quién puede contratar",
      blocks: [{ p: "Noova 360 es un servicio para empresas (B2B). No está dirigido a consumidores que contraten a título personal. Debes ser mayor de edad y tener capacidad legal para contratar en nombre de tu empresa." }]
    },
    {
      title: "Cuenta y credenciales",
      blocks: [
        { p: "Eres responsable de la confidencialidad de tus credenciales y de toda actividad bajo tu cuenta, así como de asignar roles y permisos adecuados a tu equipo y de retirar el acceso a quienes se desvinculen. Notifícanos de inmediato si sospechas un uso no autorizado." }
      ]
    },
    {
      title: "Planes, precios y pagos",
      blocks: [
        { p: "Los planes de pago se cobran por adelantado, de forma mensual y recurrente, en dólares estadounidenses (USD) o en pesos colombianos (COP), según el medio de pago y lo acordado en tu contrato. Los pagos se procesan por una de estas pasarelas:" },
        {
          ul: [
            "**Bold (Colombia):** pagos con tarjeta, PSE, Nequi o Botón Bancolombia mediante un enlace de pago seguro de Bold. En este caso **DOMAL SAS es el comercio** que recibe el pago y emite la factura electrónica.",
            "**Paddle.com Market Limited:** revendedor autorizado y Merchant of Record para pagos internacionales con tarjeta. En este caso Paddle aparece en tu extracto bancario, emite el recibo de la compra y gestiona la recaudación y los impuestos que le correspondan."
          ]
        },
        { p: "**Pago recurrente con tarjeta guardada (Paddle):** al activar un plan con Paddle autorizas expresamente a que Paddle guarde tu tarjeta y la cargue automáticamente al inicio de cada ciclo, hasta que canceles. Si el cobro falla, Paddle lo reintenta y te lo notifica. Puedes actualizar tu medio de pago desde el portal de Paddle, enlazado en Facturación." },
        { p: "**Pagos con Bold:** cada ciclo se paga mediante el enlace de pago que la plataforma genera para tu factura; el pago debe realizarse antes de la fecha límite del ciclo." },
        { p: "**Factura electrónica:** para pagar debes completar tu perfil fiscal (tipo y número de documento o NIT, razón social, dirección y correo de facturación). Con esos datos emitimos la factura electrónica ante la DIAN a través de nuestro proveedor tecnológico autorizado. Eres responsable de que la información fiscal sea correcta." },
        { p: "Puedes cancelar en cualquier momento desde Facturación → Plan actual o escribiendo a " + MAIL + "; conservas el acceso hasta el final del ciclo pagado. Los precios pueden cambiar; te avisaremos con al menos 30 días de anticipación antes de que un cambio aplique a tu renovación. El detalle de cancelaciones y reembolsos está en la [Política de Reembolsos](/reembolsos)." }
      ]
    },
    {
      title: "Créditos y consumo",
      blocks: [
        { p: "Cada plan incluye una asignación mensual de créditos que se consumen según el uso (mensajes, minutos de voz, documentos procesados, etc.). Los créditos incluidos en el plan **no se acumulan** al siguiente ciclo. Si tu saldo se agota, algunas funciones pueden pausarse hasta la renovación o hasta que compres créditos adicionales." },
        { p: "**Compra de créditos adicionales:** puedes comprar paquetes de créditos con Bold o Paddle. Los créditos comprados **no vencen** al cerrar el ciclo." },
        { p: "**Recarga automática (opcional):** disponible para pagos con tarjeta guardada en Paddle. Si la activas, cuando tu saldo baje del umbral que definas se cobrará automáticamente el paquete elegido, sin superar el tope mensual que configures. Es una función que activas tú (opt-in), queda registrada como evidencia de tu autorización y puedes desactivarla en cualquier momento; también podemos deshabilitarla si detectamos un uso indebido." }
      ]
    },
    {
      title: "Uso aceptable",
      blocks: [
        { p: "No puedes usar Noova 360 para:" },
        {
          ul: [
            "Enviar spam, mensajes masivos no solicitados o contenido engañoso, o contactar personas sin su autorización.",
            "Actividades ilegales, fraudulentas o que infrinjan derechos de terceros, incluida la normativa de protección de datos.",
            "Violar las políticas de las plataformas que integramos, en particular las [políticas de WhatsApp Business Platform de Meta](https://www.whatsapp.com/legal/business-policy/), las Condiciones de la Plataforma de Meta para Messenger e Instagram y los términos de Google.",
            "Suplantar personas o hacer creer a tus interlocutores que un asistente de IA es una persona cuando la ley o las políticas del canal exijan informarlo.",
            "Intentar acceder sin autorización a sistemas de Noova o a información de otros clientes, o probar vulnerabilidades sin autorización escrita.",
            "Realizar ingeniería inversa, copiar o revender la plataforma sin autorización escrita."
          ]
        },
        { p: "Podemos suspender o cancelar cuentas que incumplan esta sección." }
      ]
    },
    {
      title: "Respuestas generadas por inteligencia artificial",
      blocks: [
        { p: "Los agentes de Noova 360 usan modelos de IA de terceros para generar respuestas automáticas. **Estas respuestas pueden contener errores, imprecisiones u omisiones**: la IA no sustituye el criterio profesional humano, especialmente en información sensible o regulada (por ejemplo, coberturas, precios o condiciones de pólizas de seguros)." },
        { p: "Eres responsable de configurar, supervisar y revisar tus agentes y de validar cualquier información antes de que tenga efectos vinculantes frente a tus clientes. Noova 360 no garantiza la exactitud ni idoneidad de ninguna respuesta generada por IA para un caso particular." }
      ]
    },
    {
      title: "Propiedad intelectual",
      blocks: [{ p: "Noova 360, su software, marca y diseño son propiedad de DOMAL SAS. Te otorgamos una licencia limitada, no exclusiva e intransferible para usar la plataforma mientras tu cuenta esté activa. Tú conservas la propiedad de tus datos, contenidos y conversaciones; nos concedes solo la licencia necesaria para procesarlos y prestarte el servicio." }]
    },
    {
      title: "Datos personales",
      blocks: [
        { p: "Frente a los datos personales de tus contactos, clientes y usuarios finales, **tú eres el Responsable del tratamiento** y DOMAL SAS actúa como **Encargado**, tratándolos solo para prestarte el servicio y según tus instrucciones. Te corresponde obtener las autorizaciones de los titulares —incluida la autorización expresa para datos sensibles, como los de salud en seguros de vida— y atender sus solicitudes." },
        { p: "El tratamiento se rige por nuestra [Política de Privacidad](/privacy) y nuestra [Política de Tratamiento de Datos Personales](/tratamiento-datos), que forman parte de este acuerdo. Si lo necesitas, suscribimos contigo un Acuerdo de Tratamiento de Datos." }
      ]
    },
    {
      title: "Integraciones y servicios de terceros",
      blocks: [{ p: "Noova 360 se conecta con servicios de terceros como Meta (WhatsApp, Messenger e Instagram), proveedores de telefonía, modelos de IA, Google Calendar, CRM, tiendas en línea y sistemas del sector asegurador. Esas integraciones dependen de la disponibilidad y condiciones de esos terceros, sobre las que no tenemos control; no somos responsables por interrupciones, cambios o suspensiones originados en ellos." }]
    },
    {
      title: "Disponibilidad del servicio",
      blocks: [{ p: "Trabajamos con diligencia razonable para mantener la plataforma disponible, con un objetivo de disponibilidad mensual del 99,5 %, pero salvo que se pacte un Acuerdo de Nivel de Servicio por escrito no garantizamos un porcentaje específico ni un servicio libre de interrupciones. Podemos realizar mantenimientos y avisaremos con antelación razonable cuando sea posible." }]
    },
    {
      title: "Suspensión y terminación",
      blocks: [
        { p: "Si tu pago no se procesa, tienes un periodo de gracia de **5 días calendario** desde la fecha límite de pago de tu ciclo para regularizarlo. Pasado ese plazo, tu cuenta se **suspende automáticamente**: se bloquea el panel (salvo Facturación, para que puedas pagar) y tus agentes dejan de responder hasta que se registre el pago. Tus datos no se eliminan por una suspensión." },
        { p: "Podemos suspender o terminar tu cuenta de inmediato si incumples la sección de uso aceptable." },
        { p: "Puedes cancelar tu suscripción en cualquier momento; conservas el acceso hasta el final del ciclo pagado. Nosotros podemos terminar el acuerdo por conveniencia con aviso previo de al menos 30 días, salvo incumplimiento grave o riesgo legal." },
        { p: "**Tras la terminación**, dispones de 30 días para exportar tu información; después la eliminamos de los sistemas productivos, y las copias de respaldo se depuran en un máximo de 90 días." }
      ]
    },
    {
      title: "Garantías y exención de responsabilidad",
      blocks: [{ p: "Noova 360 se ofrece «tal cual» y «según disponibilidad». En la medida permitida por la ley, no otorgamos garantías implícitas de comerciabilidad, idoneidad para un propósito particular o no infracción, más allá de lo expresamente indicado en estos términos." }]
    },
    {
      title: "Límite de responsabilidad",
      blocks: [
        { p: "En la máxima medida permitida por la ley, la responsabilidad total de Noova 360 por cualquier reclamo relacionado con el servicio se limita al **monto que pagaste por tu plan en el último ciclo de facturación mensual**. No seremos responsables por daños indirectos, incidentales, especiales, consecuentes o lucro cesante." },
        { p: "Esta limitación no aplica a obligaciones que no puedan limitarse por ley, ni a los casos de dolo o culpa grave." }
      ]
    },
    {
      title: "Indemnización",
      blocks: [{ p: "Aceptas indemnizar a Noova 360 frente a reclamos de terceros que surjan de tu uso indebido de la plataforma, del contenido que envíes, del tratamiento de datos sin autorización de sus titulares o del incumplimiento de estos términos o de la normativa aplicable a tu operación." }]
    },
    {
      title: "Confidencialidad",
      blocks: [{ p: "Ambas partes protegerán la información confidencial de la otra que conozcan con ocasión de este acuerdo y no la divulgarán a terceros salvo autorización, obligación legal o requerimiento de autoridad competente." }]
    },
    {
      title: "Ley aplicable y jurisdicción",
      blocks: [{ p: "Este acuerdo se rige por las leyes de la República de Colombia. Las controversias que no se resuelvan directamente se someterán a los jueces competentes de Bogotá, sin perjuicio de las condiciones de compra que Paddle aplique como Merchant of Record respecto de los pagos que procese." }]
    },
    {
      title: "Modificaciones",
      blocks: [{ p: "Podemos actualizar estos términos. Si el cambio es material, te avisaremos con al menos 30 días de anticipación por correo o dentro de la plataforma. El uso continuado después de esa fecha implica tu aceptación." }]
    },
    {
      title: "Disposiciones generales",
      blocks: [{ p: "Si alguna cláusula resulta inválida, el resto permanece vigente. No puedes ceder este acuerdo sin nuestro consentimiento escrito. Estos términos, junto con la Política de Privacidad, la Política de Tratamiento de Datos Personales y la Política de Reembolsos, constituyen el acuerdo completo entre las partes." }]
    },
    { title: "Contacto", blocks: [{ ul: CONTACT_LIST }] }
  ]
};

// ─── Política de Reembolsos ────────────────────────────────────────────────
const REEMBOLSOS: LegalDocument = {
  slug: "reembolsos",
  title: "Política de Reembolsos",
  webTitle: "Refund Policy / Política de Reembolsos",
  metaTitle: "Refund Policy – Política de Reembolsos – Noova 360",
  metaDescription:
    "Política de reembolsos de Noova 360 (DOMAL SAS): prueba gratuita, cobros con Bold y Paddle, derecho de retracto, excepciones y cómo solicitar un reembolso.",
  updated: UPDATED,
  effective: UPDATED,
  intro:
    "Esta política explica cómo funcionan los cobros de Noova 360, qué cubre la prueba gratuita y cuándo y cómo puedes solicitar un reembolso, tanto si pagaste con Bold como con Paddle.",
  sections: [
    {
      title: "Quiénes somos y quién procesa tu pago",
      blocks: [
        { p: `**Noova 360** es un software como servicio operado por **${E.name}**, NIT ${E.nit}, con domicilio en ${E.address}. Los pagos se procesan por una de dos pasarelas:` },
        {
          ul: [
            "**Bold (Colombia):** DOMAL SAS es el comercio que recibe el pago; nosotros aprobamos y ejecutamos el reembolso a través de Bold.",
            "**Paddle.com Market Limited** («Paddle»): nuestro revendedor autorizado y Merchant of Record. Paddle aparece en tu extracto, emite el recibo y ejecuta el reembolso; nosotros definimos la política."
          ]
        },
        { p: `Contacto: ${MAIL}.` }
      ]
    },
    {
      title: "Prueba gratuita",
      blocks: [{ p: "El plan **Explorador** es gratuito durante 14 días y no requiere tarjeta. Te recomendamos usarlo para evaluar si Noova 360 se ajusta a tu operación antes de contratar un plan de pago." }]
    },
    {
      title: "Cómo funcionan los cobros",
      blocks: [
        { p: "Los planes de pago se facturan por adelantado, de forma mensual, en dólares (USD) o pesos colombianos (COP) según el medio de pago. Cada cobro da acceso a la plataforma y a los créditos incluidos durante ese ciclo." },
        { p: "Las compras de créditos adicionales y, si la activaste, cada **recarga automática** son cobros independientes sujetos a esta misma política. Desactivar la recarga automática evita cobros futuros, pero no reembolsa recargas ya cobradas." }
      ]
    },
    {
      title: "Política general: sin reembolsos de ciclos ya facturados",
      blocks: [
        { p: "Una vez procesado el cobro de un ciclo mensual, **ese cobro no es reembolsable**, independientemente de los créditos consumidos. Consideramos que la prueba gratuita de 14 días es tiempo suficiente para decidir." },
        { p: "Puedes cancelar la renovación en cualquier momento desde **Facturación → Plan actual** o escribiéndonos. Conservas el acceso y los créditos hasta el final del ciclo pagado." },
        { p: "**Derecho de retracto (Ley 1480 de 2011, art. 47):** si contrataste a distancia, puedes retractarte dentro de los 5 días hábiles siguientes a tu primer pago. Al usar la plataforma de inmediato aceptas que el servicio comience; aun así, si nos escribes dentro de ese plazo y tu consumo fue mínimo (menos del 10 % de los créditos del ciclo), te reembolsamos el cobro completo." }
      ]
    },
    {
      title: "Excepciones: cuándo sí procede un reembolso",
      blocks: [
        {
          ul: [
            "**Cobro duplicado o por error técnico.**",
            "**Cargo no autorizado** por el titular del medio de pago.",
            "**Falla del servicio atribuible a Noova 360** que te haya impedido usarlo durante una parte significativa del ciclo."
          ]
        },
        { p: "Fuera de estos casos no ofrecemos reembolsos por cambio de opinión, por no haber usado la plataforma ni por créditos del plan no consumidos al finalizar un ciclo." }
      ]
    },
    {
      title: "Cómo solicitar un reembolso",
      blocks: [
        { p: `Escríbenos a ${MAIL} indicando el motivo y la referencia de la transacción (el comprobante de Bold o el número de transacción de Paddle). Respondemos en un máximo de **5 días hábiles**.` },
        { p: "Si el reembolso se aprueba: en pagos con **Bold** lo ejecutamos por el mismo medio de pago y emitimos la nota crédito electrónica correspondiente; en pagos con **Paddle** coordinamos su ejecución con Paddle. El dinero puede tardar algunos días hábiles adicionales en reflejarse, según tu banco o entidad." }
      ]
    },
    {
      title: "Reembolsos que procesa Paddle directamente",
      blocks: [{ p: "Como Merchant of Record, Paddle puede, bajo sus propias políticas de protección al comprador o por obligaciones legales en tu jurisdicción, conceder un reembolso de forma independiente. Consulta sus condiciones en [paddle.com/legal](https://www.paddle.com/legal/checkout-buyer-terms)." }]
    },
    { title: "Contacto", blocks: [{ ul: CONTACT_LIST }] }
  ]
};

export const LEGAL_DOCUMENTS = {
  tratamiento: TRATAMIENTO,
  privacidad: PRIVACIDAD,
  terminos: TERMINOS,
  reembolsos: REEMBOLSOS
} as const;
