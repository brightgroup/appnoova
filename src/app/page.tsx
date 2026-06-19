import type { Metadata } from "next";
import NoovaLandingPage from "@/components/landing/NoovaLandingPage";

export const metadata: Metadata = {
  title: "Noova 360 — Plataforma de IA empresarial",
  description:
    "Agentes de ia en voz, WhatsApp y web para cualquier empresa. Atención 24/7, captación de leads, CRM e inbox omnicanal en una sola plataforma."
};

export default function HomePage() {
  return <NoovaLandingPage />;
}
