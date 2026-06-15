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
        },
      },
    },
  },
  plugins: [],
};
export default config;
