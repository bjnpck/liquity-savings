import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bg:      "#1a1a1a",
        surface: "#222222",
        raised:  "#2a2a2a",
        "c-text":  "#e8e8e6",
        "c-muted": "#888884",
        "c-dim":   "#555552",
        "c-red":   "#e05c4a",
        "c-amber": "#d4883a",
        "c-green": "#5a9e62",
        cta:     "#c9901e",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
