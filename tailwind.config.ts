import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        accent: { DEFAULT: "#FF5722", muted: "#FFE0B2" }
      },
      fontFamily: {
        display: ["var(--font-display)", "Anton", "sans-serif"],
        sans: ["var(--font-sans)", "Inter", "sans-serif"]
      }
    }
  },
  plugins: []
};

export default config;
