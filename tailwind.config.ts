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
          surface: "#272727",
        },
      },
    },
  },
  plugins: [],
};
export default config;
