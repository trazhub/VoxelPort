import React from "react";
import { CheckCircle, Download, Loader2 } from "lucide-react";

function formatDownloads(value) {
  const n = Number(value || 0);
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}K`;
  return `${n}`;
}

const SOURCE_BADGE = {
  modrinth: { label: "Modrinth", color: "text-emerald" },
  hangar:   { label: "Hangar",   color: "text-diamond"  },
};

export default function ModCard({ mod, installing, installed, onInstall }) {
  const badge = SOURCE_BADGE[mod.source] || { label: mod.source, color: "text-text-faint" };

  return (
    <div className="group flex flex-col rounded-xl border border-border bg-bg-card shadow-card transition-all duration-200 hover:border-accent/30 hover:shadow-glow-green animate-slide-up">
      {/* Icon + header */}
      <div className="flex items-start gap-3 p-4">
        {mod.iconUrl ? (
          <img
            src={mod.iconUrl}
            alt=""
            className="h-12 w-12 shrink-0 rounded-lg object-cover ring-1 ring-border"
          />
        ) : (
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-bg-hover ring-1 ring-border text-2xl">
            🧩
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-text-primary">{mod.title}</div>
          <div className="mt-0.5 text-xs text-text-muted">{mod.author || "Unknown"}</div>
          <div className="mt-1 flex items-center gap-2">
            <span className={`text-[10px] font-medium ${badge.color}`}>{badge.label}</span>
            <span className="text-text-faint">·</span>
            <span className="text-[10px] text-text-faint">
              ⬇ {formatDownloads(mod.downloads)}
            </span>
          </div>
        </div>
      </div>

      {/* Description */}
      <p className="line-clamp-2 px-4 text-xs text-text-muted leading-relaxed">{mod.description}</p>

      {/* Version tags */}
      {(mod.versions || []).length > 0 && (
        <div className="flex flex-wrap gap-1 px-4 pt-2">
          {(mod.versions || []).slice(0, 3).map((v) => (
            <span key={v} className="rounded-md bg-bg-hover px-1.5 py-0.5 text-[10px] text-text-faint">
              {v}
            </span>
          ))}
          {mod.versions?.length > 3 && (
            <span className="rounded-md bg-bg-hover px-1.5 py-0.5 text-[10px] text-text-faint">
              +{mod.versions.length - 3}
            </span>
          )}
        </div>
      )}

      {/* Install button */}
      <div className="mt-auto p-4 pt-3">
        {installed ? (
          <div className="flex items-center justify-center gap-2 rounded-lg border border-accent/30 bg-accent/10 py-2 text-xs font-medium text-accent">
            <CheckCircle size={13} />
            Installed
          </div>
        ) : (
          <button
            type="button"
            disabled={installing}
            onClick={onInstall}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent/10 py-2 text-xs font-medium text-accent ring-1 ring-accent/20 transition hover:bg-accent hover:text-bg-primary hover:shadow-glow-green disabled:opacity-50"
          >
            {installing ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <Download size={13} />
            )}
            {installing ? "Installing…" : "Install"}
          </button>
        )}
      </div>
    </div>
  );
}
