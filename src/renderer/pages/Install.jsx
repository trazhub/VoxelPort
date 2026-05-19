import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, Check, FolderOpen, Play, X } from "lucide-react";
import ProgressBar from "../components/ProgressBar.jsx";
import { useAppContext, useToast } from "../App.jsx";

const serverTypes = [
  {
    id: "paper", title: "Paper", emoji: "📄",
    desc: "Best performance & plugin support",
    recommended: true,
    color: "text-emerald", ring: "ring-emerald/40", bg: "bg-emerald/10"
  },
  {
    id: "purpur", title: "Purpur", emoji: "🟣",
    desc: "Paper fork with extra customization",
    color: "text-purple-400", ring: "ring-purple-400/40", bg: "bg-purple-400/10"
  },
  {
    id: "vanilla", title: "Vanilla", emoji: "🌿",
    desc: "Official Mojang server, unmodified",
    color: "text-gold", ring: "ring-gold/40", bg: "bg-gold/10"
  },
  {
    id: "fabric", title: "Fabric", emoji: "🧵",
    desc: "Lightweight, fast modding platform",
    color: "text-sky-400", ring: "ring-sky-400/40", bg: "bg-sky-400/10"
  },
  {
    id: "forge", title: "Forge", emoji: "🔥",
    desc: "Full mod support - largest ecosystem",
    color: "text-orange-400", ring: "ring-orange-400/40", bg: "bg-orange-400/10"
  },
  {
    id: "neoforge", title: "NeoForge", emoji: "⚙️",
    desc: "Modern Forge fork, actively maintained",
    color: "text-orange-300", ring: "ring-orange-300/40", bg: "bg-orange-300/10"
  }
];

const STEPS = ["Server Type", "Version", "Configure", "Installing", "Done"];

const nameRegex = /^[a-zA-Z0-9_-]{1,64}$/;
const MIN_RAM = 512;
const MAX_RAM = 16384;
const clampRam = (v) => Math.min(MAX_RAM, Math.max(MIN_RAM, Number(v) || 2048));

