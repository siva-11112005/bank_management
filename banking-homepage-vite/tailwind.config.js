/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: "#003087",
        secondary: "#00AEEF",
        accent: "#FFD700",
        background: "#F5F7FA",
      },
      fontFamily: {
        sans: ["Poppins", "Inter", "sans-serif"],
      },
      boxShadow: {
        "soft-lg": "0 10px 30px rgba(0, 48, 135, 0.12)",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(18px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-up": "fade-up 700ms ease-out both",
      },
    },
  },
  plugins: [],
};
