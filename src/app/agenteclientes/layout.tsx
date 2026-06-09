import type { Metadata } from "next";
import "./agente-clientes.css";

export const metadata: Metadata = {
  title: "Asistente de Seguros | Noova 360",
  description: "Tu asistente virtual de seguros disponible 24/7",
  robots: { index: false, follow: false }
};

export default function AgenteClientesLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return children;
}
