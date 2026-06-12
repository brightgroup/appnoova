import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Dev usa .next-dev (npm run dev) para no pisar el build de producción (.next).
  distDir: process.env.NEXT_DIST_DIR || ".next",
  reactStrictMode: true,
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
