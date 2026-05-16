import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#070A12",
        panel: "#0E1422",
        line: "rgba(255,255,255,0.12)",
        lantern: {
          mint: "#8FF7D0",
          blue: "#77A7FF",
          violet: "#A78BFA",
          gold: "#F6D68A",
        },
      },
      boxShadow: {
        glow: "0 0 80px rgba(119, 167, 255, 0.20)",
        card: "0 24px 80px rgba(0, 0, 0, 0.35)",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "Inter", "ui-sans-serif", "system-ui"],
      },
    },
  },
  plugins: [],
};

export default config;
