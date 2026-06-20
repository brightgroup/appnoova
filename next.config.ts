import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Dev usa .next-dev (npm run dev) para no pisar el build de producción (.next).
  distDir: process.env.NEXT_DIST_DIR || ".next",
  reactStrictMode: true,
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
  }
};

export default nextConfig;
