import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "#f6f2eb",
        surface: "#fffaf3",
        border: "#e6dfd2",
        text: "#121212",
        muted: "#666159",
        accent: "#2837a1",
        accentSoft: "#e5e8fb",
        success: "#1e7d50",
        warning: "#9a6c11",
        danger: "#a63d3d",
      },
      boxShadow: {
        soft: "0 10px 30px rgba(18, 18, 18, 0.06)",
      },
      borderRadius: {
        xl2: "1.25rem",
      },
    },
  },
  plugins: [],
};

export default config;
