import React, { useEffect, useState } from "react";

// SVG icons for window controls — pixel-art Minecraft style
function IconMinimize() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
      <rect x="1" y="5" width="8" height="1.5" rx="0.5" fill="currentColor" />
    </svg>
  );
}

function IconMaximize({ isMaximized }) {
  if (isMaximized) {
    // Restore icon (two overlapping squares)
    return (
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
        <rect x="3" y="1" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.2" fill="none" />
        <rect x="1" y="3" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.2" fill="none"
          style={{ clipPath: "inset(0 0 0 0)" }} />
      </svg>
    );
  }
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
      <rect x="1" y="1" width="8" height="8" rx="1" stroke="currentColor" strokeWidth="1.2" fill="none" />
    </svg>
  );
}

function IconClose() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
      <line x1="1.5" y1="1.5" x2="8.5" y2="8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="8.5" y1="1.5" x2="1.5" y2="8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

// Detect if we're running inside Electron
const isElectron = typeof window !== "undefined" && Boolean(window.api?.windowClose);

export default function TitleBar() {
  const [isMaximized, setIsMaximized] = useState(false);
  const [isHoveringClose, setIsHoveringClose] = useState(false);

  useEffect(() => {
    if (!isElectron) return;
    // Check initial state
    window.api.windowIsMaximized?.().then((res) => {
      if (res?.data) setIsMaximized(res.data.maximized);
    });

    // Listen for maximize / unmaximize events
    const unsub = window.api.onWindowMaximizeChange?.((payload) => {
      setIsMaximized(Boolean(payload?.maximized));
    });
    return () => unsub?.();
  }, []);

  const handleMinimize = () => window.api?.windowMinimize?.();
  const handleMaximize = async () => {
    const res = await window.api?.windowMaximizeToggle?.();
    if (res?.data) setIsMaximized(res.data.maximized);
  };
  const handleClose = () => window.api?.windowClose?.();

  return (
    <div
      className="titlebar flex h-9 w-full shrink-0 select-none items-center justify-between border-b border-border bg-bg-panel px-3"
      style={{ WebkitAppRegion: "drag" }}
    >
      {/* ── Left: App identity ── */}
      <div className="flex items-center gap-2" style={{ WebkitAppRegion: "no-drag" }}>
        {/* Minecraft grass block mini icon */}
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <rect x="0" y="4" width="14" height="10" rx="1" fill="#5c4033" />
          <rect x="0" y="0" width="14" height="5" rx="1" fill="#4ade80" />
          <rect x="0" y="3.5" width="14" height="2" fill="#22c55e" opacity="0.5" />
        </svg>
        <span className="font-pixel text-xs text-accent tracking-wider">VoxelPort</span>
        <span className="text-[10px] text-text-faint">— Minecraft Server Manager</span>
      </div>

      {/* ── Right: Window controls ── */}
      {isElectron && (
        <div
          className="flex items-center gap-0.5"
          style={{ WebkitAppRegion: "no-drag" }}
        >
          {/* Minimize */}
          <button
            type="button"
            onClick={handleMinimize}
            title="Minimize"
            className="group flex h-8 w-10 items-center justify-center rounded text-text-faint transition-all hover:bg-bg-hover hover:text-text-primary"
          >
            <IconMinimize />
          </button>

          {/* Maximize / Restore */}
          <button
            type="button"
            onClick={handleMaximize}
            title={isMaximized ? "Restore" : "Maximize"}
            className="group flex h-8 w-10 items-center justify-center rounded text-text-faint transition-all hover:bg-bg-hover hover:text-text-primary"
          >
            <IconMaximize isMaximized={isMaximized} />
          </button>

          {/* Close — red on hover like Windows */}
          <button
            type="button"
            onClick={handleClose}
            title="Close"
            onMouseEnter={() => setIsHoveringClose(true)}
            onMouseLeave={() => setIsHoveringClose(false)}
            className={`flex h-8 w-10 items-center justify-center rounded transition-all ${
              isHoveringClose
                ? "bg-redstone text-white"
                : "text-text-faint hover:bg-redstone/20 hover:text-redstone"
            }`}
          >
            <IconClose />
          </button>
        </div>
      )}
    </div>
  );
}
