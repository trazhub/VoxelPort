import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Server } from "lucide-react";
import { useAppContext, useToast } from "../App.jsx";
import ConfirmModal from "../components/ConfirmModal.jsx";
import InputModal from "../components/InputModal.jsx";
import ServerCard from "../components/ServerCard.jsx";

export default function Home() {
  const navigate = useNavigate();
  const { servers, refreshServers, loadingServers, setSelectedServerId, settings } = useAppContext();
  const { showToast } = useToast();
  const [consoleByServer, setConsoleByServer] = useState({});
  const [statsByServer, setStatsByServer] = useState({});
  const [modUpdateCounts, setModUpdateCounts] = useState({});
  const [renameTarget, setRenameTarget] = useState(null);
  const [removeTarget, setRemoveTarget] = useState(null);

  useEffect(() => {
    const unsub = window.api.onConsoleOutput(({ serverId, line }) => {
      setConsoleByServer((prev) => {
        const next = [...(prev[serverId] || []), line];
        if (next.length > 500) next.splice(0, next.length - 500);
        return { ...prev, [serverId]: next };
      });
    });
    return unsub;
  }, []);

  useEffect(() => {
    refreshServers();

    // Check for mod updates in background
    const timer = setTimeout(async () => {
      const res = await window.api.getServers();
      if (!res.success) return;
      for (const server of (res.data || [])) {
        window.api.checkModUpdates(server.id).catch(() => null);
      }
    }, 3000);

    return () => clearTimeout(timer);
  }, [refreshServers]);

  useEffect(() => {
    const timer = setInterval(async () => {
      const running = servers.filter((s) => s.status === "running" || s.status === "starting");
      if (!running.length) return;

      await Promise.all(
        running.map(async (server) => {
          const res = await window.api.getServerStats(server.id);
          if (res.success) setStatsByServer((prev) => ({ ...prev, [server.id]: res.data }));
        })
      );
    }, 2500);

    return () => clearInterval(timer);
  }, [servers]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!servers.length) {
        setModUpdateCounts({});
        return;
      }

      const results = await Promise.all(
        servers.map(async (server) => {
          const res = await window.api.checkModUpdates(server.id);
          const updates = res.success && Array.isArray(res.data)
            ? res.data.filter((entry) => entry.hasUpdate).length
            : 0;
          return [server.id, updates];
        })
      );

      if (!cancelled) {
        setModUpdateCounts(Object.fromEntries(results));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [servers]);

  const sortedServers = useMemo(
    () => [...servers].sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id)),
    [servers]
  );

  const runAction = async (promiseFactory, successMessage = "") => {
    const res = await promiseFactory();
    if (!res.success) {
      showToast(res.error || "Operation failed", "error");
      return false;
    }
    await refreshServers();
    if (successMessage) showToast(successMessage, "success");
    return true;
  };

  const onlineCount = servers.filter((s) => s.status === "running").length;

  if (loadingServers) {
    return (
      <div className="flex h-48 items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-3 h-6 w-6 animate-spin rounded-sm border-2 border-accent border-t-transparent" />
          <p className="text-sm text-text-faint">Loading servers...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <InputModal
        open={Boolean(renameTarget)}
        title="Rename Server"
        placeholder="Enter a new server name"
        initialValue={renameTarget?.name || renameTarget?.id || ""}
        confirmLabel="Rename"
        onCancel={() => setRenameTarget(null)}
        onConfirm={async (value) => {
          const nextName = String(value || "").trim();
          if (!renameTarget || !nextName) {
            setRenameTarget(null);
            return;
          }
          const renamed = await runAction(
            () => window.api.addServer({ ...renameTarget, name: nextName }),
            "Server renamed."
          );
          if (renamed) setRenameTarget(null);
        }}
      />

      <ConfirmModal
        open={Boolean(removeTarget)}
        title="Remove Server"
        message={removeTarget
          ? `Remove "${removeTarget.name || removeTarget.id}"? This only removes it from the list.`
          : ""}
        confirmLabel="Remove"
        destructive
        onCancel={() => setRemoveTarget(null)}
        onConfirm={async () => {
          if (!removeTarget) return;
          const removed = await runAction(
            () => window.api.removeServer(removeTarget.id),
            "Server removed."
          );
          if (removed) setRemoveTarget(null);
        }}
      />

      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="font-pixel text-2xl text-accent">Servers</h1>
          <p className="mt-1 text-sm text-text-muted">
            {servers.length === 0
              ? "No servers yet - install your first one."
              : `${servers.length} server${servers.length !== 1 ? "s" : ""} · ${onlineCount} online`}
          </p>
        </div>
        <button
          type="button"
          id="install-new-server-btn"
          onClick={() => navigate("/install")}
          className="inline-flex items-center gap-2 rounded-lg bg-accent/10 px-4 py-2 text-sm font-medium text-accent ring-1 ring-accent/30 transition hover:bg-accent hover:text-bg-primary hover:shadow-glow-green"
        >
          <Plus size={15} />
          Install Server
        </button>
      </div>

      {sortedServers.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-bg-panel py-20 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-xl bg-accent/10 ring-1 ring-accent/20">
            <Server size={28} className="text-accent" />
          </div>
          <h2 className="mb-2 font-pixel text-lg text-text-primary">No Servers Yet</h2>
          <p className="mb-6 max-w-xs text-sm text-text-muted">
            Install a Minecraft server to get started. Supports Paper, Fabric, Forge, Vanilla and more.
          </p>
          <button
            type="button"
            onClick={() => navigate("/install")}
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-bg-primary shadow-glow-green transition hover:bg-accent-hover"
          >
            <Plus size={14} />
            Install First Server
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {sortedServers.map((server) => (
            <ServerCard
              key={server.id}
              server={server}
              stats={statsByServer[server.id]}
              consoleLines={consoleByServer[server.id] || []}
              updateCount={modUpdateCounts[server.id] || 0}
              onStart={() =>
                runAction(
                  () =>
                    window.api.startServer({
                      id: server.id,
                      path: server.path,
                      port: server.port,
                      ram: server.ram,
                      javaPath: server.javaPath || settings?.defaultJavaPath || undefined
                    }),
                  "Server started!"
                )
              }
              onStop={() => runAction(() => window.api.stopServer(server.id), "Server stopped!")}
              onOpenRoom={() => navigate(`/create-room?serverId=${encodeURIComponent(server.id)}`)}
              onMods={() => {
                setSelectedServerId(server.id);
                navigate("/mods");
              }}
              onRename={() => setRenameTarget(server)}
              onRemove={() => setRemoveTarget(server)}
              onOpenFolder={() => runAction(() => window.api.openServerFolder(server.id))}
              onSendCommand={(command) => runAction(() => window.api.sendCommand(server.id, command))}
              onClearConsole={() => setConsoleByServer((prev) => ({ ...prev, [server.id]: [] }))}
            />
          ))}
        </div>
      )}
    </div>
  );
}
