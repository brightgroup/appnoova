import type { ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import { getMarketingSiteUrl } from "@/lib/marketing-site-url";
import { LEGAL_ENTITY, type LegalBlock, type LegalDocument } from "@/lib/legal/legal-documents";

const LINK_CLASS = "text-[#99c9ff] hover:underline";

/** Convierte el marcado **negrita** y [texto](url) del contenido legal en nodos. */
function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    if (m[1] !== undefined) {
      nodes.push(<strong key={m.index}>{renderInline(m[1])}</strong>);
    } else {
      const [label, href] = [m[2], m[3]];
      nodes.push(
        href.startsWith("/") ? (
          <Link key={m.index} href={href} className={LINK_CLASS}>{label}</Link>
        ) : (
          <a
            key={m.index}
            href={href}
            className={LINK_CLASS}
            {...(href.startsWith("http") ? { target: "_blank", rel: "noreferrer" } : {})}
          >
            {label}
          </a>
        )
      );
    }
    last = re.lastIndex;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function Block({ block }: { block: LegalBlock }) {
  if ("p" in block) return <p>{renderInline(block.p)}</p>;
  if ("ul" in block) {
    return (
      <ul className="list-disc pl-5 space-y-1.5">
        {block.ul.map((item, i) => <li key={i}>{renderInline(item)}</li>)}
      </ul>
    );
  }
  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/[.08] px-5 py-4 text-sm text-amber-100/90">
      <p className="text-xs font-semibold uppercase tracking-wide text-amber-300 mb-2">{block.note.title}</p>
      <p>{renderInline(block.note.text)}</p>
    </div>
  );
}

export function LegalDocumentPage({ doc }: { doc: LegalDocument }) {
  const marketingUrl = getMarketingSiteUrl();
  return (
    <div className="min-h-screen bg-[#06070d] text-white flex flex-col">
      <header className="sticky top-0 z-50 flex items-center justify-between h-14 px-6 bg-[#06070d]/90 backdrop-blur-xl border-b border-white/[.06]">
        <a href={marketingUrl} className="relative h-8 w-28 sm:w-32 flex-shrink-0">
          <Image src="/logo-noova.png" alt="Noova 360" fill className="object-contain object-left" priority />
        </a>
        <Link
          href="/login"
          className="inline-flex items-center justify-center h-9 px-4 rounded-lg border border-white/[.1] text-sm font-medium text-white hover:bg-white/[.05] transition-all"
        >
          Ingresar
        </Link>
      </header>

      <main className="flex-1 mx-auto w-full max-w-3xl px-6 py-12 sm:py-16">
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white mb-2">{doc.webTitle ?? doc.title}</h1>
        <p className="text-sm text-gray-500 mb-8 pb-8 border-b border-white/[.08]">
          Última actualización: {doc.updated} · Vigente desde: {doc.effective}
        </p>

        <div className="rounded-xl border border-[#0f7eff]/25 bg-[#0f7eff]/[.08] px-5 py-4 mb-10 text-sm text-gray-300 leading-relaxed">
          {renderInline(doc.intro)}
        </div>

        <div className="space-y-10">
          {doc.sections.map((section, i) => (
            <section key={section.title}>
              <h2 className="flex items-center gap-3 text-lg font-bold text-white mb-4 pb-3 border-b border-white/[.08]">
                <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-[#0f7eff] text-xs font-bold text-white shrink-0">
                  {i + 1}
                </span>
                {section.title}
              </h2>
              <div className="space-y-3 text-[15px] text-gray-300 leading-relaxed [&_strong]:text-gray-200 [&_ul]:mb-1">
                {section.blocks.map((block, j) => <Block key={j} block={block} />)}
              </div>
            </section>
          ))}
        </div>
      </main>

      <footer className="border-t border-white/[.06] py-8 px-6 text-center text-sm text-gray-500 leading-relaxed">
        <p className="mb-3 flex flex-wrap justify-center gap-x-3 gap-y-1">
          <Link href="/terminos" className={LINK_CLASS}>Terms and Conditions</Link>
          <span>·</span>
          <Link href="/privacy" className={LINK_CLASS}>Privacy Policy</Link>
          <span>·</span>
          <Link href="/tratamiento-datos" className={LINK_CLASS}>Política de Tratamiento de Datos</Link>
          <span>·</span>
          <Link href="/reembolsos" className={LINK_CLASS}>Refund Policy</Link>
        </p>
        <p>© 2026 {LEGAL_ENTITY.brand} · {LEGAL_ENTITY.name} · NIT {LEGAL_ENTITY.nit} · Bogotá, Colombia</p>
        {doc.footerNote && <p className="mt-2 text-xs text-gray-600 max-w-xl mx-auto">{doc.footerNote}</p>}
      </footer>
    </div>
  );
}
