import type { Metadata, Viewport } from "next";
import "./mobile-app.css";
import { MOBILE_THEME_INIT_SCRIPT } from "./mobile-theme";
import { ServiceWorkerRegister } from "./ServiceWorkerRegister";

// Metadata específica de /m — Next.js la fusiona con la del layout raíz sin
// tocar src/app/layout.tsx; icons/manifest de acá reemplazan a los del
// dashboard SOLO para páginas bajo /m.
export const metadata: Metadata = {
  title: "Noova360",
  description: "Chats y facturación de tu negocio, en un solo lugar.",
  manifest: "/m-manifest.json",
  icons: {
    icon: [{ url: "/icons/m-icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icons/m-apple-touch-icon.png", sizes: "180x180", type: "image/png" }]
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Noova360"
  }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#141518"
};

export default function MobileLayout({ children }: { children: React.ReactNode }) {
  return (
    <div id="nv-m-root" className="nv-m-app" suppressHydrationWarning>
      <script dangerouslySetInnerHTML={{ __html: MOBILE_THEME_INIT_SCRIPT }} />
      <ServiceWorkerRegister />
      {children}
    </div>
  );
}