function FieldRow({ label, hint, error, children }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium uppercase tracking-wider text-text-muted">{label}</label>
        {hint && <span className="text-[10px] text-text-faint">{hint}</span>}
      </div>
      {children}
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-border bg-bg-input px-3 py-2 text-sm text-text-primary placeholder:text-text-faint transition focus:border-accent/50";

export default function Install() {
  const navigate = useNavigate();
  const { settings, refreshServers } = useAppContext();
  const { showToast } = useToast();
  const [step, setStep] = useState(1);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [versions, setVersions] = useState([]);
  const [error, setError] = useState("");
  const [portWarning, setPortWarning] = useState("");
  const [installing, setInstalling] = useState(false);
  const [installResult, setInstallResult] = useState(null);
  const [progress, setProgress] = useState({ stage: "validating", percent: 0, message: "" });
  const [confirmCancel, setConfirmCancel] = useState(false);

  const [form, setForm] = useState({
    serverType: "paper",
    mcVersion: "",
    loaderVersion: "",
    name: "my_server",
    installPath: settings?.defaultInstallLocation || "",
    port: 25565,
    ram: clampRam(settings?.defaultRam || 2048),
    cracked: false,
    eulaAccepted: false,
    javaPath: settings?.defaultJavaPath || ""
  });

  const field = (key) => ({
    value: form[key],
    onChange: (e) => setForm((p) => ({ ...p, [key]: e.target.value }))
  });

  useEffect(() => {
    const unsub = window.api.onInstallProgress((payload) => setProgress(payload));
    return unsub;
  }, []);

  useEffect(() => {
    if (settings) {
      setForm((prev) => ({
        ...prev,
        installPath: prev.installPath || settings.defaultInstallLocation || "",
        ram: clampRam(prev.ram || settings.defaultRam || 2048),
        javaPath: prev.javaPath || settings.defaultJavaPath || ""
      }));
    }
  }, [settings]);

  useEffect(() => {
    loadVersions(form.serverType);
  }, [form.serverType]);

  const loadVersions = async (serverType) => {
    setLoadingVersions(true);
    setError("");
    const res = await window.api.fetchVersions(serverType);
    if (res.success) {
      const list = res.data || [];
      setVersions(list);
      setForm((prev) => ({
        ...prev,
        mcVersion: list[0]?.mcVersion || list[0]?.id || "",
        loaderVersion: list[0]?.loaderVersion || list[0]?.id || ""
      }));
    } else {
      setError(res.error || "Failed to load versions.");
    }
    setLoadingVersions(false);
  };

  const currentType = useMemo(
    () => serverTypes.find((t) => t.id === form.serverType),
    [form.serverType]
  );

  const validateStep3 = () => {
    if (!nameRegex.test(form.name)) return "Name must be letters, numbers, _ or - (max 64).";
    if (!form.installPath) return "Install location is required.";
    const p = Number(form.port);
    if (!Number.isInteger(p) || p < 1 || p > 65535) return "Port must be 1-65535.";
    if (Number(form.ram) < MIN_RAM) return `RAM must be at least ${MIN_RAM} MB.`;
    if (!form.eulaAccepted) return "You must accept the Minecraft EULA to continue.";
    return "";
  };

  const checkPort = async () => {
    const res = await window.api.findFreePort(Number(form.port));
    if (res.success) {
      const free = Number(res.data?.port || form.port);
      setPortWarning(free !== Number(form.port) ? `Port in use - suggested free port: ${free}` : "");
    }
  };

  const startInstall = async () => {
    const validation = validateStep3();
    if (validation) {
      setError(validation);
      return;
    }
    setStep(4);
    setInstalling(true);
    setError("");
    setInstallResult(null);

    const res = await window.api.installServer({
      serverType: form.serverType,
      mcVersion: form.mcVersion,
      loaderVersion: form.loaderVersion,
      name: form.name,
      installPath: form.installPath,
      port: Number(form.port),
      ram: clampRam(form.ram),
      cracked: Boolean(form.cracked),
      eulaAccepted: form.eulaAccepted,
      javaPath: form.javaPath || undefined
    });

    setInstalling(false);
    if (!res.success || !res.data?.success) {
      setError(res.error || res.data?.error || "Installation failed.");
      return;
    }
    setInstallResult(res.data.serverConfig);
    showToast(`${res.data.serverConfig.name} installed.`, "success");
    await refreshServers();
    setStep(5);
  };

  const cancelInstall = async () => {
    await window.api.cancelInstall();
    setInstalling(false);
    setConfirmCancel(false);
    setError("Installation canceled.");
    setStep(3);
  };

  return (
    <div className="mx-auto max-w-2xl animate-fade-in">
      <div className="mb-6">
        <h1 className="font-pixel text-2xl text-accent">Install Server</h1>
        <p className="mt-1 text-sm text-text-muted">Set up a new Minecraft server in a few steps</p>
      </div>

      <div className="mb-8 flex items-center gap-0">
        {STEPS.map((title, idx) => {
          const num = idx + 1;
          const active = num === step;
          const done = num < step;
          return (
            <React.Fragment key={title}>
              <div className="flex flex-col items-center">
                <div
                  className={`flex h-7 w-7 items-center justify-center rounded-lg text-xs font-bold transition-all ${
                    done
                      ? "bg-accent text-bg-primary"
                      : active
                        ? "bg-accent/20 text-accent ring-1 ring-accent/50"
                        : "bg-bg-hover text-text-faint"
                  }`}
                >
                  {done ? <Check size={12} /> : num}
                </div>
                <span className={`mt-1 whitespace-nowrap text-[10px] ${active ? "text-accent" : done ? "text-accent/60" : "text-text-faint"}`}>
                  {title}
                </span>
              </div>
              {idx < STEPS.length - 1 && (
                <div className={`mx-1 mb-4 h-px flex-1 transition-all ${done ? "bg-accent/50" : "bg-border"}`} />
              )}
            </React.Fragment>
          );
        })}
      </div>

      {error && (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
          <X size={14} className="mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      {step === 1 && (
        <div className="animate-slide-up space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {serverTypes.map((type) => {
              const selected = form.serverType === type.id;
              return (
                <button
                  key={type.id}
                  type="button"
                  onClick={() => setForm((p) => ({ ...p, serverType: type.id }))}
                  className={`relative rounded-xl border p-4 text-left transition-all duration-150 ${
                    selected
                      ? `${type.bg} ${type.ring} ring-1 border-transparent`
                      : "border-border bg-bg-card hover:border-border-glow/40 hover:bg-bg-hover"
                  }`}
                >
                  <div className="mb-2 text-2xl">{type.emoji}</div>
                  <div className={`text-sm font-semibold ${selected ? type.color : "text-text-primary"}`}>
                    {type.title}
                  </div>
                  <div className="mt-0.5 text-[11px] leading-tight text-text-muted">{type.desc}</div>
                  {type.recommended && (
                    <span className="absolute right-2 top-2 rounded bg-accent/20 px-1.5 py-0.5 text-[9px] font-bold tracking-wider text-accent">
                      BEST
                    </span>
                  )}
                  {selected && (
                    <span className="absolute bottom-2 right-2 flex h-4 w-4 items-center justify-center rounded-full bg-accent">
                      <Check size={10} className="text-bg-primary" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setStep(2)}
              className="inline-flex items-center gap-2 rounded-lg bg-accent/10 px-5 py-2.5 text-sm font-medium text-accent ring-1 ring-accent/30 transition hover:bg-accent hover:text-bg-primary hover:shadow-glow-green"
            >
              Next <ArrowRight size={14} />
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="animate-slide-up space-y-4">
          <div className="rounded-xl border border-border bg-bg-card p-5">
            {loadingVersions ? (
              <div className="flex items-center justify-center gap-3 py-6 text-sm text-text-muted">
                <span className="h-4 w-4 animate-spin rounded-sm border-2 border-accent border-t-transparent" />
                Loading versions...
              </div>
            ) : (
              <>
                {["fabric", "forge", "neoforge"].includes(form.serverType) && (
                  <FieldRow label="Game Version">
                    <select
                      className={inputCls}
                      value={form.mcVersion}
                      onChange={(e) => setForm((p) => ({ ...p, mcVersion: e.target.value }))}
                    >
                      {versions.map((v) => (
                        <option key={v.id} value={v.mcVersion || v.id}>
                          {v.mcVersion || v.id}{v.recommended ? " (recommended)" : ""}
                        </option>
                      ))}
                    </select>
                  </FieldRow>
                )}

                {form.serverType === "fabric" && (
                  <FieldRow label="Loader Version" hint="Optional">
                    <select
                      className={`${inputCls} mt-4`}
                      value={form.loaderVersion}
                      onChange={(e) => setForm((p) => ({ ...p, loaderVersion: e.target.value }))}
                    >
                      {versions.map((v) => (
                        <option key={`${v.id}:${v.loaderVersion}`} value={v.loaderVersion || ""}>
                          {v.loaderVersion || "latest"}
                        </option>
                      ))}
                    </select>
                  </FieldRow>
                )}

                {["paper", "purpur", "vanilla"].includes(form.serverType) && (
                  <div className="max-h-72 overflow-auto rounded-lg border border-border">
                    {versions.map((v) => (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => setForm((p) => ({ ...p, mcVersion: v.id }))}
                        className={`flex w-full items-center justify-between px-4 py-2.5 text-sm transition ${
                          form.mcVersion === v.id
                            ? "bg-accent/10 text-accent"
                            : "text-text-muted hover:bg-bg-hover hover:text-text-primary"
                        }`}
                      >
                        <span>{v.label}</span>
                        {v.recommended && (
                          <span className="rounded bg-accent/20 px-2 py-0.5 text-[10px] font-medium text-accent">
                            Latest
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          <div className="flex justify-between">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm text-text-muted transition hover:bg-bg-hover hover:text-text-primary"
            >
              <ArrowLeft size={14} /> Back
            </button>
            <button
              type="button"
              onClick={() => setStep(3)}
              className="inline-flex items-center gap-2 rounded-lg bg-accent/10 px-5 py-2.5 text-sm font-medium text-accent ring-1 ring-accent/30 transition hover:bg-accent hover:text-bg-primary hover:shadow-glow-green"
            >
              Next <ArrowRight size={14} />
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="animate-slide-up space-y-4">
          <div className="space-y-5 rounded-xl border border-border bg-bg-card p-5">
            <div className="grid gap-5 md:grid-cols-2">
              <FieldRow
                label="Server Name"
                error={form.name && !nameRegex.test(form.name) ? "Letters, numbers, _ or - only (max 64)" : ""}
              >
                <input {...field("name")} className={inputCls} placeholder="my_server" />
              </FieldRow>

              <FieldRow label="Install Location">
                <div className="flex gap-2">
                  <input {...field("installPath")} className={`${inputCls} flex-1`} placeholder="C:\Servers\..." />
                  <button
                    type="button"
                    onClick={async () => {
                      const res = await window.api.selectFolder();
                      if (res.success && res.data?.path) {
                        setForm((p) => ({ ...p, installPath: res.data.path }));
                      }
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs text-text-muted transition hover:border-accent/40 hover:text-accent"
                  >
                    <FolderOpen size={13} />
                  </button>
                </div>
              </FieldRow>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <FieldRow label="Port" hint={portWarning || "Default: 25565"}>
                <input
                  type="number"
                  value={form.port}
                  onBlur={checkPort}
                  onChange={(e) => setForm((p) => ({ ...p, port: Number(e.target.value) }))}
                  className={`${inputCls} ${portWarning ? "border-warning/50" : ""}`}
                />
              </FieldRow>

              <FieldRow label="RAM" hint={`${(form.ram / 1024).toFixed(form.ram >= 1024 ? 1 : 0)} GB`}>
                <input
                  type="range"
                  min={MIN_RAM}
                  max={MAX_RAM}
                  step={256}
                  value={form.ram}
                  onChange={(e) => setForm((p) => ({ ...p, ram: clampRam(e.target.value) }))}
                  className="mt-1 w-full"
                />
                <div className="mt-1 flex justify-between text-[10px] text-text-faint">
                  <span>512 MB</span><span>8 GB</span><span>16 GB</span>
                </div>
              </FieldRow>
            </div>

            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={form.cracked}
                onChange={(e) => setForm((p) => ({ ...p, cracked: e.target.checked }))}
                className="mt-0.5"
              />
              <div>
                <div className="text-sm text-text-primary">Cracked Support (offline mode)</div>
                {form.cracked && (
                  <div className="mt-1.5 rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-xs text-danger">
                    Warning: disables Mojang auth - anyone can join with any username, including fake operator accounts.
                  </div>
                )}
              </div>
            </label>

            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={form.eulaAccepted}
                onChange={(e) => setForm((p) => ({ ...p, eulaAccepted: e.target.checked }))}
                className="mt-0.5"
              />
              <div className="text-sm text-text-muted">
                I have read and agree to the{" "}
                <button
                  type="button"
                  className="text-accent underline hover:no-underline"
                  onClick={() => window.api.openExternal("https://aka.ms/MinecraftEULA")}
                >
                  Minecraft EULA
                </button>
              </div>
            </label>
          </div>

          <div className="flex justify-between">
            <button
              type="button"
              onClick={() => {
                setError("");
                setStep(2);
              }}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm text-text-muted transition hover:bg-bg-hover hover:text-text-primary"
            >
              <ArrowLeft size={14} /> Back
            </button>
            <button
              type="button"
              onClick={startInstall}
              disabled={!form.eulaAccepted}
              className="inline-flex items-center gap-2 rounded-lg bg-accent/10 px-5 py-2.5 text-sm font-medium text-accent ring-1 ring-accent/30 transition hover:bg-accent hover:text-bg-primary hover:shadow-glow-green disabled:opacity-40"
            >
              Install <ArrowRight size={14} />
            </button>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="animate-slide-up space-y-4">
          <div className="rounded-xl border border-border bg-bg-card p-6">
            <div className="mb-4 flex items-center gap-3">
              <span className="h-5 w-5 shrink-0 animate-spin rounded-sm border-2 border-accent border-t-transparent" />
              <div>
                <div className="text-sm font-medium capitalize text-text-primary">
                  {progress.stage?.replace(/-/g, " ") || "Installing..."}
                </div>
                <div className="text-xs text-text-muted">{progress.message}</div>
              </div>
            </div>

            <ProgressBar value={progress.percent || 0} />
            <div className="mt-2 flex justify-between text-xs text-text-faint">
              <span>{progress.percent || 0}%</span>
              {typeof progress.bytesDownloaded === "number" && progress.totalBytes > 0 && (
                <span>
                  {(progress.bytesDownloaded / 1_048_576).toFixed(1)} /
                  {(progress.totalBytes / 1_048_576).toFixed(1)} MB
                </span>
              )}
            </div>

            {(currentType?.id === "forge" || currentType?.id === "neoforge") &&
              Array.isArray(progress.forgeOutput) && progress.forgeOutput.length > 0 && (
                <pre className="mt-4 max-h-40 overflow-auto rounded-lg border border-border bg-[#080a0d] p-3 font-mono text-[10px] text-text-muted">
                  {progress.forgeOutput.join("\n")}
                </pre>
              )}
          </div>

          {confirmCancel && (
            <div className="rounded-xl border border-danger/30 bg-danger/10 p-4 text-sm">
              <div className="font-medium text-danger">Cancel installation?</div>
              <div className="mt-1 text-text-muted">Any partial downloads will be discarded.</div>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={cancelInstall}
                  className="rounded-lg bg-danger px-4 py-2 text-xs font-medium text-white"
                >
                  Cancel Installation
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmCancel(false)}
                  className="rounded-lg border border-border px-4 py-2 text-xs text-text-muted transition hover:bg-bg-hover hover:text-text-primary"
                >
                  Keep Installing
                </button>
              </div>
            </div>
          )}

          <div className="flex justify-start">
            <button
              type="button"
              onClick={() => setConfirmCancel(true)}
              disabled={!installing}
              className="inline-flex items-center gap-2 rounded-lg bg-danger/10 px-4 py-2.5 text-sm text-danger ring-1 ring-danger/30 transition hover:bg-danger hover:text-white disabled:opacity-40"
            >
              <X size={14} /> Cancel
            </button>
          </div>
        </div>
      )}

      {step === 5 && installResult && (
        <div className="animate-slide-up rounded-xl border border-accent/30 bg-accent/5 p-8 text-center">
          <div className="mb-4 flex justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/20 ring-1 ring-accent/40">
              <span className="text-4xl">🎉</span>
            </div>
          </div>
          <h2 className="font-pixel text-xl text-accent">Server Ready!</h2>
          <p className="mt-2 text-sm text-text-muted">
            <span className="font-medium text-text-primary">{installResult.name}</span>{" "}
            installed at <code className="rounded bg-bg-input px-1.5 py-0.5 text-xs text-diamond">{installResult.path}</code>
          </p>

          <div className="mt-6 flex justify-center gap-3">
            <button
              type="button"
              onClick={async () => {
                await window.api.startServer({
                  id: installResult.id,
                  path: installResult.path,
                  port: installResult.port,
                  ram: installResult.ram,
                  javaPath: installResult.javaPath
                });
                navigate("/");
              }}
              className="inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-bg-primary shadow-glow-green transition hover:bg-accent-hover"
            >
              <Play size={14} className="fill-current" />
              Start Now
            </button>
            <button
              type="button"
              onClick={() => navigate("/")}
              className="rounded-lg border border-border px-5 py-2.5 text-sm text-text-muted transition hover:bg-bg-hover hover:text-text-primary"
            >
              Back to Servers
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
