import type { Metadata } from "next";
import { LegalDocumentPage } from "@/components/legal/LegalDocumentPage";
import { LEGAL_DOCUMENTS } from "@/lib/legal/legal-documents";

const doc = LEGAL_DOCUMENTS.reembolsos;

export const metadata: Metadata = {
  title: doc.metaTitle,
  description: doc.metaDescription,
  alternates: { canonical: "https://app.noova360.com/reembolsos" },
  openGraph: {
    title: doc.metaTitle,
    url: "https://app.noova360.com/reembolsos",
    siteName: "Noova 360",
    locale: "es_CO",
    type: "website"
  }
};

export default function RefundPolicyPage() {
  return <LegalDocumentPage doc={doc} />;
}
