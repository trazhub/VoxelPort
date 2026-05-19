import React, { useEffect, useMemo, useState } from "react";
import { Check, ExternalLink, FolderOpen, Info, Save, TriangleAlert } from "lucide-react";
import { useAppContext, useToast } from "../App.jsx";

const defaultSettings = {
  relayServerUrl: "",
  defaultRam: 2048,
  defaultJavaPath: "",
  defaultInstallLocation: "",
  theme: "dark"
};

function SettingRow({ label, hint, children }) {
  return (
    <div className="rounded-xl border border-border bg-bg-card p-4 transition hover:border-border-glow/30">
      <div className="mb-3">
        <div className="text-sm font-medium text-text-primary">{label}</div>
        {hint && <div className="mt-0.5 text-xs text-text-muted">{hint}</div>}
      </div>
      {children}
    </div>
  );
}

export default function Settings() {
  const { setSettings } = useAppContext();
  const { showToast } = useToast();
  const [form, setForm] = useState(defaultSettings);
  const [saved, setSaved] = useState(false);
  const [javaMissing, setJavaMissing] = useState(false);
  const [javaFound, setJavaFound] = useState(false);
  const [relayTesting, setRelayTesting] = useState(false);
  const [relayStatus, setRelayStatus] = useState(null);

  useEffect(() => {
    window.api.getSettings().then((res) => {
      if (res.success) setForm({ ...defaultSettings, ...(res.data || {}) });
    });
  }, []);

  const relayInput = String(form.relayServerUrl || "").trim();
  const relayMissing = relayInput.length === 0;
  const relayWarning = useMemo(() => {
    const value = relayInput.toLowerCase();
    return value.startsWith("ws://") && !value.includes("localhost") && !value.includes("127.0.0.1");
  }, [relayInput]);
  const relayPreview = useMemo(() => {
    if (!relayInput) return "";

    const hasScheme = relayInput.includes("://");
    const normalized = hasScheme
      ? relayInput
      : relayInput.includes(":")
        ? `ws://${relayInput}`
        : `wss://${relayInput}`;

    try {
      const url = new URL(normalized);
      if (url.protocol === "http:") url.protocol = "ws:";
      if (url.protocol === "https:") url.protocol = "wss:";
      if (!url.pathname || url.pathname === "/") url.pathname = "/relay";
      return url.toString();
    } catch {
      return "";
    }
  }, [relayInput]);

  const save = async () => {
    if (relayMissing) {
      showToast("Enter your VPS relay URL before saving.", "error");
      return;
    }
    const res = await window.api.saveSettings(form);
    if (res.success) {
      setSettings(res.data);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      showToast("Settings saved.", "success");
    } else {
      showToast(res.error || "Failed to save settings.", "error");
    }
  };

  const field = (key) => ({
    value: form[key],
    onChange: (e) => setForm((prev) => ({ ...prev, [key]: e.target.value }))
  });

  const inputCls =
    "w-full rounded-lg border border-border bg-bg-input px-3 py-2 text-sm text-text-primary placeholder:text-text-faint transition focus:border-accent/50";

  return (
    <div className="mx-auto max-w-2xl animate-fade-in">
      <div className="mb-6">
        <h1 className="font-pixel text-2xl text-accent">Settings</h1>
        <p className="mt-1 text-sm text-text-muted">Configure VoxelPort's behaviour</p>
      </div>

      <div className="space-y-3">
        <SettingRow
          label="Relay Server URL"
          hint="The WebSocket relay used for multiplayer room sharing on your VPS."
        >
          <div className="flex gap-2">
            <input
              {...field("relayServerUrl")}
              className={`${inputCls} flex-1`}
              placeholder="wss://your-relay.example.com"
            />
            <button
              type="button"
              disabled={relayMissing || relayTesting}
              onClick={async () => {
                if (relayMissing) {
                  setRelayStatus({ ok: false, error: "Relay server URL is required" });
                  return;
                }
                setRelayTesting(true);
                setRelayStatus(null);
                const res = await window.api.testRelay(form.relayServerUrl);
                setRelayTesting(false);
                if (res.success) {
                  setRelayStatus({ ok: true, ms: res.data?.latencyMs, url: res.data?.url });
                } else {
                  setRelayStatus({ ok: false, error: res.error });
                }
              }}
              className="rounded-lg border border-border px-3 py-2 text-xs text-text-muted transition hover:border-diamond/40 hover:text-diamond disabled:cursor-not-allowed disabled:opacity-50"
            >
              {relayTesting ? "Testing..." : "Test Connection"}
            </button>
          </div>

          {relayPreview && (
            <div className="mt-2 rounded-lg border border-border/80 bg-bg-input px-3 py-2 text-[11px] text-text-muted">
              Effective relay endpoint: <span className="font-mono text-text-primary">{relayPreview}</span>
            </div>
          )}

          <div className="mt-3 rounded-xl border border-border bg-bg-panel px-3 py-3 text-xs text-text-muted">
            <div className="flex items-start gap-2">
              <Info size={14} className="mt-0.5 shrink-0 text-diamond" />
              <div>
                Enter your VPS relay URL here. If you omit the path, VoxelPort will use
                <span className="font-mono"> /relay</span> automatically.
              </div>
            </div>
          </div>

          {relayMissing && (
            <div className="mt-3 rounded-xl border border-danger/30 bg-danger/10 px-3 py-3 text-xs text-danger">
              Enter your VPS relay URL to create or join rooms.
            </div>
          )}

          {relayWarning && (
            <div className="mt-3 rounded-xl border border-warning/30 bg-warning/10 px-3 py-3 text-xs text-warning">
              <div className="flex items-start gap-2">
                <TriangleAlert size={14} className="mt-0.5 shrink-0" />
                <div>
                  Warning: Unencrypted relay - all game traffic will be visible on the network.
                  Use wss:// for any public relay server.
                </div>
              </div>
            </div>
          )}

          {relayStatus?.ok && (
            <div className="mt-3 rounded-lg border border-accent/30 bg-accent/10 px-3 py-2 text-xs text-accent">
              Connected in {relayStatus.ms}ms
            </div>
          )}
          {relayStatus && !relayStatus.ok && (
            <div className="mt-3 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
              Could not connect: {relayStatus.error || "check the URL"}
            </div>
          )}
        </SettingRow>

        <SettingRow
          label="Default RAM (MB)"
          hint="Amount of memory allocated to new server processes."
        >
          <div className="flex items-center gap-4">
            <input
              type="range"
              min={512}
              max={16384}
              step={512}
              value={form.defaultRam}
              onChange={(e) => setForm((prev) => ({ ...prev, defaultRam: Number(e.target.value) }))}
              className="flex-1 accent-accent"
            />
            <div className="w-24 rounded-lg border border-border bg-bg-input px-3 py-1.5 text-center text-sm font-mono text-accent">
              {(form.defaultRam / 1024).toFixed(form.defaultRam >= 1024 ? 0 : 1)} GB
            </div>
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-text-faint">
            <span>512 MB</span>
            <span>8 GB</span>
            <span>16 GB</span>
          </div>
        </SettingRow>

        <SettingRow
          label="Java Executable Path"
          hint="Leave blank to auto-detect from PATH and common install locations."
        >
          <div className="flex gap-2">
            <input
              {...field("defaultJavaPath")}
              className={`${inputCls} flex-1`}
              placeholder="Auto-detected if empty"
            />
            <button
              type="button"
              onClick={async () => {
                const res = await window.api.detectJava();
                if (res.success && res.data?.javaPath) {
                  setForm((prev) => ({ ...prev, defaultJavaPath: res.data.javaPath }));
                  setJavaMissing(false);
                  setJavaFound(true);
                  setTimeout(() => setJavaFound(false), 2000);
                } else {
                  setJavaMissing(true);
                  setJavaFound(false);
                }
              }}
              className="rounded-lg border border-border px-3 py-2 text-xs text-text-muted transition hover:border-accent/40 hover:text-accent"
            >
              Auto-detect
            </button>
          </div>
          {javaFound && (
            <div className="mt-2 flex items-center gap-1.5 text-xs text-accent">
              <Check size={11} /> Java detected successfully
            </div>
          )}
          {javaMissing && (
            <div className="mt-2 text-xs text-danger">
              Java not found.{" "}
              <button
                type="button"
                className="inline-flex items-center gap-1 text-diamond underline hover:no-underline"
                onClick={() => window.api.openExternal("https://adoptium.net")}
              >
                Download from adoptium.net <ExternalLink size={10} />
              </button>
            </div>
          )}
        </SettingRow>

        <SettingRow
          label="Default Install Location"
          hint="Where new servers are installed by default."
        >
          <div className="flex gap-2">
            <input
              {...field("defaultInstallLocation")}
              className={`${inputCls} flex-1`}
              placeholder="e.g. C:\\Users\\You\\MinecraftServers"
            />
            <button
              type="button"
              onClick={async () => {
                const res = await window.api.selectFolder();
                if (res.success && res.data?.path) {
                  setForm((prev) => ({ ...prev, defaultInstallLocation: res.data.path }));
                }
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs text-text-muted transition hover:border-accent/40 hover:text-accent"
            >
              <FolderOpen size={13} />
              Browse
            </button>
          </div>
        </SettingRow>
      </div>

      <div className="mt-6 flex items-center gap-3">
        <button
          type="button"
          id="save-settings-btn"
          onClick={save}
          disabled={relayMissing}
          className={`inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium transition-all ${
            saved
              ? "bg-accent/20 text-accent ring-1 ring-accent/40"
              : "bg-accent/10 text-accent ring-1 ring-accent/30 hover:bg-accent hover:text-bg-primary hover:shadow-glow-green"
          } disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-accent/10 disabled:hover:text-accent disabled:hover:shadow-none`}
        >
          {saved ? <Check size={14} /> : <Save size={14} />}
          {saved ? "Saved!" : "Save Settings"}
        </button>
      </div>
    </div>
  );
}
