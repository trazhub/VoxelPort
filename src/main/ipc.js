import { ipcMain, shell } from "electron";
import path from "node:path";
import fs from "node:fs";
import RelayClient from "./relay.js";

const ROOM_CODE_REGEX = /^[A-Z0-9]{6}$/;

function ok(data = null) {
  return { success: true, data };
}

function fail(error) {
  return { success: false, error: String(error?.message || error) };
}

function fromResult(result) {
  if (result && typeof result === "object" && "success" in result) {
    if (result.success) return { success: true, data: result };
    return { success: false, error: result.error || "Operation failed", data: result };
  }

  return { success: true, data: result };
}

function stripLineFeed(value) {
  return String(value || "").replace(/[\r\n]/g, "");
}

function parseRelayAddress(raw) {
  if (!raw || !String(raw).trim()) {
    throw new Error("Relay server URL is required");
  }

  try {
    const input = String(raw).trim();
    const hasScheme = input.includes("://");
    const normalized = hasScheme ? input : input.includes(":") ? `ws://${input}` : `wss://${input}`;
    const url = new URL(normalized);

    if (url.protocol === "http:") url.protocol = "ws:";
    if (url.protocol === "https:") url.protocol = "wss:";
    if (url.protocol !== "ws:" && url.protocol !== "wss:") {
      throw new Error("Relay server URL must use ws://, wss://, http://, or https://");
    }

    if (!url.pathname || url.pathname === "/") {
      url.pathname = "/relay";
    }

    return url.toString();
  } catch (error) {
    if (error instanceof Error) throw error;
    throw new Error("Invalid relay server URL");
  }
}

function sanitizeSettings(settings = {}) {
  const relayServerUrl = String(settings.relayServerUrl || "").trim();
  const defaultRam = Math.max(512, Number(settings.defaultRam || 2048));

  return {
    ...settings,
    relayServerUrl,
    defaultRam
  };
}

