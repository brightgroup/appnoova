import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        noova: {
          main: "#212121",
          surface: "#2d2d2d",
        },
      },
    },
  },
  plugins: [],
};
export default config;
