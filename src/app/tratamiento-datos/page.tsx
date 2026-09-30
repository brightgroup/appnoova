import type { Metadata } from "next";
import { LegalDocumentPage } from "@/components/legal/LegalDocumentPage";
import { LEGAL_DOCUMENTS } from "@/lib/legal/legal-documents";

const doc = LEGAL_DOCUMENTS.tratamiento;

export const metadata: Metadata = {
  title: doc.metaTitle,
  description: doc.metaDescription,
  alternates: { canonical: "https://app.noova360.com/tratamiento-datos" },
  openGraph: {
    title: doc.metaTitle,
    url: "https://app.noova360.com/tratamiento-datos",
    siteName: "Noova 360",
    locale: "es_CO",
    type: "website"
  }
};

export default function DataTreatmentPolicyPage() {
  return <LegalDocumentPage doc={doc} />;
}
