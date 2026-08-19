import type { Metadata, Viewport } from "next";
import { Poppins } from "next/font/google";
import "./mobile-app.css";
import { MOBILE_THEME_INIT_SCRIPT } from "./mobile-theme";
import { ServiceWorkerRegister } from "./ServiceWorkerRegister";

// Misma tipografía de marca que el dashboard (src/app/layout.tsx), cargada
// aparte para no depender de un archivo fuera de /m — Next dedupea la
// descarga de Google Fonts en build. Expuesta como variable para que
// mobile-app.css la use puntualmente (precios de leads), sin migrar todo
// /m fuera de su stack de sistema (--font-ui).
const poppins = Poppins({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-noova",
  display: "swap"
});

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
    // NO usar "black-translucent": bug de iOS reciente — dimensiona el web view
    // en (pantalla - barra de estado) pero lo ancla arriba del todo, dejando un
    // hueco muerto de 53pt en la parte inferior (medido con el panel de debug:
    // inner 759 vs screen 812, envT 53). Con "black" la ventana se posiciona
    // debajo de la barra de estado y sí llega hasta el borde inferior.
    statusBarStyle: "black",
    title: "Noova360"
  },
  // Next 15.2 no emite apple-mobile-web-app-capable desde appleWebApp.capable
  // (verificado en el HTML servido). Sin esa meta, iOS no concede pantalla
  // completa real al instalar: reserva la franja del home indicator y la app
  // queda "cortada" abajo. Se fuerza explícitamente.
  other: {
    "apple-mobile-web-app-capable": "yes",
    "mobile-web-app-capable": "yes"
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
    <div id="nv-m-root" className={`nv-m-app ${poppins.variable}`} suppressHydrationWarning>
      <script dangerouslySetInnerHTML={{ __html: MOBILE_THEME_INIT_SCRIPT }} />
      <ServiceWorkerRegister />
      {children}
    </div>
  );
}
