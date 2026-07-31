import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { getMarketingSiteUrl } from "@/lib/marketing-site-url";

export const metadata: Metadata = {
  title: "Política de Reembolsos – Noova 360",
  description:
    "Política de reembolsos de Noova 360 (DOMAL SAS). Cómo funcionan los cobros, la prueba gratuita, las cancelaciones y las solicitudes de reembolso.",
  alternates: {
    canonical: "https://app.noova360.com/reembolsos"
  },
  openGraph: {
    title: "Política de Reembolsos – Noova 360",
    url: "https://app.noova360.com/reembolsos",
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
          <strong>Noova 360</strong> es un software como servicio (SaaS) operado por{" "}
          <strong>DOMAL SAS</strong>, con domicilio en Bogotá, Colombia. Los pagos de Noova 360 son
          procesados por <strong>Paddle.com Market Limited</strong> ("Paddle"), nuestro revendedor
          autorizado y Merchant of Record. Esto significa que Paddle es la entidad que aparece en tu
          extracto bancario, emite la factura de la compra y procesa cualquier reembolso — nosotros
          definimos la política, pero la ejecución del reembolso la hace Paddle.
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
    title: "Prueba gratuita",
    content: (
      <>
        <p>
          El plan <strong>Explorador</strong> es gratuito durante 14 días y no requiere tarjeta de
          crédito. Te recomendamos usar este periodo para evaluar si Noova 360 se ajusta a tu operación
          antes de contratar un plan de pago (Esencial, Crecimiento o Escala).
        </p>
      </>
    )
  },
  {
    num: 3,
    title: "Cómo funcionan los cobros",
    content: (
      <>
        <p>
          Los planes de pago se facturan por adelantado, de forma mensual y recurrente, en dólares
          estadounidenses (USD). Cada cobro te da acceso a la plataforma y a los créditos incluidos en tu
          plan durante ese ciclo de 30 días.
        </p>
      </>
    )
  },
  {
    num: 4,
    title: "Política general: sin reembolsos de ciclos ya facturados",
    content: (
      <>
        <p>
          Una vez procesado el cobro de un ciclo mensual, <strong>ese cobro no es reembolsable</strong>,
          independientemente de cuántos créditos hayas consumido dentro del periodo. Consideramos que el
          periodo de prueba gratuita de 14 días del plan Explorador es tiempo suficiente para decidir si
          quieres contratar un plan de pago.
        </p>
        <p>
          Puedes cancelar la renovación automática de tu suscripción en cualquier momento desde{" "}
          <strong>Facturación → Planes</strong> dentro de la plataforma, o escribiéndonos. Al cancelar,
          conservas acceso a tu plan actual y a los créditos ya incluidos hasta el final del ciclo que ya
          pagaste; a partir de ahí no se generan nuevos cobros.
        </p>
      </>
    )
  },
  {
    num: 5,
    title: "Excepciones — cuándo sí procede un reembolso",
    content: (
      <>
        <p>Evaluamos reembolsos, totales o parciales, caso por caso cuando se trata de:</p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>
            <strong>Cobro duplicado o por error técnico</strong> — por ejemplo, si un fallo del sistema
            generó dos cobros por el mismo periodo.
          </li>
          <li>
            <strong>Cargo no autorizado</strong> — uso fraudulento de un medio de pago que no fue
            autorizado por el titular de la cuenta.
          </li>
          <li>
            <strong>Falla del servicio atribuible a Noova 360</strong> — indisponibilidad prolongada de
            la plataforma que te impidió usar el servicio durante una parte significativa del ciclo
            facturado.
          </li>
        </ul>
        <p>
          Fuera de estos casos, no ofrecemos reembolsos por cambio de opinión, por no haber usado la
          plataforma, ni por créditos no consumidos al finalizar un ciclo (los créditos no son
          acumulables entre periodos).
        </p>
      </>
    )
  },
  {
    num: 6,
    title: "Cómo solicitar un reembolso",
    content: (
      <>
        <p>
          Escríbenos a{" "}
          <a href="mailto:info@bgsoluciones.com.co" className="text-[#a5a5ff] hover:underline">
            info@bgsoluciones.com.co
          </a>{" "}
          indicando el motivo de tu solicitud y, si aplica, el número de transacción de Paddle. Revisamos
          cada solicitud manualmente y te respondemos en un plazo máximo de{" "}
          <strong>5 días hábiles</strong>. Si aprobamos el reembolso, coordinamos con Paddle su ejecución;
          el dinero puede tardar algunos días hábiles adicionales en reflejarse en tu medio de pago,
          según los tiempos de tu banco o entidad emisora.
        </p>
      </>
    )
  },
  {
    num: 7,
    title: "Reembolsos que procesa Paddle directamente",
    content: (
      <>
        <p>
          Como Merchant of Record, Paddle puede, en determinados casos y bajo sus propias políticas de
          protección al comprador o por obligaciones legales en la jurisdicción del comprador, conceder un
          reembolso de forma independiente a lo dispuesto en esta política. Puedes consultar las
          condiciones de Paddle para compradores en{" "}
          <a
            href="https://www.paddle.com/legal/checkout-buyer-terms"
            target="_blank"
            rel="noreferrer"
            className="text-[#a5a5ff] hover:underline"
          >
            paddle.com/legal
          </a>
          .
        </p>
      </>
    )
  },
  {
    num: 8,
    title: "Contacto",
    content: (
      <>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>
            <strong>Correo:</strong>{" "}
            <a href="mailto:info@bgsoluciones.com.co" className="text-[#a5a5ff] hover:underline">
              info@bgsoluciones.com.co
            </a>
          </li>
          <li><strong>Empresa:</strong> DOMAL SAS / Noova 360</li>
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

export default function RefundPolicyPage() {
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
          Política de Reembolsos
        </h1>
        <p className="text-sm text-gray-500 mb-8 pb-8 border-b border-white/[.08]">
          Última actualización: 31 de julio de 2026 · Vigente desde: 31 de julio de 2026
        </p>

        <div className="rounded-xl border border-[#5b5bf6]/25 bg-[#5b5bf6]/[.08] px-5 py-4 mb-10 text-sm text-gray-300 leading-relaxed">
          Esta política explica cómo funcionan los cobros de Noova 360, qué cubre la prueba gratuita, y
          cuándo y cómo puedes solicitar un reembolso. Los pagos son procesados por Paddle, nuestro
          Merchant of Record.
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
        <p className="mb-3 space-x-3">
          <Link href="/privacy" className="text-[#a5a5ff] hover:underline">Política de Privacidad</Link>
          <span>·</span>
          <Link href="/terminos" className="text-[#a5a5ff] hover:underline">Términos de Servicio</Link>
          <span>·</span>
          <Link href="/reembolsos" className="text-[#a5a5ff] hover:underline">Política de Reembolsos</Link>
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
