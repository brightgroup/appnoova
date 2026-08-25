import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { getMarketingSiteUrl } from "@/lib/marketing-site-url";

export const metadata: Metadata = {
  title: "Terms and Conditions – Términos de Servicio – Noova 360",
  description:
    "Terms and Conditions / Términos y condiciones de uso de Noova 360 (DOMAL SAS): planes, facturación, uso aceptable, respuestas generadas por IA, disponibilidad y responsabilidad.",
  alternates: {
    canonical: "https://app.noova360.com/terminos"
  },
  openGraph: {
    title: "Terms and Conditions – Términos de Servicio – Noova 360",
    url: "https://app.noova360.com/terminos",
    siteName: "Noova 360",
    locale: "es_CO",
    type: "website"
  }
};

const SECTIONS = [
  {
    num: 1,
    title: "Quiénes somos y aceptación de estos términos",
    content: (
      <>
        <p>
          <strong>Noova 360</strong> es un software como servicio (SaaS) operado por{" "}
          <strong>DOMAL SAS</strong> (&ldquo;Noova&rdquo;, &ldquo;nosotros&rdquo;), sociedad domiciliada en Bogotá, Colombia. Al
          crear una cuenta, contratar un plan o usar la plataforma, aceptas estos Términos de Servicio en
          nombre tuyo o de la empresa a la que representas.
        </p>
        <p>
          Si no estás de acuerdo con estos términos, no debes usar Noova 360. Si contratas en nombre de
          una empresa, declaras tener autoridad para vincularla a este acuerdo.
        </p>
      </>
    )
  },
  {
    num: 2,
    title: "Qué es el servicio",
    content: (
      <>
        <p>
          Noova 360 es una plataforma de atención al cliente e inteligencia artificial: agentes de IA que
          atienden por WhatsApp, voz y chat web, un CRM que se alimenta de esas conversaciones, y módulos
          adicionales de agendamiento, campañas de voz, escaneo de documentos y cotizaciones. Los detalles
          de cada plan, sus créditos y funcionalidades incluidas se muestran en la plataforma y pueden
          actualizarse periódicamente.
        </p>
      </>
    )
  },
  {
    num: 3,
    title: "Quién puede contratar",
    content: (
      <>
        <p>
          Noova 360 es un servicio para empresas (B2B). No está dirigido a consumidores individuales que
          contraten a título personal. Debes ser mayor de edad y tener capacidad legal para contratar en
          nombre de tu empresa.
        </p>
      </>
    )
  },
  {
    num: 4,
    title: "Cuenta y responsabilidad sobre credenciales",
    content: (
      <>
        <p>
          Eres responsable de mantener la confidencialidad de tus credenciales de acceso y de toda
          actividad que ocurra bajo tu cuenta. Notifícanos de inmediato si sospechas un uso no autorizado.
          Puedes gestionar usuarios adicionales de tu equipo dentro de los límites que permita tu plan.
        </p>
      </>
    )
  },
  {
    num: 5,
    title: "Planes, precios y facturación",
    content: (
      <>
        <p>
          Los planes de pago se cobran por adelantado, de forma mensual y recurrente, en dólares
          estadounidenses (USD). El pago es procesado por{" "}
          <strong>Paddle.com Market Limited</strong>, nuestro revendedor autorizado y Merchant of Record:
          Paddle emite la factura de la compra, aparece en tu extracto bancario y gestiona la recaudación.
        </p>
        <p>
          Los precios pueden cambiar; si un cambio te afecta, te avisaremos con al menos 30 días de
          anticipación antes de que aplique a tu próxima renovación. El detalle completo de cancelaciones
          y reembolsos está en nuestra{" "}
          <Link href="/reembolsos" className="text-[#99c9ff] hover:underline">
            Política de Reembolsos
          </Link>
          .
        </p>
      </>
    )
  },
  {
    num: 6,
    title: "Créditos y consumo",
    content: (
      <>
        <p>
          Cada plan incluye una asignación mensual de créditos que se consumen según el uso de la
          plataforma (mensajes de WhatsApp, minutos de voz, documentos procesados, etc.). Los créditos no
          consumidos <strong>no se acumulan</strong> al siguiente ciclo. Si tu saldo se agota, algunas
          funciones pueden pausarse hasta la siguiente renovación o hasta que compres créditos adicionales,
          cuando esa opción esté disponible.
        </p>
      </>
    )
  },
  {
    num: 7,
    title: "Uso aceptable",
    content: (
      <>
        <p>No puedes usar Noova 360 para:</p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>Enviar spam, mensajes masivos no solicitados o contenido engañoso.</li>
          <li>Actividades ilegales, fraudulentas o que infrinjan derechos de terceros.</li>
          <li>
            Violar las políticas de las plataformas de terceros que integramos, en particular las{" "}
            <a
              href="https://www.whatsapp.com/legal/business-policy/"
              target="_blank"
              rel="noreferrer"
              className="text-[#99c9ff] hover:underline"
            >
              políticas de WhatsApp Business Platform de Meta
            </a>{" "}
            y los términos de Google Calendar cuando conectes esa integración.
          </li>
          <li>Intentar acceder sin autorización a sistemas de Noova o de otros clientes.</li>
          <li>Realizar ingeniería inversa, copiar o revender la plataforma sin autorización escrita.</li>
        </ul>
        <p>
          Podemos suspender o cancelar cuentas que incumplan esta sección, conforme a la sección 12.
        </p>
      </>
    )
  },
  {
    num: 8,
    title: "Respuestas generadas por inteligencia artificial",
    content: (
      <>
        <p>
          Los agentes de Noova 360 usan modelos de inteligencia artificial de terceros para generar
          respuestas automáticas dirigidas a tus clientes o usuarios finales. <strong>Estas respuestas
          pueden contener errores, imprecisiones u omisiones</strong> — la IA no sustituye el criterio
          profesional humano, especialmente en información sensible o regulada (por ejemplo, coberturas,
          precios o condiciones de pólizas de seguros).
        </p>
        <p>
          Eres responsable de configurar, supervisar y revisar el comportamiento de tus agentes de IA, y de
          validar cualquier información antes de que tenga efectos vinculantes frente a tus propios
          clientes. Noova 360 no garantiza la exactitud, integridad ni idoneidad de ninguna respuesta
          generada por IA para un caso particular, y no asume responsabilidad por decisiones que tomes o
          que tus clientes tomen basándose en ellas.
        </p>
      </>
    )
  },
  {
    num: 9,
    title: "Propiedad intelectual",
    content: (
      <>
        <p>
          Noova 360, su software, marca y diseño son propiedad de DOMAL SAS. Te otorgamos una licencia
          limitada, no exclusiva e intransferible para usar la plataforma mientras tu cuenta esté activa.
          Tú conservas la propiedad de tus datos, contenidos y conversaciones cargadas en la plataforma;
          nos concedes solo la licencia necesaria para procesarlos y prestarte el servicio.
        </p>
      </>
    )
  },
  {
    num: 10,
    title: "Datos personales",
    content: (
      <>
        <p>
          El tratamiento de datos personales, tuyos y de tus usuarios finales, se rige por nuestra{" "}
          <Link href="/privacy" className="text-[#99c9ff] hover:underline">
            Política de Privacidad
          </Link>
          , que forma parte de este acuerdo.
        </p>
      </>
    )
  },
  {
    num: 11,
    title: "Integraciones y servicios de terceros",
    content: (
      <>
        <p>
          Noova 360 se conecta con servicios de terceros como WhatsApp Business Platform (Meta), Google
          Calendar, proveedores de telefonía y modelos de IA. Estas integraciones dependen de la
          disponibilidad y condiciones de esos terceros, sobre las que no tenemos control. No somos
          responsables por interrupciones, cambios o suspensiones originados en plataformas de terceros.
        </p>
      </>
    )
  },
  {
    num: 12,
    title: "Disponibilidad del servicio",
    content: (
      <>
        <p>
          Trabajamos con diligencia razonable para mantener la plataforma disponible y operativa, pero no
          garantizamos un porcentaje específico de disponibilidad (SLA) ni un servicio libre de
          interrupciones. Podemos realizar mantenimientos programados o no programados, e intentaremos
          avisarte con anticipación razonable cuando sea posible.
        </p>
      </>
    )
  },
  {
    num: 13,
    title: "Suspensión y terminación",
    content: (
      <>
        <p>
          Podemos suspender tu acceso si tu cuenta tiene pagos vencidos más allá del periodo de gracia de
          tu plan, o si incumples la sección de uso aceptable. En caso de incumplimiento grave, podemos
          terminar tu cuenta de inmediato.
        </p>
        <p>
          Puedes cancelar tu suscripción en cualquier momento; conservas acceso hasta el final del ciclo ya
          pagado. Nosotros también podemos terminar este acuerdo por conveniencia, dando aviso previo de al
          menos 30 días, salvo en casos de incumplimiento grave o riesgo legal, en los que la terminación
          puede ser inmediata.
        </p>
      </>
    )
  },
  {
    num: 14,
    title: "Garantías y exención de responsabilidad",
    content: (
      <>
        <p>
          Noova 360 se ofrece &ldquo;tal cual&rdquo; y &ldquo;según disponibilidad&rdquo;. En la medida permitida por la ley, no
          otorgamos garantías implícitas de comerciabilidad, idoneidad para un propósito particular o no
          infracción, más allá de lo expresamente indicado en estos términos.
        </p>
      </>
    )
  },
  {
    num: 15,
    title: "Límite de responsabilidad",
    content: (
      <>
        <p>
          En la máxima medida permitida por la ley, la responsabilidad total de Noova 360 frente a ti por
          cualquier reclamo relacionado con el servicio se limita al{" "}
          <strong>monto que pagaste por tu plan en el último ciclo de facturación mensual</strong>. No
          seremos responsables por daños indirectos, incidentales, especiales, consecuentes o lucro
          cesante, incluso si fuimos advertidos de la posibilidad de dichos daños.
        </p>
        <p>
          Esta limitación no aplica a obligaciones que no puedan limitarse por ley, ni a los casos de dolo
          o culpa grave.
        </p>
      </>
    )
  },
  {
    num: 16,
    title: "Indemnización",
    content: (
      <>
        <p>
          Aceptas indemnizar a Noova 360 frente a reclamos de terceros que surjan de tu uso indebido de la
          plataforma, del contenido que envíes a través de ella, o del incumplimiento de estos términos o
          de la normativa aplicable a tu operación (por ejemplo, regulación del sector asegurador, cuando
          corresponda).
        </p>
      </>
    )
  },
  {
    num: 17,
    title: "Confidencialidad",
    content: (
      <>
        <p>
          Ambas partes se comprometen a proteger la información confidencial de la otra que conozcan con
          ocasión de este acuerdo, y a no divulgarla a terceros salvo autorización, obligación legal o
          requerimiento de autoridad competente.
        </p>
      </>
    )
  },
  {
    num: 18,
    title: "Ley aplicable y jurisdicción",
    content: (
      <>
        <p>
          Este acuerdo se rige por las leyes de la República de Colombia. Cualquier controversia que no se
          resuelva de forma directa entre las partes se someterá a los jueces competentes de Bogotá,
          Colombia, sin perjuicio de las condiciones de compra que Paddle aplique como Merchant of Record
          respecto del procesamiento del pago.
        </p>
      </>
    )
  },
  {
    num: 19,
    title: "Modificaciones a estos términos",
    content: (
      <>
        <p>
          Podemos actualizar estos términos ocasionalmente. Si el cambio es material, te avisaremos con al
          menos 30 días de anticipación por correo electrónico o dentro de la plataforma. El uso continuado
          del servicio después de esa fecha implica tu aceptación de los nuevos términos.
        </p>
      </>
    )
  },
  {
    num: 20,
    title: "Disposiciones generales",
    content: (
      <>
        <p>
          Si alguna cláusula de este acuerdo resulta inválida o inaplicable, el resto permanece vigente. No
          puedes ceder este acuerdo sin nuestro consentimiento previo por escrito. Estos términos, junto con
          la Política de Privacidad y la Política de Reembolsos, constituyen el acuerdo completo entre las
          partes respecto del uso de Noova 360.
        </p>
      </>
    )
  },
  {
    num: 21,
    title: "Contacto",
    content: (
      <>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>
            <strong>Correo:</strong>{" "}
            <a href="mailto:info@bgsoluciones.com.co" className="text-[#99c9ff] hover:underline">
              info@bgsoluciones.com.co
            </a>
          </li>
          <li><strong>Empresa:</strong> DOMAL SAS / Noova 360</li>
          <li><strong>Ciudad:</strong> Bogotá, Colombia</li>
          <li>
            <strong>Sitio web:</strong>{" "}
            <a href="https://app.noova360.com" className="text-[#99c9ff] hover:underline">
              app.noova360.com
            </a>
          </li>
        </ul>
      </>
    )
  }
] as const;

