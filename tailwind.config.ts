import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#080403",
        coal: "#0e0807",
        surface: "#181009",
        sfc2: "#21160f",
        cream: "#f8f6f2",
        cream2: "#d4c5c1",
        muted: "#8c7b78",
        amber: {
          DEFAULT: "#ff8e3e",
          d: "#e67528",
        },
        red: "#ff6568",
        cyan: "#00d3bd",
        green: "#05df72",
      },
      fontFamily: {
        sans: ["Plus Jakarta Sans", "sans-serif"],
      },
      backgroundImage: {
        gradient: "linear-gradient(90deg, #ff8e3e 0%, #ffb627 55%, #ff6b35 100%)",
      },
    },
  },
  plugins: [],
};

export default config;
