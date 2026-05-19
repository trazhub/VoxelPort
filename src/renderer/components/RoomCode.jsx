import React, { useState } from "react";
import { Check, Copy } from "lucide-react";

export default function RoomCode({ code }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="rounded-xl border border-accent/20 bg-accent/5 p-5 text-center">
      <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.3em] text-text-faint">Room Code</div>

      {/* Code display — each char in its own "block" */}
      <div className="mb-4 flex items-center justify-center gap-2">
        {String(code || "------").split("").map((char, i) => (
          <div
            key={i}
            className="flex h-12 w-10 items-center justify-center rounded-lg border border-accent/30 bg-bg-primary font-pixel text-2xl font-bold text-accent shadow-glow-green"
          >
            {char}
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={copy}
        className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all duration-200 ${
          copied
            ? "bg-accent/20 text-accent ring-1 ring-accent/40"
            : "bg-accent/10 text-accent ring-1 ring-accent/20 hover:bg-accent hover:text-bg-primary hover:shadow-glow-green"
        }`}
      >
        {copied ? <Check size={13} /> : <Copy size={13} />}
        {copied ? "Copied!" : "Copy Code"}
      </button>
    </div>
  );
}
