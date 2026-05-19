import React, { useState } from "react";
import {
  Cpu, FolderOpen, MemoryStick, MoreVertical, Pencil, Play, Power, Trash2, Users, Wrench
} from "lucide-react";
import Console from "./Console.jsx";

const SERVER_TYPE_STYLES = {
  paper: { color: "text-emerald-400", bg: "bg-emerald-400/10", dot: "bg-emerald-400", label: "Paper" },
  purpur: { color: "text-purple-400", bg: "bg-purple-400/10", dot: "bg-purple-400", label: "Purpur" },
  vanilla: { color: "text-gold", bg: "bg-gold/10", dot: "bg-gold", label: "Vanilla" },
  fabric: { color: "text-sky-400", bg: "bg-sky-400/10", dot: "bg-sky-400", label: "Fabric" },
  forge: { color: "text-orange-400", bg: "bg-orange-400/10", dot: "bg-orange-400", label: "Forge" },
  neoforge: { color: "text-orange-300", bg: "bg-orange-300/10", dot: "bg-orange-300", label: "NeoForge" }
};

function StatPill({ icon: Icon, value, label, color = "text-text-muted" }) {
  return (
    <div className="flex items-center gap-1.5 rounded bg-bg-primary/60 px-2.5 py-1.5 text-xs">
      <Icon size={12} className={`shrink-0 ${color}`} />
      <span className={`font-medium ${color}`}>{value}</span>
      <span className="text-text-faint">{label}</span>
    </div>
  );
}

function formatUptime(seconds) {
  if (!seconds) return "0s";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export default function ServerCard({
  server,
  stats,
  consoleLines,
  updateCount = 0,
  onStart,
  onStop,
  onOpenRoom,
  onMods,
  onRename,
  onRemove,
  onOpenFolder,
  onSendCommand,
  onClearConsole
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  const online = server.status === "running" || server.status === "starting";
  const starting = server.status === "starting";
  const typeKey = String(server.serverType || "").toLowerCase();
  const style = SERVER_TYPE_STYLES[typeKey] || {
    color: "text-text-muted",
    bg: "bg-bg-hover",
    dot: "bg-text-faint",
    label: server.serverType || "Unknown"
  };

  const configuredMb = Number(server.ram || 2048);
  const ramDisplay = online && stats
    ? `${(Number(stats.ramMb || 0) / 1024).toFixed(1)} / ${(configuredMb / 1024).toFixed(0)} GB`
    : `${(configuredMb / 1024).toFixed(0)} GB`;

  return (
    <section className="group relative flex flex-col rounded-xl border border-border bg-bg-card shadow-card transition-all duration-200 hover:border-accent/30 hover:shadow-glow-green animate-slide-up">
      <div className={`h-1 w-full rounded-t-xl transition-all ${online ? "bg-accent shadow-glow-green" : "bg-border"}`} />

      <div className="flex flex-col gap-4 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-base font-semibold text-text-primary">{server.name || server.id}</h3>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${style.bg} ${style.color}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
                {style.label} {server.mcVersion && `${server.mcVersion}`}
              </span>
              <span className={`inline-flex items-center gap-1.5 text-xs ${online ? "text-accent" : "text-text-faint"}`}>
                <span className={`h-2 w-2 rounded-full ${online ? `bg-accent ${starting ? "animate-pulse" : "shadow-glow-green"}` : "bg-text-faint"}`} />
                {starting ? "Starting..." : online ? "Online" : "Offline"}
              </span>
              {updateCount > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning">
                  {updateCount} update{updateCount === 1 ? "" : "s"}
                </span>
              )}
            </div>
          </div>

          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="rounded-lg p-1.5 text-text-faint transition hover:bg-bg-hover hover:text-text-primary"
            >
              <MoreVertical size={15} />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 z-20 mt-1 w-44 animate-fade-in rounded-xl border border-border bg-bg-panel py-1 shadow-card text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      onRename?.();
                      setMenuOpen(false);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-text-muted transition hover:bg-bg-hover hover:text-text-primary"
                  >
                    <Pencil size={13} />
                    Rename
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onOpenFolder?.();
                      setMenuOpen(false);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-text-muted transition hover:bg-bg-hover hover:text-text-primary"
                  >
                    <FolderOpen size={13} />
                    Open Folder
                  </button>
                  <div className="my-1 border-t border-border" />
                  <button
                    type="button"
                    onClick={() => {
                      onRemove?.();
                      setMenuOpen(false);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-danger transition hover:bg-danger/10"
                  >
                    <Trash2 size={13} />
                    Remove Server
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <StatPill icon={Users} value={stats?.playerCount ?? server.playerCount ?? 0} label="players" color={online ? "text-accent" : "text-text-faint"} />
          <StatPill icon={MemoryStick} value={ramDisplay} label="RAM" color="text-diamond" />
          <StatPill icon={Cpu} value={online && stats ? `${stats.cpuPercent ?? 0}%` : "-"} label="CPU" color="text-gold" />
          {online && stats?.uptime != null && (
            <StatPill icon={Play} value={formatUptime(stats.uptime)} label="uptime" color="text-emerald" />
          )}
          <StatPill icon={FolderOpen} value={`:${server.port}`} label="port" color="text-text-muted" />
        </div>

        <div className="flex flex-wrap gap-2">
          {online ? (
            <button
              type="button"
              onClick={onStop}
              className="inline-flex items-center gap-1.5 rounded-lg bg-danger/10 px-3 py-2 text-xs font-medium text-danger ring-1 ring-danger/30 transition hover:bg-danger hover:text-white hover:shadow-none"
            >
              <Power size={12} />
              Stop Server
            </button>
          ) : (
            <button
              type="button"
              onClick={onStart}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent/10 px-3 py-2 text-xs font-medium text-accent ring-1 ring-accent/30 transition hover:bg-accent hover:text-bg-primary hover:shadow-glow-green"
            >
              <Play size={12} className="fill-current" />
              Start Server
            </button>
          )}
          {online && (
            <button
              type="button"
              onClick={onOpenRoom}
              className="inline-flex items-center gap-1.5 rounded-lg bg-diamond/10 px-3 py-2 text-xs font-medium text-diamond ring-1 ring-diamond/30 transition hover:bg-diamond hover:text-bg-primary hover:shadow-glow-blue"
            >
              <Users size={12} />
              Share Room
            </button>
          )}
          <button
            type="button"
            onClick={onMods}
            className="inline-flex items-center gap-1.5 rounded-lg bg-gold/10 px-3 py-2 text-xs font-medium text-gold ring-1 ring-gold/30 transition hover:bg-gold hover:text-bg-primary hover:shadow-glow-gold"
          >
            <Wrench size={12} />
            Mods
            {updateCount > 0 && (
              <span className="rounded-full bg-warning/20 px-1.5 py-0.5 text-[10px] font-semibold text-warning">
                {updateCount}
              </span>
            )}
          </button>
        </div>

        <div className="overflow-hidden rounded-xl border border-border bg-[#080a0d]">
          <div className="flex items-center justify-between border-b border-border bg-bg-panel/50 px-3 py-1.5">
            <span className="font-mono text-[10px] tracking-wider text-text-faint">-- console --</span>
            {server.status === "running" && (
              <span className="flex items-center gap-1.5 text-[10px] text-accent">
                <span className="h-1.5 w-1.5 animate-pulse-slow rounded-full bg-accent" />
                live
              </span>
            )}
          </div>
          <Console lines={consoleLines} onSendCommand={onSendCommand} onClear={onClearConsole} />
        </div>
      </div>
    </section>
  );
}
