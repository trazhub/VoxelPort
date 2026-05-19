import React, { useEffect, useMemo, useState } from "react";
import ModCard from "../components/ModCard.jsx";
import { useAppContext, useToast } from "../App.jsx";

function useDebounce(value, wait = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), wait);
    return () => clearTimeout(t);
  }, [value, wait]);
  return debounced;
}

const categoryByType = {
  paper: ["admin", "chat", "economy", "game-mechanics", "worldgen"],
  purpur: ["admin", "chat", "economy", "game-mechanics", "worldgen"],
  fabric: ["adventure", "optimization", "technology", "worldgen", "utility"],
  forge: ["adventure", "technology", "magic", "worldgen", "utility"],
  neoforge: ["adventure", "technology", "magic", "worldgen", "utility"],
  vanilla: []
};

export default function Mods() {
  const { servers, selectedServerId, setSelectedServerId } = useAppContext();
  const { showToast } = useToast();
  const [tab, setTab] = useState("browse");
  const [source, setSource] = useState("modrinth");
  const [sort, setSort] = useState("relevance");
  const [category, setCategory] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [installed, setInstalled] = useState([]);
  const [loading, setLoading] = useState(false);
  const [offset, setOffset] = useState(0);
  const [installingById, setInstallingById] = useState({});
  const [error, setError] = useState("");
  const [pendingRemoveId, setPendingRemoveId] = useState(null);

  const debouncedQuery = useDebounce(query, 300);
  const server = useMemo(
    () => servers.find((s) => s.id === selectedServerId) || servers[0] || null,
    [servers, selectedServerId]
  );

  useEffect(() => {
    if (server && !selectedServerId) setSelectedServerId(server.id);
  }, [server, selectedServerId, setSelectedServerId]);

  useEffect(() => {
    const unsubscribe = window.api.onModProgress(({ modId, percent }) => {
      setInstallingById((prev) => ({ ...prev, [modId]: percent < 100 }));
    });
    return unsubscribe;
  }, []);

  const loadInstalled = async () => {
    if (!server) return;
    const res = await window.api.getMods(server.id);
    if (res.success) setInstalled(res.data || []);
  };

  const search = async (append = false) => {
    if (!server) return;
    setLoading(true);
    setError("");
    const nextOffset = append ? offset + 20 : 0;
    const options = {
      serverType: server.serverType,
      mcVersion: server.mcVersion,
      category: category || undefined,
      limit: 20,
      offset: nextOffset,
      index: sort,
      source
    };
    const fn =
      source === "hangar" && ["paper", "purpur"].includes(String(server.serverType).toLowerCase())
        ? window.api.searchPlugins
        : window.api.searchMods;
    const res = await fn(debouncedQuery, options);
    if (res.success) {
      const list = res.data || [];
      setResults((prev) => (append ? [...prev, ...list] : list));
      setOffset(nextOffset);
    } else {
      setError(res.error || "Search failed.");
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!server || tab !== "browse") return;
    search(false);
  }, [server?.id, debouncedQuery, category, sort, source, tab]);

  useEffect(() => {
    if (tab === "installed") loadInstalled();
  }, [tab, server?.id]);

  const installedIds = new Set(installed.map((m) => m.id));
  const canUseHangar = ["paper", "purpur"].includes(String(server?.serverType || "").toLowerCase());

  return (
    <div className="animate-fade-in">
      <div className="mb-6">
        <h1 className="font-pixel text-2xl text-accent">Mods &amp; Plugins</h1>
        <p className="mt-1 text-sm text-text-muted">Browse, install, and manage mods for your servers</p>
      </div>
      {!server ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-bg-panel py-16 text-center text-text-muted">
          No server selected - go to Servers and pick one.
        </div>
      ) : (
        <>
          <div className="mb-4 rounded-xl border border-border bg-bg-card p-4">
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <select
                value={server.id}
                onChange={(e) => setSelectedServerId(e.target.value)}
                className="rounded-lg border border-border bg-bg-input px-3 py-2 text-sm text-text-primary"
              >
                {servers.map((s) => (
                  <option key={s.id} value={s.id}>{s.name || s.id}</option>
                ))}
              </select>
              <span className="text-xs text-text-muted">
                {server.serverType} · Minecraft {server.mcVersion}
              </span>
            </div>

            <div className="flex gap-2">
              {["browse", "installed"].map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                    tab === t
                      ? "bg-accent/10 text-accent ring-1 ring-accent/30"
                      : "text-text-muted hover:bg-bg-hover hover:text-text-primary"
                  }`}
                >
                  {t === "browse" ? "Browse" : "Installed"}
                  {t === "installed" && installed.length > 0 && (
                    <span className="ml-2 rounded-full bg-accent/20 px-1.5 py-0.5 text-[10px] text-accent">
                      {installed.length}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {tab === "browse" && (
            <>
              <div className="mb-4 rounded-xl border border-border bg-bg-card p-4">
                <div className="mb-3 flex flex-wrap gap-2">
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search mods/plugins..."
                    className="min-w-56 flex-1 rounded-lg border border-border bg-bg-input px-3 py-2 text-sm text-text-primary placeholder:text-text-faint transition"
                  />

                  <div className="flex rounded-lg border border-border bg-bg-input p-0.5 text-xs">
                    <button
                      type="button"
                      onClick={() => setSource("modrinth")}
                      className={`rounded-md px-3 py-1 transition ${
                        source === "modrinth" ? "bg-accent/10 text-accent" : "text-text-muted hover:text-text-primary"
                      }`}
                    >
                      Modrinth
                    </button>
                    {canUseHangar && (
                      <button
                        type="button"
                        onClick={() => setSource("hangar")}
                        className={`rounded-md px-3 py-1 transition ${
                          source === "hangar" ? "bg-diamond/10 text-diamond" : "text-text-muted hover:text-text-primary"
                        }`}
                      >
                        Hangar
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="rounded-lg border border-border bg-bg-input px-3 py-2 text-sm text-text-primary"
                  >
                    <option value="">All Categories</option>
                    {(categoryByType[String(server.serverType || "").toLowerCase()] || []).map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                  <select
                    value={sort}
                    onChange={(e) => setSort(e.target.value)}
                    className="rounded-lg border border-border bg-bg-input px-3 py-2 text-sm text-text-primary"
                  >
                    <option value="relevance">Relevance</option>
                    <option value="downloads">Downloads</option>
                    <option value="newest">Newest</option>
                  </select>
                </div>
              </div>

              {error && (
                <div className="mb-4 rounded border border-danger/50 bg-danger/10 px-3 py-2 text-sm text-danger">
                  {error}
                </div>
              )}

              {loading && results.length === 0 ? (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="h-40 animate-pulse rounded border border-border bg-bg-panel" />
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {results.map((mod) => (
                    <ModCard
                      key={`${mod.source}:${mod.id}`}
                      mod={mod}
                      installing={Boolean(installingById[mod.id])}
                      installed={installedIds.has(mod.id)}
                      onInstall={async () => {
                        setInstallingById((prev) => ({ ...prev, [mod.id]: true }));
                        const res = await window.api.installMod(server.id, {
                          id: mod.id,
                          name: mod.title,
                          source: mod.source,
                          projectId: mod.id,
                          versionId: mod.latestVersion,
                          version: mod.latestVersion,
                          filename: `${mod.slug || mod.id}.jar`,
                          downloadUrl: mod.latestVersion?.url || mod.downloadUrl || ""
                        });
                        setInstallingById((prev) => ({ ...prev, [mod.id]: false }));
                        if (!res.success || !res.data?.success) {
                          showToast(res.error || res.data?.error || "Install failed", "error");
                        } else {
                          showToast(`${mod.title} installed.`, "success");
                        }
                        loadInstalled();
                      }}
                    />
                  ))}
                </div>
              )}

              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => search(true)}
                  className="rounded border border-border px-4 py-2 text-sm"
                  disabled={loading}
                >
                  {loading ? "Loading..." : "Load More"}
                </button>
              </div>
            </>
          )}

          {tab === "installed" && (
            <div className="rounded-xl border border-border bg-bg-card p-4">
              <div className="mb-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded-lg border border-border px-3 py-2 text-sm text-text-muted transition hover:border-accent/40 hover:text-accent"
                  onClick={async () => {
                    const res = await window.api.checkModUpdates(server.id);
                    if (!res.success) {
                      showToast(res.error || "Update check failed", "error");
                    } else {
                      showToast("Mod update check completed.", "success");
                    }
                    await loadInstalled();
                  }}
                >
                  Check Updates
                </button>
                <button
                  type="button"
                  className="rounded bg-accent px-3 py-2 text-sm text-white"
                  onClick={async () => {
                    const withUpdates = installed.filter((m) => m.updateAvailable);
                    for (const mod of withUpdates) {
                      // eslint-disable-next-line no-await-in-loop
                      await window.api.updateMod(server.id, mod.id);
                    }
                    showToast(
                      withUpdates.length
                        ? `Updated ${withUpdates.length} mod${withUpdates.length === 1 ? "" : "s"}.`
                        : "No updates were available.",
                      "success"
                    );
                    loadInstalled();
                  }}
                >
                  Update All
                </button>
                <button
                  type="button"
                  className="rounded border border-border px-3 py-2 text-sm"
                  onClick={() => window.api.openServerFolder(server.id)}
                >
                  Open mods folder
                </button>
              </div>

              {installed.length === 0 ? (
                <div className="text-sm text-text-muted">No mods/plugins installed yet.</div>
              ) : (
                <div className="space-y-2">
                  {installed.map((mod) => (
                    <div
                      key={mod.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded border border-border bg-bg-primary px-3 py-2"
                    >
                      <div>
                        <div className="text-sm font-medium">{mod.name}</div>
                        <div className="text-xs text-text-muted">
                          {mod.version} • {mod.filename}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {mod.updateAvailable && (
                          <span className="rounded bg-warning/20 px-2 py-1 text-xs text-warning">
                            Update Available
                          </span>
                        )}
                        <button
                          type="button"
                          className="rounded border border-border px-2 py-1 text-xs"
                          onClick={async () => {
                            await window.api.updateMod(server.id, mod.id);
                            showToast(`${mod.name} updated.`, "success");
                            loadInstalled();
                          }}
                        >
                          Update
                        </button>
                        <button
                          type="button"
                          className="rounded border border-danger px-2 py-1 text-xs text-danger"
                          onClick={() => setPendingRemoveId((current) => (current === mod.id ? null : mod.id))}
                        >
                          Remove
                        </button>
                      </div>
                      {pendingRemoveId === mod.id && (
                        <div className="w-full rounded-lg border border-danger/30 bg-danger/10 p-3 text-xs">
                          <div className="font-medium text-danger">Remove {mod.name}?</div>
                          <div className="mt-1 text-text-muted">This deletes the installed jar from the server.</div>
                          <div className="mt-3 flex gap-2">
                            <button
                              type="button"
                              className="rounded bg-danger px-3 py-1.5 font-medium text-white"
                              onClick={async () => {
                                await window.api.removeMod(server.id, mod.id);
                                setPendingRemoveId(null);
                                showToast(`${mod.name} removed.`, "success");
                                loadInstalled();
                              }}
                            >
                              Remove
                            </button>
                            <button
                              type="button"
                              className="rounded border border-border px-3 py-1.5 text-text-muted transition hover:bg-bg-hover hover:text-text-primary"
                              onClick={() => setPendingRemoveId(null)}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