export function registerIpc({
  getMainWindow,
  store,
  serverManager,
  installManager,
  modManager,
  app,
  dialog
}) {
  let relayClient = null;
  let activeRoomCode = null;
  let relayClientUrl = null;

  const emit = (channel, payload) => {
    const mainWindow = getMainWindow?.();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(channel, payload);
    }
  };

  const getServers = () => store.get("servers", []);
  const setServers = (servers) => store.set("servers", servers);
  const getSettings = () => sanitizeSettings(store.get("settings", {}));

  serverManager.on("output", ({ serverId, line }) => {
    emit("console-output", { serverId, line });
  });

  serverManager.on("error", ({ serverId, error }) => {
    emit("console-output", { serverId, line: `[ERROR] ${error}` });
  });

  ipcMain.handle("start-server", async (_event, config) => {
    try {
      return fromResult(await serverManager.startServer(config));
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("stop-server", async (_event, serverId) => {
    try {
      return fromResult(await serverManager.stopServer(serverId));
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("send-command", async (_event, { serverId, command }) => {
    try {
      return fromResult(await serverManager.sendCommand(serverId, stripLineFeed(command)));
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("get-server-stats", async (_event, serverId) => {
    try {
      return ok(await serverManager.getStats(serverId));
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("get-servers", async () => {
    try {
      return ok(
        getServers().map((server) => ({
          ...server,
          status: serverManager.getStatus(server.id),
          playerCount: serverManager.serverMeta.get(server.id)?.playerCount || 0
        }))
      );
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("add-server", async (_event, config) => {
    try {
      const NAME_REGEX = /^[a-zA-Z0-9_-]{1,64}$/;
      if (!config?.id || !NAME_REGEX.test(String(config.id))) {
        throw new Error("Invalid server id");
      }
      if (!config?.path || !path.isAbsolute(String(config.path))) {
        throw new Error("Server path must be absolute");
      }
      if (config.javaPath && typeof config.javaPath === "string") {
        const jp = config.javaPath.trim();
        if (jp && !fs.existsSync(jp)) {
          throw new Error("Java path does not exist");
        }
      }
      const safe = {
        id: String(config.id),
        name: String(config.name || config.id),
        path: path.resolve(String(config.path)),
        port: Number(config.port) || 25565,
        ram: Number(config.ram) || 2048,
        serverType: String(config.serverType || ""),
        mcVersion: String(config.mcVersion || ""),
        cracked: Boolean(config.cracked),
        javaPath: config.javaPath ? String(config.javaPath).trim() : null,
        loaderVersion: config.loaderVersion ? String(config.loaderVersion) : null
      };
      const filtered = getServers().filter((s) => s.id !== safe.id);
      filtered.push(safe);
      setServers(filtered);
      return ok(safe);
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("remove-server", async (_event, serverId) => {
    try {
      await serverManager.stopServer(serverId).catch(() => null);
      setServers(getServers().filter((server) => server.id !== serverId));
      return ok({ serverId });
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("fetch-versions", async (_event, serverType) => {
    try {
      return ok(await installManager.fetchVersions(serverType));
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("install-server", async (_event, config) => {
    try {
      const result = await installManager.install(config, (progress) => {
        emit("install-progress", progress);
      });

      if (result.success && result.serverConfig) {
        const servers = getServers();
        servers.push(result.serverConfig);
        setServers(servers);
      }

      return fromResult(result);
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("cancel-install", async () => {
    try {
      installManager.cancelInstall();
      return ok({ canceled: true });
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("detect-java", async () => {
    try {
      return ok({ javaPath: await installManager.detectJava() });
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("find-free-port", async (_event, startPort) => {
    try {
      return ok({ port: await installManager.findNextFreePort(startPort) });
    } catch (error) {
      return fail(error);
    }
  });

  const getServerById = (serverId) => getServers().find((server) => server.id === serverId);

  ipcMain.handle("search-mods", async (_event, { query, options }) => {
    try {
      return ok(await modManager.searchModrinth(query, options));
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("search-plugins", async (_event, { query, options }) => {
    try {
      const source = options?.source || "modrinth";
      if (source === "hangar") return ok(await modManager.searchHangar(query, options));
      return ok(await modManager.searchModrinth(query, options));
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("install-mod", async (_event, { serverId, modData }) => {
    try {
      const result = await modManager.installMod(serverId, modData, (progress) => {
        emit("mod-progress", { serverId, ...progress, modId: modData.id });
      });
      return fromResult(result);
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("install-plugin", async (_event, { serverId, pluginData }) => {
    try {
      const result = await modManager.installMod(serverId, pluginData, (progress) => {
        emit("mod-progress", { serverId, ...progress, modId: pluginData.id });
      });
      return fromResult(result);
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("get-mods", async (_event, serverId) => {
    try {
      return ok(await modManager.getMods(serverId));
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("remove-mod", async (_event, { serverId, modId }) => {
    try {
      return fromResult(await modManager.removeMod(serverId, modId));
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("check-mod-updates", async (_event, serverId) => {
    try {
      return ok(await modManager.checkUpdates(serverId));
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("update-mod", async (_event, { serverId, modId }) => {
    try {
      const result = await modManager.updateMod(serverId, modId, (progress) => {
        emit("mod-progress", { serverId, modId, ...progress });
      });
      return fromResult(result);
    } catch (error) {
      return fail(error);
    }
  });

  const resetRelayClient = async () => {
    if (!relayClient) {
      relayClientUrl = null;
      return;
    }

    relayClient.closeRoom();
    await relayClient.leaveRoom().catch(() => null);
    relayClient.removeAllListeners();
    relayClient = null;
    relayClientUrl = null;
    activeRoomCode = null;
  };

  const ensureRelayClient = async () => {
    const relayAddress = getSettings().relayServerUrl;
    const parsed = parseRelayAddress(String(relayAddress));

    if (relayClient && relayClientUrl === parsed) {
      return relayClient;
    }

    await resetRelayClient();
    relayClient = new RelayClient(parsed);
    relayClientUrl = parsed;

    relayClient.on("player-joined", ({ playerCount }) => {
      emit("room-status", { code: activeRoomCode, playerCount, status: "active" });
    });

    relayClient.on("player-left", ({ playerCount }) => {
      emit("room-status", { code: activeRoomCode, playerCount, status: "active" });
    });

    relayClient.on("connected", () => {
      emit("room-status", {
        code: activeRoomCode,
        playerCount: relayClient.getPlayerCount(),
        status: "connected",
        localPort: relayClient.localProxyServer?.address()?.port || undefined
      });
    });

    relayClient.on("disconnected", () => {
      emit("room-status", { code: activeRoomCode, playerCount: 0, status: "disconnected" });
    });

    relayClient.on("room-closed", () => {
      emit("room-status", { code: activeRoomCode, playerCount: 0, status: "closed" });
    });

    relayClient.on("error", (error) => {
      emit("room-status", {
        code: activeRoomCode,
        playerCount: relayClient.getPlayerCount(),
        status: "error",
        error: String(error?.message || error)
      });
    });

    return relayClient;
  };

  ipcMain.handle("create-room", async (_event, serverPort) => {
    try {
      const port = Number(serverPort);
      if (!Number.isInteger(port) || port < 1024 || port > 65535) {
        throw new Error("Invalid server port: must be between 1024 and 65535");
      }
      const client = await ensureRelayClient();
      const result = await client.createRoom(port);
      activeRoomCode = result.code;
      emit("room-status", { code: activeRoomCode, playerCount: 0, status: "created" });
      return ok(result);
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("join-room", async (_event, code) => {
    try {
      const normalized = String(code || "").toUpperCase();
      if (!ROOM_CODE_REGEX.test(normalized)) {
        throw new Error("Room code must match /^[A-Z0-9]{6}$/");
      }

      const client = await ensureRelayClient();
      const result = await client.joinRoom(normalized);
      activeRoomCode = normalized;
      emit("room-status", {
        code: activeRoomCode,
        playerCount: 0,
        status: "connected",
        localPort: result.localPort
      });
      return ok(result);
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("close-room", async () => {
    try {
      relayClient?.closeRoom();
      emit("room-status", { code: activeRoomCode, playerCount: 0, status: "closed" });
      activeRoomCode = null;
      return ok({ closed: true });
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("leave-room", async () => {
    try {
      await relayClient?.leaveRoom();
      emit("room-status", { code: activeRoomCode, playerCount: 0, status: "left" });
      activeRoomCode = null;
      return ok({ left: true });
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("select-folder", async () => {
    try {
      const mainWindow = getMainWindow?.();
      const result = await dialog.showOpenDialog(mainWindow, {
        properties: ["openDirectory", "createDirectory"]
      });

      if (result.canceled || !result.filePaths.length) return ok({ canceled: true });
      return ok({ path: result.filePaths[0] });
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("open-external", async (_event, url) => {
    try {
      const parsed = new URL(String(url || ""));
      if (!["https:", "http:"].includes(parsed.protocol)) {
        throw new Error(`URL scheme "${parsed.protocol}" is not allowed`);
      }
      await shell.openExternal(parsed.toString());
      return ok({ opened: true });
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("get-app-version", async () => ok({ version: app.getVersion() }));
  ipcMain.handle("get-settings", async () => ok(getSettings()));

  ipcMain.handle("save-settings", async (_event, settings) => {
    try {
      store.set("settings", sanitizeSettings({ ...getSettings(), ...settings }));
      await resetRelayClient();
      return ok(store.get("settings"));
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("test-relay", async (_event, relayUrl) => {
    try {
      const relayAddress = String(relayUrl || "").trim() || getSettings().relayServerUrl;
      const parsed = parseRelayAddress(String(relayAddress));
      const WebSocket = (await import("ws")).default;
      const start = Date.now();

      await new Promise((resolve, reject) => {
        const ws = new WebSocket(parsed);
        const timer = setTimeout(() => {
          ws.terminate();
          reject(new Error("Connection timed out after 5s"));
        }, 5000);
        ws.on("open", () => {
          clearTimeout(timer);
          ws.close();
          resolve();
        });
        ws.on("error", (err) => {
          clearTimeout(timer);
          reject(err);
        });
      });

      return ok({ success: true, latencyMs: Date.now() - start, url: parsed });
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("open-server-folder", async (_event, serverId) => {
    try {
      const server = getServerById(serverId);
      if (!server || !server.path || !fs.existsSync(server.path)) {
        throw new Error("Server folder not found");
      }

      const openError = await shell.openPath(path.resolve(server.path));
      if (openError) throw new Error(openError);
      return ok({ opened: true });
    } catch (error) {
      return fail(error);
    }
  });

  // ─── Custom title-bar window controls ───────────────────────────────────
  ipcMain.handle("window-minimize", () => {
    const win = getMainWindow?.();
    win?.minimize();
    return ok();
  });

  ipcMain.handle("window-maximize-toggle", () => {
    const win = getMainWindow?.();
    if (!win) return ok({ maximized: false });
    if (win.isMaximized()) {
      win.unmaximize();
      return ok({ maximized: false });
    }
    win.maximize();
    return ok({ maximized: true });
  });

  ipcMain.handle("window-close", () => {
    const win = getMainWindow?.();
    win?.close();
    return ok();
  });

  ipcMain.handle("window-is-maximized", () => {
    const win = getMainWindow?.();
    return ok({ maximized: Boolean(win?.isMaximized()) });
  });
}

export default registerIpc;
