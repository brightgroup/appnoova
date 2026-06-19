import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        noova: {
          main: "var(--nv-bg-main)",
          surface: "var(--nv-bg-surface)",
          elevated: "var(--nv-bg-elevated)",
          accent: "var(--nv-accent)",
        },
      },
      boxShadow: {
        "nv-sm": "var(--nv-shadow-sm)",
        "nv-md": "var(--nv-shadow-md)",
        "nv-lg": "var(--nv-shadow-lg)",
      },
    },
  },
  plugins: [],
};
export default config;
