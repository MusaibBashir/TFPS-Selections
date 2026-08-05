/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0c0b09",
        panel: "#161411",
        card: "#1d1a16",
        edge: "#2b2721",
        gold: "#e6b45a",
        golddim: "#a8823f",
        cream: "#f2ead9",
        muted: "#8d8474",
        green: "#4ade80",
        yellow: "#facc15",
        red: "#f87171"
      },
      fontFamily: {
        display: ["Fraunces", "serif"],
        body: ["Outfit", "sans-serif"]
      }
    }
  },
  plugins: []
};
