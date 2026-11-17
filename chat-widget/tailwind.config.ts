import type { Config } from "tailwindcss";

export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "../shared/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'wkflo-primary': 'var(--wkflo-primary-color, #3b82f6)',
        'wkflo-secondary': 'var(--wkflo-secondary-color, #f3f4f6)',
      },
      maxWidth: {
        'tool-name': '151px',
      },
    },
  },
  plugins: [require("tailwindcss-animate"), require("@tailwindcss/typography")]
}  satisfies Config;