import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Dev usa .next-dev (npm run dev) para no pisar el build de producción (.next).
  distDir: process.env.NEXT_DIST_DIR || ".next",
  reactStrictMode: true,
  // Gemini Live + ws en rutas API: evitar bundle roto (t.mask is not a function en Docker).
  serverExternalPackages: ["@google/genai", "ws", "bufferutil", "utf-8-validate"],
  webpack: (config, { dev }) => {
    if (dev) {
      // Evita EMFILE en macOS cuando hay muchos archivos bajo watch.
      config.watchOptions = {
        poll: 1000,
        aggregateTimeout: 300,
        ignored: ["**/node_modules/**", "**/.next-dev/**", "**/.next/**"],
      };
    }
    return config;
  },
  async headers() {
    return [
      {
        source: "/widget/:path*",
        headers: [{ key: "Content-Security-Policy", value: "frame-ancestors *" }]
      }
    ];
  },
  async redirects() {
    const marketing =
      process.env.NEXT_PUBLIC_MARKETING_URL?.replace(/\/$/, "").trim() ||
      "https://noova360.com";
    return [
      {
        source: "/iaseguros",
        destination: `${marketing}/iaseguros`,
        permanent: true
      },
      {
        source: "/iaseguros/:path*",
        destination: `${marketing}/iaseguros/:path*`,
        permanent: true
      }
    ];
  }
};

export default nextConfig;
