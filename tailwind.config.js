/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "#000000",
        surface: "#0a0a0a",
        elevated: "#111111",
        border: {
          DEFAULT: "#262626",
          subtle: "#1a1a1a",
        },
        fg: "#ededed",
        muted: "#888888",
        accent: {
          DEFAULT: "#0070f3",
          hover: "#0060df",
        },
        success: "#50e3c2",
        danger: "#ff5555",
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};
