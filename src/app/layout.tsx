import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Noova 360",
  description: "AI Platform for Insurance Agents",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
