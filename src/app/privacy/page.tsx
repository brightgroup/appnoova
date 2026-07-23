import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { getMarketingSiteUrl } from "@/lib/marketing-site-url";

export const metadata: Metadata = {
  title: "Política de Privacidad – Noova 360",
  description:
    "Política de privacidad de Noova 360 (BG Soluciones). Tratamiento de datos personales, WhatsApp Business Platform y derechos de los titulares.",
  alternates: {
    canonical: "https://app.noova360.com/privacy"
  },
  openGraph: {
    title: "Política de Privacidad – Noova 360",
    url: "https://app.noova360.com/privacy",
    siteName: "Noova 360",
    locale: "es_CO",
    type: "website"
  }
};

const SECTIONS = [
  {
    num: 1,
    title: "Quiénes somos",
    content: (
      <>
        <p>
          <strong>Noova 360</strong> es un software como servicio (SaaS) operado por BG Soluciones,
          con domicilio en Bogotá, Colombia. Actuamos como proveedor de tecnología autorizado por Meta
          para el uso de la API de WhatsApp Business (WhatsApp Business Platform), lo que nos permite
          conectar a nuestros clientes con sus usuarios finales a través de WhatsApp de forma automatizada.
        </p>
        <p>
          Contacto:{" "}
          <a href="mailto:info@bgsoluciones.com.co" className="text-[#a5a5ff] hover:underline">
            info@bgsoluciones.com.co
          </a>
        </p>
      </>
    )
  },
  {
    num: 2,
    title: "Datos que recopilamos",
    content: (
      <>
        <p><strong>De nuestros clientes (negocios):</strong></p>
        <ul className="list-disc pl-5 space-y-1.5 mb-4">
          <li>Nombre completo del representante o administrador de la cuenta</li>
          <li>Correo electrónico corporativo</li>
          <li>Número de teléfono de contacto</li>
          <li>Nombre, NIT/RUT y datos generales de la empresa</li>
          <li>Datos de facturación y pago (procesados por proveedores de pago certificados)</li>
        </ul>
        <p><strong>De los usuarios finales (clientes de nuestros clientes que interactúan por WhatsApp u otros canales):</strong></p>
        <ul className="list-disc pl-5 space-y-1.5 mb-4">
          <li>Número de teléfono de WhatsApp</li>
          <li>Contenido de los mensajes enviados y recibidos dentro de las conversaciones</li>
          <li>Metadatos de mensajes (marca de tiempo, estado de entrega, tipo de mensaje)</li>
          <li>Nombre de perfil de WhatsApp, cuando está disponible</li>
        </ul>
        <p><strong>Datos técnicos y de uso:</strong></p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>Registros de acceso, dirección IP y datos del dispositivo</li>
          <li>Métricas de uso de la plataforma (conversaciones procesadas, tiempos de respuesta)</li>
        </ul>
      </>
    )
  },
  {
    num: 3,
    title: "Integración con Google Calendar",
    content: (
      <>
        <p>
          Cuando un negocio cliente conecta su cuenta de Google Calendar en Noova 360 (mediante OAuth,
          con su consentimiento explícito), nuestros agentes de inteligencia artificial usan esa conexión
          exclusivamente para:
        </p>
        <ul className="list-disc pl-5 space-y-1.5 mb-4">
          <li>Consultar la disponibilidad real (franjas libres/ocupadas) de su calendario</li>
          <li>Crear eventos/citas cuando un usuario final agenda una cita a través del asistente de IA</li>
        </ul>
        <p>
          <strong>Alcance de acceso (scopes):</strong> únicamente <code>calendar.events</code> (crear y
          editar eventos que el propio asistente crea), <code>calendar.freebusy</code> (consultar
          disponibilidad, sin leer el detalle de otros eventos) y <code>userinfo.email</code> (identificar
          la cuenta conectada). No accedemos al contenido de otros eventos del calendario ni a ningún otro
          dato de la cuenta de Google del cliente.
        </p>
        <p>
          Nuestro uso de la información recibida a través de las APIs de Google se ajusta a la{" "}
          <strong>Política de Datos de Usuario de los Servicios de API de Google</strong>, incluidos los
          requisitos de <strong>Uso Limitado (Limited Use)</strong>: no usamos estos datos con fines
          publicitarios, no los vendemos ni los compartimos con terceros salvo lo estrictamente necesario
          para prestar el servicio contratado, y no los usamos para entrenar modelos de inteligencia
          artificial de propósito general.
        </p>
        <p>
          El negocio cliente puede revocar este acceso en cualquier momento desde Noova 360 (Conectores →
          Google Calendar → Desconectar) o directamente desde su cuenta de Google en{" "}
          <a
            href="https://myaccount.google.com/permissions"
            target="_blank"
            rel="noreferrer"
            className="text-[#a5a5ff] hover:underline"
          >
            myaccount.google.com/permissions
          </a>
          . Al desconectar, dejamos de acceder a su calendario de inmediato. No almacenamos una copia del
          calendario del cliente; solo guardamos un registro local de las citas que el propio asistente
          creó (fecha, nombre y motivo), no el calendario completo.
        </p>
      </>
    )
  },
  {
    num: 4,
    title: "Cómo usamos los datos",
    content: (
      <>
        <p>Usamos los datos recopilados exclusivamente para:</p>
        <ul className="list-disc pl-5 space-y-1.5 mb-4">
          <li>Prestar el servicio de automatización e inteligencia artificial contratado por nuestros clientes</li>
          <li>Procesar, enrutar y almacenar conversaciones de WhatsApp en el inbox centralizado de cada cliente</li>
          <li>Generar respuestas automáticas mediante modelos de inteligencia artificial, en nombre del negocio cliente</li>
          <li>Registrar el historial de conversaciones para consulta por parte del negocio cliente</li>
          <li>Enviar notificaciones operativas y de servicio a los clientes registrados</li>
          <li>Cumplir obligaciones legales y contractuales aplicables</li>
        </ul>
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/[.08] px-5 py-4 text-sm text-amber-100/90">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-300 mb-2">
            Importante — Uso de datos para entrenar IA
          </p>
          <p>
            Noova 360 <strong>no utiliza actualmente</strong> los mensajes de WhatsApp ni las conversaciones
            de los usuarios finales para entrenar, ajustar ni mejorar modelos de inteligencia artificial. En caso
            de que esta práctica cambie en el futuro, notificaremos a nuestros clientes con al menos 30 días de
            anticipación y solicitaremos su consentimiento explícito antes de implementar cualquier cambio. Los
            datos de WhatsApp nunca serán compartidos con terceros para fines publicitarios.
          </p>
        </div>
      </>
    )
  },
  {
    num: 5,
    title: "Almacenamiento y retención de datos",
    content: (
      <>
        <p>
          Los mensajes y datos de conversación se almacenan en servidores seguros ubicados en la infraestructura
          de nuestro proveedor de hosting. Las conversaciones se retienen durante el tiempo que el cliente mantenga
          activa su cuenta en Noova 360, más un período adicional de hasta 90 días tras la cancelación del servicio,
          para fines de respaldo.
        </p>
        <p>
          Los clientes pueden solicitar la eliminación anticipada de sus datos y los de sus usuarios finales
          escribiendo a{" "}
          <a href="mailto:info@bgsoluciones.com.co" className="text-[#a5a5ff] hover:underline">
            info@bgsoluciones.com.co
          </a>.
        </p>
      </>
    )
  },
  {
    num: 6,
    title: "Compartición de datos con terceros",
    content: (
      <>
        <p>
          Noova 360 comparte datos únicamente con los siguientes tipos de terceros, y solo en la medida necesaria
          para prestar el servicio:
        </p>
        <ul className="list-disc pl-5 space-y-1.5 mb-4">
          <li>
            <strong>Meta Platforms / WhatsApp:</strong> como proveedor de tecnología registrado, los mensajes se
            transmiten a través de la WhatsApp Business Platform de Meta conforme a sus términos y condiciones.
          </li>
          <li>
            <strong>Google Calendar API:</strong> cuando el negocio cliente conecta su calendario, consultamos y
            creamos eventos a través de esta API de Google, conforme a lo descrito en la sección 3.
          </li>
          <li>
            <strong>Proveedores de infraestructura:</strong> servicios de hosting y bases de datos que alojan la
            plataforma bajo acuerdos de confidencialidad y seguridad.
          </li>
          <li>
            <strong>Proveedores de pago:</strong> para el procesamiento seguro de transacciones de suscripción.
          </li>
          <li>
            <strong>Modelos de IA de terceros:</strong> los mensajes pueden ser procesados por proveedores de
            modelos de lenguaje (LLM) para generar respuestas automáticas, bajo acuerdos de no entrenamiento con
            datos de usuarios.
          </li>
        </ul>
        <p>
          No vendemos, alquilamos ni compartimos datos personales con terceros con fines comerciales o publicitarios.
        </p>
      </>
    )
  },
  {
    num: 7,
    title: "Seguridad de los datos",
    content: (
      <>
        <p>
          Implementamos medidas técnicas y organizativas razonables para proteger los datos personales, incluyendo:
        </p>
        <ul className="list-disc pl-5 space-y-1.5 mb-4">
          <li>Cifrado en tránsito (HTTPS/TLS) en todas las comunicaciones</li>
          <li>Acceso restringido a los datos por rol y autenticación</li>
          <li>Monitoreo de disponibilidad y alertas ante incidentes</li>
          <li>Respaldos periódicos de la base de datos</li>
        </ul>
        <p>
          En caso de una brecha de seguridad que afecte datos personales, notificaremos a los clientes afectados
          en un plazo máximo de 72 horas tras tomar conocimiento del incidente.
        </p>
      </>
    )
  },
  {
    num: 8,
    title: "Derechos de los titulares de datos",
    content: (
      <>
        <p>
          De conformidad con la Ley 1581 de 2012 (Ley de Protección de Datos Personales de Colombia) y sus decretos
          reglamentarios, los titulares de datos tienen derecho a:
        </p>
        <ul className="list-disc pl-5 space-y-1.5 mb-4">
          <li><strong>Conocer:</strong> los datos personales que tenemos sobre ellos</li>
          <li><strong>Actualizar y rectificar:</strong> datos inexactos o incompletos</li>
          <li><strong>Suprimir:</strong> datos cuando no exista obligación legal de conservarlos</li>
          <li><strong>Revocar:</strong> la autorización para el tratamiento de sus datos</li>
          <li><strong>Presentar quejas</strong> ante la Superintendencia de Industria y Comercio (SIC)</li>
        </ul>
        <p>
          Para ejercer estos derechos, escríbenos a{" "}
          <a href="mailto:info@bgsoluciones.com.co" className="text-[#a5a5ff] hover:underline">
            info@bgsoluciones.com.co
          </a>
          . Responderemos en un plazo máximo de 15 días hábiles.
        </p>
      </>
    )
  },
  {
    num: 9,
    title: "Uso de cookies y tecnologías similares",
    content: (
      <p>
        La plataforma Noova 360 utiliza cookies de sesión necesarias para el funcionamiento del sistema de
        autenticación. No utilizamos cookies de seguimiento publicitario ni compartimos datos de navegación con
        terceros para fines de publicidad.
      </p>
    )
  },
  {
    num: 10,
    title: "Cambios a esta política",
    content: (
      <p>
        Podemos actualizar esta política de privacidad periódicamente. Cuando realicemos cambios materiales,
        notificaremos a los clientes registrados por correo electrónico con al menos 15 días de anticipación a la
        fecha de entrada en vigor. El uso continuado del servicio tras la notificación constituye la aceptación de
        los términos actualizados.
      </p>
    )
  },
  {
    num: 11,
    title: "Contacto",
    content: (
      <>
        <p>Para cualquier consulta, solicitud o reclamación relacionada con el tratamiento de datos personales:</p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>
            <strong>Email:</strong>{" "}
            <a href="mailto:info@bgsoluciones.com.co" className="text-[#a5a5ff] hover:underline">
              info@bgsoluciones.com.co
            </a>
          </li>
          <li><strong>Empresa:</strong> BG Soluciones / Noova 360</li>
          <li><strong>Ciudad:</strong> Bogotá, Colombia</li>
          <li>
            <strong>Sitio web:</strong>{" "}
            <a href="https://app.noova360.com" className="text-[#a5a5ff] hover:underline">
              app.noova360.com
            </a>
          </li>
        </ul>
      </>
    )
  }
] as const;

