/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        shell: "#121214",
        panel: "#18181B",
        panel2: "#27272A",
        line: "#2E2E33",
        ink: "#F4F4F5",
        muted: "#A1A1AA",
        accent: "#22C55E",
        accent2: "#10B981",
        danger: "#EF4444",
      },
      fontFamily: {
        sans: ["Inter", "Segoe UI", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Cascadia Code", "Consolas", "monospace"],
      },
    },
  },
  plugins: [],
};
