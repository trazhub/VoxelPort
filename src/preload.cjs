const { contextBridge, ipcRenderer } = require("electron");

function subscribe(channel, callback) {
  const handler = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.off(channel, handler);
}

contextBridge.exposeInMainWorld("api", {
  startServer: (config) => ipcRenderer.invoke("start-server", config),
  stopServer: (serverId) => ipcRenderer.invoke("stop-server", serverId),
  getServers: () => ipcRenderer.invoke("get-servers"),
  addServer: (config) => ipcRenderer.invoke("add-server", config),
  removeServer: (serverId) => ipcRenderer.invoke("remove-server", serverId),
  sendCommand: (serverId, command) => ipcRenderer.invoke("send-command", { serverId, command }),
  onConsoleOutput: (callback) => subscribe("console-output", callback),
  getServerStats: (serverId) => ipcRenderer.invoke("get-server-stats", serverId),

  fetchVersions: (serverType) => ipcRenderer.invoke("fetch-versions", serverType),
  installServer: (config) => ipcRenderer.invoke("install-server", config),
  onInstallProgress: (callback) => subscribe("install-progress", callback),
  cancelInstall: () => ipcRenderer.invoke("cancel-install"),
  detectJava: () => ipcRenderer.invoke("detect-java"),
  findFreePort: (startPort) => ipcRenderer.invoke("find-free-port", startPort),

  searchMods: (query, options) => ipcRenderer.invoke("search-mods", { query, options }),
  searchPlugins: (query, options) => ipcRenderer.invoke("search-plugins", { query, options }),
  installMod: (serverId, modData) => ipcRenderer.invoke("install-mod", { serverId, modData }),
  installPlugin: (serverId, pluginData) =>
    ipcRenderer.invoke("install-plugin", { serverId, pluginData }),
  getMods: (serverId) => ipcRenderer.invoke("get-mods", serverId),
  removeMod: (serverId, modId) => ipcRenderer.invoke("remove-mod", { serverId, modId }),
  checkModUpdates: (serverId) => ipcRenderer.invoke("check-mod-updates", serverId),
  updateMod: (serverId, modId) => ipcRenderer.invoke("update-mod", { serverId, modId }),
  onModProgress: (callback) => subscribe("mod-progress", callback),

  createRoom: (serverPort) => ipcRenderer.invoke("create-room", serverPort),
  joinRoom: (code) => ipcRenderer.invoke("join-room", code),
  closeRoom: () => ipcRenderer.invoke("close-room"),
  leaveRoom: () => ipcRenderer.invoke("leave-room"),
  testRelay: (relayUrl) => ipcRenderer.invoke("test-relay", relayUrl),
  onRoomStatus: (callback) => subscribe("room-status", callback),

  selectFolder: () => ipcRenderer.invoke("select-folder"),
  openExternal: (url) => ipcRenderer.invoke("open-external", url),
  getAppVersion: () => ipcRenderer.invoke("get-app-version"),

  getSettings: () => ipcRenderer.invoke("get-settings"),
  saveSettings: (settings) => ipcRenderer.invoke("save-settings", settings),
  openServerFolder: (serverId) => ipcRenderer.invoke("open-server-folder", serverId),

  // Custom title-bar window controls
  windowMinimize:      () => ipcRenderer.invoke("window-minimize"),
  windowMaximizeToggle:() => ipcRenderer.invoke("window-maximize-toggle"),
  windowClose:         () => ipcRenderer.invoke("window-close"),
  windowIsMaximized:   () => ipcRenderer.invoke("window-is-maximized"),
  onWindowMaximizeChange: (callback) => {
    const handler = (_e, payload) => callback(payload);
    ipcRenderer.on("window-maximize-change", handler);
    return () => ipcRenderer.off("window-maximize-change", handler);
  }
});
