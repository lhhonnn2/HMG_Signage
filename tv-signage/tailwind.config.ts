import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/app/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#16181d",
        paper: "#f5f6f8",
        line: "#dfe2e8",
        accent: "#2f6fed"
      }
    }
  },
  plugins: []
};

export default config;
