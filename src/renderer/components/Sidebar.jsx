import React from "react";
import { Link, useLocation } from "react-router-dom";
import { Download, HardDrive, Package, Plug, Settings, Users } from "lucide-react";

const navItems = [
  { to: "/",           label: "Servers",        icon: HardDrive, desc: "Manage servers" },
  { to: "/install",    label: "Install Server",  icon: Download,  desc: "New server" },
  { to: "/mods",       label: "Mods & Plugins",  icon: Plug,      desc: "Browse & install" },
  { to: "/join-room",  label: "Join Room",       icon: Users,     desc: "Multiplayer" },
  { to: "/settings",   label: "Settings",        icon: Settings,  desc: "Configuration" },
];

export default function Sidebar({ version }) {
  const location = useLocation();

  return (
    <aside className="flex w-60 flex-col border-r border-border bg-bg-panel pixel-bg">
      {/* ── Logo ── */}
      <div className="flex items-center gap-3 border-b border-border px-4 py-4">
        <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-accent/10 ring-1 ring-accent/30">
          {/* Minecraft grass block icon */}
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
            <rect x="1" y="6"  width="20" height="15" rx="1" fill="#5c4033"/>
            <rect x="1" y="1"  width="20" height="6"  rx="1" fill="#4ade80"/>
            <rect x="1" y="5"  width="20" height="3"  fill="#22c55e" opacity="0.6"/>
          </svg>
          <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-accent shadow-glow-green animate-pulse-slow" />
        </div>
        <div className="min-w-0">
          <div className="font-pixel text-sm font-bold text-accent leading-tight tracking-wide">VoxelPort</div>
          <div className="text-[10px] text-text-faint leading-tight mt-0.5">Server Manager</div>
        </div>
      </div>

      {/* ── Navigation ── */}
      <nav className="flex-1 space-y-0.5 p-3">
        <div className="mb-2 px-2 text-[9px] font-semibold uppercase tracking-widest text-text-faint">Navigation</div>
        {navItems.map((item) => {
          const Icon = item.icon;
          const active =
            item.to === "/" ? location.pathname === item.to : location.pathname.startsWith(item.to);
          return (
            <Link
              key={item.to}
              to={item.to}
              className={`nav-active-bar group flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-all duration-150 ${
                active
                  ? "bg-accent/10 text-accent"
                  : "text-text-muted hover:bg-bg-hover hover:text-text-primary"
              }`}
            >
              <Icon
                size={16}
                className={`shrink-0 transition-all ${active ? "text-accent" : "text-text-faint group-hover:text-text-muted"}`}
              />
              <div className="min-w-0 flex-1">
                <div className="text-xs font-medium leading-tight">{item.label}</div>
                <div className="text-[10px] text-text-faint leading-tight mt-px">{item.desc}</div>
              </div>
              {active && (
                <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse-slow shrink-0" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* ── Footer ── */}
      <div className="border-t border-border px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Package size={11} className="text-text-faint" />
            <span className="text-[10px] text-text-faint">v{version}</span>
          </div>
          <span className="rounded bg-accent/10 px-1.5 py-0.5 text-[9px] font-semibold text-accent tracking-wide">STABLE</span>
        </div>
      </div>
    </aside>
  );
}
