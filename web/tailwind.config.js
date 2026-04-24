/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: {
          950: "#060b14",
          900: "rgba(8, 16, 28, 0.88)",
          800: "rgba(12, 22, 40, 0.92)",
          700: "rgba(18, 30, 52, 0.96)",
        },
        polka: {
          50: "#f0fbff",
          100: "#d9f6ff",
          200: "#b3edff",
          300: "#7de2ff",
          400: "#38d4ff",
          500: "#00c8ff",
          600: "#00a5d4",
          700: "#0084ab",
          800: "#006d8a",
          900: "#005a72",
        },
        accent: {
          blue: "#4cc2ff",
          purple: "#a78bfa",
          green: "#34d399",
          orange: "#fb923c",
          red: "#f87171",
          yellow: "#fbbf24",
        },
        text: {
          primary: "#f0eef5",
          secondary: "#9b97a8",
          tertiary: "#6b6780",
          muted: "#4a4660",
        },
      },
      fontFamily: {
        display: ['"Instrument Sans"', "system-ui", "-apple-system", "sans-serif"],
        body: ['"Instrument Sans"', "system-ui", "-apple-system", "sans-serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
      },
      animation: {
        "fade-in": "fadeIn 0.4s ease-out forwards",
        "slide-up": "slideUp 0.5s ease-out forwards",
        "pulse-slow": "pulse 3s ease-in-out infinite",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      borderRadius: {
        xl: "1rem",
        "2xl": "1.25rem",
      },
      boxShadow: {
        glow: "0 0 24px -4px rgba(0, 200, 255, 0.18)",
        "glow-lg": "0 0 48px -8px rgba(0, 200, 255, 0.25)",
        card: "0 1px 3px 0 rgba(0, 0, 0, 0.3), 0 1px 2px -1px rgba(0, 0, 0, 0.3)",
        "card-hover":
          "0 4px 12px 0 rgba(0, 0, 0, 0.4), 0 2px 4px -1px rgba(0, 0, 0, 0.3)",
      },
    },
  },
  plugins: [],
};
