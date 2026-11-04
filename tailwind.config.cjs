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
        alat: "hsl(var(--c-alat) / <alpha-value>)",
        danger: "hsl(var(--c-danger) / <alpha-value>)",
      },
      fontFamily: {
        sans: ["Segoe UI Variable Text", "Segoe UI", "system-ui", "sans-serif"],
        mono: ["Cascadia Mono", "Cascadia Code", "Consolas", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};
