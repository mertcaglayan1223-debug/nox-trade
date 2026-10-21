import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        axiom: {
          bg: "#0a0d14",
          card: "#131823",
          cardHover: "#171f2e",
          border: "#232a3b",
          borderLight: "#2e384e",
          textPrimary: "#ffffff",
          textMuted: "#8a93a6",
          cyan: "#00d2ff",
          blue: "#3b82f6",
          green: "#05d686",
          crimson: "#ff2a5f",
          dock: "#0c1019",
        },
        background: "#0a0d14",
        card: "#131823",
        border: "#232a3b",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "Inter", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "sans-serif"],
        mono: ["var(--font-mono)", "'JetBrains Mono'", "SFMono-Regular", "Menlo", "Monaco", "Consolas", "monospace"],
      },
      boxShadow: {
        "cyan-glow": "0 0 12px rgba(0, 210, 255, 0.35)",
        "blue-glow": "0 0 12px rgba(59, 130, 246, 0.35)",
        "green-glow": "0 0 10px rgba(5, 214, 134, 0.3)",
      },
    },
  },
  plugins: [],
};

export default config;
