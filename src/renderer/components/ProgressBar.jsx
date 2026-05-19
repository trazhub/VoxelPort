import React from "react";

export default function ProgressBar({ value = 0, color = "accent" }) {
  const pct = Math.min(100, Math.max(0, Number(value)));

  return (
    <div className="relative h-3 w-full overflow-hidden rounded-full bg-bg-hover">
      {/* Glowing fill */}
      <div
        className="h-full rounded-full transition-all duration-300"
        style={{
          width: `${pct}%`,
          background: "linear-gradient(90deg, #16a34a 0%, #4ade80 100%)",
          boxShadow: pct > 0 ? "0 0 10px rgba(74,222,128,0.5)" : "none",
        }}
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      />
      {/* Animated shimmer when in progress */}
      {pct > 0 && pct < 100 && (
        <div
          className="absolute inset-0 opacity-30"
          style={{
            background:
              "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.4) 50%, transparent 100%)",
            animation: "shimmer 1.5s infinite",
            backgroundSize: "200% 100%",
          }}
        />
      )}
    </div>
  );
}
