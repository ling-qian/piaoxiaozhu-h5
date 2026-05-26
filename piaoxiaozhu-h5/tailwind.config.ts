import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#FF6B35",
          light: "#FF8F5E",
          dark: "#E55A28",
          bg: "#FFF3ED",
        },
        success: "#52C41A",
        warning: "#FAAD14",
        error: "#FF4D4F",
        page: "#F5F5F5",
      },
      borderRadius: {
        sm: "8px",
        md: "12px",
        lg: "16px",
      },
      boxShadow: {
        card: "0 2px 12px rgba(0, 0, 0, 0.08)",
      },
      maxWidth: {
        mobile: "430px",
      },
    },
  },
  plugins: [tailwindcssAnimate],
};

export default config;
