import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import "./globals.css";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap"
});

export const metadata: Metadata = {
  title: "Noova 360",
  description: "Plataforma de IA para automatizar ventas, atención y seguimiento comercial",
  icons: {
    icon: [{ url: "/favicon.png", type: "image/png" }],
    apple: [{ url: "/favicon.png", type: "image/png" }]
  }
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className={poppins.className}>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
