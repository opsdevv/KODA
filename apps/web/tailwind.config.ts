import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        cider: {
          bg: "#0d0d0f",
          surface: "#141418",
          panel: "#1a1a1f",
          border: "#2a2a32",
          accent: "#7c6cff",
          accentMuted: "#5a4fd4",
          text: "#e8e8ed",
          muted: "#8b8b96",
          success: "#3ecf8e",
          warning: "#f5a623",
          danger: "#ff5f57",
        },
      },
      fontFamily: {
        sans: ["system-ui", "sans-serif"],
        mono: ["Consolas", "monospace"],
      },
      animation: {
        "fade-in": "fadeIn 0.2s ease-out",
        "slide-in": "slideIn 0.25s ease-out",
      },
      keyframes: {
        fadeIn: { from: { opacity: "0" }, to: { opacity: "1" } },
        slideIn: { from: { transform: "translateY(4px)", opacity: "0" }, to: { transform: "translateY(0)", opacity: "1" } },
      },
    },
  },
  plugins: [],
};

export default config;
