/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/renderer/index.html", "./src/renderer/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        pixel: ["'Pixelify Sans'", "monospace"],
        sans: ["Inter", "'Segoe UI'", "system-ui", "-apple-system", "sans-serif"]
      },
      colors: {
        /* Backgrounds */
        "bg-primary":  "#0a0c10",
        "bg-panel":    "#111318",
        "bg-card":     "#16191f",
        "bg-hover":    "#1d2129",
        "bg-input":    "#0d1017",
        border:        "#2a2f3a",
        "border-glow": "#3d8c40",

        /* Minecraft accent palette */
        accent:        "#4ade80",   /* creeper / grass green */
        "accent-hover":"#22c55e",
        "accent-dim":  "#16a34a",
        gold:          "#fbbf24",   /* Minecraft gold */
        "gold-hover":  "#f59e0b",
        diamond:       "#38bdf8",   /* diamond blue */
        redstone:      "#ef4444",   /* redstone red */
        "redstone-hover":"#dc2626",
        emerald:       "#34d399",

        /* Semantic */
        success:       "#4ade80",
        danger:        "#ef4444",
        warning:       "#fbbf24",
        info:          "#38bdf8",

        /* Text */
        "text-primary": "#f0f4f8",
        "text-muted":   "#8892a4",
        "text-faint":   "#3d4451",
      },
      backgroundImage: {
        "grass-gradient": "linear-gradient(180deg, #4ade80 0%, #16a34a 4px, #5c4033 4px, #3d2b1f 100%)",
        "panel-gradient": "linear-gradient(135deg, #111318 0%, #16191f 100%)",
        "glow-green":     "radial-gradient(ellipse at top, rgba(74,222,128,0.08) 0%, transparent 70%)",
      },
      boxShadow: {
        "glow-green": "0 0 20px rgba(74,222,128,0.25), 0 0 40px rgba(74,222,128,0.08)",
        "glow-gold":  "0 0 20px rgba(251,191,36,0.25), 0 0 40px rgba(251,191,36,0.08)",
        "glow-blue":  "0 0 20px rgba(56,189,248,0.25), 0 0 40px rgba(56,189,248,0.08)",
        "card":       "0 4px 24px rgba(0,0,0,0.4)",
      },
      animation: {
        "pulse-slow":  "pulse 3s cubic-bezier(0.4,0,0.6,1) infinite",
        "fade-in":     "fadeIn 0.2s ease-out",
        "slide-up":    "slideUp 0.25s ease-out",
        "pixel-blink": "pixelBlink 1s step-end infinite",
      },
      keyframes: {
        fadeIn:      { "0%": { opacity: "0" }, "100%": { opacity: "1" } },
        slideUp:     { "0%": { opacity: "0", transform: "translateY(8px)" }, "100%": { opacity: "1", transform: "translateY(0)" } },
        pixelBlink:  { "0%,100%": { opacity: "1" }, "50%": { opacity: "0" } },
      }
    }
  },
  plugins: []
};