export default function TermsOfServicePage() {
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
          Terms and Conditions / Términos de Servicio
        </h1>
        <p className="text-sm text-gray-500 mb-8 pb-8 border-b border-white/[.08]">
          Última actualización: 31 de julio de 2026 · Vigente desde: 31 de julio de 2026
        </p>

        <div className="rounded-xl border border-[#0f7eff]/25 bg-[#0f7eff]/[.08] px-5 py-4 mb-10 text-sm text-gray-300 leading-relaxed">
          Estos términos regulan el uso de Noova 360, la plataforma de atención al cliente e inteligencia
          artificial operada por DOMAL SAS. Junto con nuestra Política de Privacidad y Política de
          Reembolsos, forman el acuerdo completo entre tu empresa y nosotros.
        </div>

        <div className="space-y-10">
          {SECTIONS.map((section) => (
            <section key={section.num}>
              <h2 className="flex items-center gap-3 text-lg font-bold text-white mb-4 pb-3 border-b border-white/[.08]">
                <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-[#0f7eff] text-xs font-bold text-white shrink-0">
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
        <p className="mb-3 space-x-3">
          <Link href="/terminos" className="text-[#99c9ff] hover:underline">Terms and Conditions</Link>
          <span>·</span>
          <Link href="/reembolsos" className="text-[#99c9ff] hover:underline">Refund Policy</Link>
          <span>·</span>
          <Link href="/privacy" className="text-[#99c9ff] hover:underline">Privacy Policy</Link>
        </p>
        <p>© 2026 Noova 360 · DOMAL SAS · Bogotá, Colombia</p>
        <p className="mt-2 text-xs text-gray-600 max-w-xl mx-auto">
          Los pagos de Noova 360 son procesados por Paddle.com Market Limited, revendedor autorizado y
          Merchant of Record.
        </p>
      </footer>
    </div>
  );
}