export default function PrivacyPolicyPage() {
  const marketingUrl = getMarketingSiteUrl();
  return (
    <div className="min-h-screen bg-[#06070d] text-white flex flex-col">
      <header className="sticky top-0 z-50 flex items-center justify-between h-14 px-6 bg-[#06070d]/90 backdrop-blur-xl border-b border-white/[.06]">
        <a href={marketingUrl} className="relative h-8 w-28 sm:w-32 flex-shrink-0">
          <Image
            src="/logo-noova.png"
            alt="Noova 360"
            fill
            className="object-contain object-left"
            priority
          />
        </a>
        <Link
          href="/login"
          className="inline-flex items-center justify-center h-9 px-4 rounded-lg border border-white/[.1] text-sm font-medium text-white hover:bg-white/[.05] transition-all"
        >
          Ingresar
        </Link>
      </header>

      <main className="flex-1 mx-auto w-full max-w-3xl px-6 py-12 sm:py-16">
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white mb-2">
          Política de Privacidad
        </h1>
        <p className="text-sm text-gray-500 mb-8 pb-8 border-b border-white/[.08]">
          Última actualización: 23 de julio de 2026 · Vigente desde: 15 de junio de 2026
        </p>

        <div className="rounded-xl border border-[#5b5bf6]/25 bg-[#5b5bf6]/[.08] px-5 py-4 mb-10 text-sm text-gray-300 leading-relaxed">
          Noova 360 es una plataforma de automatización e inteligencia artificial para empresas. Esta política
          explica qué datos recopilamos, cómo los usamos y cómo los protegemos, tanto de nuestros clientes (los
          negocios que contratan el servicio) como de los usuarios finales con quienes esos negocios se comunican
          a través de WhatsApp, Google Calendar y otros canales o integraciones.
        </div>

        <div className="space-y-10">
          {SECTIONS.map((section) => (
            <section key={section.num}>
              <h2 className="flex items-center gap-3 text-lg font-bold text-white mb-4 pb-3 border-b border-white/[.08]">
                <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-[#5b5bf6] text-xs font-bold text-white shrink-0">
                  {section.num}
                </span>
                {section.title}
              </h2>
              <div className="space-y-3 text-[15px] text-gray-300 leading-relaxed [&_strong]:text-gray-200">
                {section.content}
              </div>
            </section>
          ))}
        </div>
      </main>

      <footer className="border-t border-white/[.06] py-8 px-6 text-center text-sm text-gray-500 leading-relaxed">
        <p>© 2026 Noova 360 · BG Soluciones · Bogotá, Colombia</p>
        <p className="mt-2 text-xs text-gray-600 max-w-xl mx-auto">
          Esta política cumple con la Ley 1581 de 2012, los requisitos de Meta para proveedores de tecnología
          de WhatsApp Business Platform, y la Política de Datos de Usuario de los Servicios de API de Google
          (incluidos los requisitos de Uso Limitado).
        </p>
      </footer>
    </div>
  );
}
