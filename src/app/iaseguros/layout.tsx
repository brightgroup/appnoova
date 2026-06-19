import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Noova 360 — IA para seguros",
  description:
    "Agentes de voz y WhatsApp para corredores y aseguradoras: cotizaciones, renovaciones, atención 24/7 y operación documental con IA."
};

export default function IaSegurosLayout({ children }: { children: React.ReactNode }) {
  return children;
}
