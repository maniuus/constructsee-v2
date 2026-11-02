/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        shell: "hsl(var(--c-shell) / <alpha-value>)",
        panel: "hsl(var(--c-panel) / <alpha-value>)",
        panel2: "hsl(var(--c-panel2) / <alpha-value>)",
        line: "hsl(var(--c-line) / <alpha-value>)",
        ink: "hsl(var(--c-ink) / <alpha-value>)",
        muted: "hsl(var(--c-muted) / <alpha-value>)",
        accent: "hsl(var(--c-accent) / <alpha-value>)",
        accent2: "hsl(var(--c-accent2) / <alpha-value>)",
        danger: "hsl(var(--c-danger) / <alpha-value>)",
      },
      fontFamily: {
        sans: ["Inter", "Segoe UI", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Cascadia Code", "Consolas", "monospace"],
      },
    },
  },
  plugins: [],
};
