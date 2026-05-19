import { app, BrowserWindow, Menu, dialog } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Store from "electron-store";
import ServerManager from "./server.js";
import InstallManager from "./installer.js";
import ModManager from "./modManager.js";
import { registerIpc } from "./ipc.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const store = new Store({
  defaults: {
    servers: [],
    settings: {
      relayServerUrl: "",
      defaultRam: 2048,
      defaultJavaPath: "",
      defaultInstallLocation: path.join(app.getPath("documents"), "MinecraftServers"),
      theme: "dark"
    },
    windowBounds: {
      width: 1100,
      height: 700
    }
  }
});

let mainWindow = null;
const serverManager = new ServerManager();
const installManager = new InstallManager();
const modManager = new ModManager((serverId) => {
  const servers = store.get("servers", []);
  return servers.find((server) => server.id === serverId);
});

function createMainWindow() {
  const bounds = store.get("windowBounds");
  const width = Math.max(800, Number(bounds?.width || 1100));
  const height = Math.max(600, Number(bounds?.height || 700));

  mainWindow = new BrowserWindow({
    width,
    height,
    x: Number.isInteger(bounds?.x) ? bounds.x : undefined,
    y: Number.isInteger(bounds?.y) ? bounds.y : undefined,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: "#0a0c10",
    frame: false,
    titleBarStyle: "hidden",
    trafficLightPosition: { x: -100, y: -100 }, // hide macOS traffic lights (we draw our own)
    webPreferences: {
      preload: path.join(__dirname, "..", "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.on("close", () => {
    if (!mainWindow) return;
    store.set("windowBounds", mainWindow.getBounds());
  });

  mainWindow.on("maximize",   () => mainWindow?.webContents.send("window-maximize-change", { maximized: true  }));
  mainWindow.on("unmaximize", () => mainWindow?.webContents.send("window-maximize-change", { maximized: false }));

  if (!app.isPackaged) {
    const devUrl = process.env.VITE_DEV_SERVER_URL || "http://127.0.0.1:5173";
    mainWindow.loadURL(devUrl);
  } else {
    mainWindow.loadFile(path.join(app.getAppPath(), "dist", "renderer", "index.html"));
    Menu.setApplicationMenu(null);
  }
}

app.whenReady().then(async () => {
  createMainWindow();
  // Prevent system sleep on Linux (relay server machine)
  if (process.platform === "linux") {
    const { powerSaveBlocker } = await import("electron");
    powerSaveBlocker.start("prevent-app-suspension");
  }
  registerIpc({
    getMainWindow: () => mainWindow,
    store,
    serverManager,
    installManager,
    modManager,
    app,
    dialog
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});


app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", async () => {
  const servers = store.get("servers", []);
  await Promise.allSettled(servers.map((server) => serverManager.stopServer(server.id)));
});
