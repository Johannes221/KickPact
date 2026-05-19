import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Brand
        accent: {
          DEFAULT: "#01C457", // Primary green — sampled from logo
          dark: "#00563A",
          muted: "#D8F5E5"
        },
        brand: {
          primary: "#01C457",
          "dark-green": "#00563A",
          "night-navy": "#1A1A2E",
          "alert-red": "#FF3127",
          "off-white": "#F5F8F5",
          neutral: "#CDD2D1"
        }
      },
      fontFamily: {
        display: ["var(--font-display)", "Inter", "system-ui", "sans-serif"],
        sans: ["var(--font-sans)", "Inter", "system-ui", "sans-serif"]
      }
    }
  },
  plugins: []
};

export default config;
