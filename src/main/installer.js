import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import net from "node:net";
import { spawn, spawnSync } from "node:child_process";
import axios from "axios";

const VERSION_CACHE_TTL = 10 * 60 * 1000;
const NAME_REGEX = /^[a-zA-Z0-9_-]{1,64}$/;
const ALLOWED_DOMAINS = new Set([
  "api.papermc.io",
  "api.purpurmc.org",
  "launchermeta.mojang.com",
  "s3.amazonaws.com",
  "meta.fabricmc.net",
  "maven.fabricmc.net",
  "files.minecraftforge.net",
  "maven.minecraftforge.net",
  "maven.neoforged.net",
  "cdn.modrinth.com",
  "hangar.papermc.io"
]);

function toSafeError(error) {
  if (error?.code === "ENOSPC") return "Disk is full. Free some disk space and retry.";
  return String(error?.message || error || "Unknown error");
}

function hostnameAllowed(rawUrl) {
  const parsed = new URL(rawUrl);
  return ALLOWED_DOMAINS.has(parsed.hostname);
}

function ensureAllowedUrl(rawUrl) {
  if (!hostnameAllowed(rawUrl)) {
    throw new Error(`Download host is not allowed: ${new URL(rawUrl).hostname}`);
  }
}

function parseForgePromotions(promotions) {
  const promos = promotions?.promos || {};
  const results = [];
  for (const [key, value] of Object.entries(promos)) {
    const [mcVersion, channel] = key.split("-");
    if (!mcVersion || !value) continue;
    const loaderVersion = `${mcVersion}-${value}`;
    results.push({
      id: loaderVersion,
      mcVersion,
      loaderVersion,
      label: `${loaderVersion} (${channel})`,
      stable: channel === "recommended",
      recommended: channel === "recommended"
    });
  }
  return results.sort((a, b) => (a.recommended === b.recommended ? 0 : a.recommended ? -1 : 1));
}

export class InstallManager {
  constructor() {
    this.versionCache = new Map();
    this.cancelRequested = false;
    this.activeAbortController = null;
  }

  resetCancelState() {
    this.cancelRequested = false;
    this.activeAbortController = null;
  }

  cancelInstall() {
    this.cancelRequested = true;
    if (this.activeAbortController) {
      this.activeAbortController.abort("Installation canceled by user");
    }
  }

  checkCanceled() {
    if (this.cancelRequested) throw new Error("Installation canceled by user");
  }

  validateName(name) {
    return NAME_REGEX.test(String(name || ""));
  }

  validatePath(inputPath) {
    if (!inputPath || !path.isAbsolute(inputPath)) return false;
    const normalized = path.normalize(inputPath);
    if (normalized.split(path.sep).includes("..")) return false;
    const parent = path.dirname(normalized);
    return fs.existsSync(parent);
  }

  async detectJava() {
    const pathProbe = spawnSync("java", ["-version"], { stdio: "ignore" });
    if (pathProbe.status === 0 || pathProbe.status === 1) return "java";

    if (process.env.JAVA_HOME) {
      const javaPath = path.join(
        process.env.JAVA_HOME,
        "bin",
        os.platform() === "win32" ? "java.exe" : "java"
      );
      if (fs.existsSync(javaPath)) return javaPath;
    }

    if (os.platform() === "win32") {
      const roots = [
        "C:\\Program Files\\Java",
        "C:\\Program Files\\Eclipse Adoptium",
        "C:\\Program Files\\Microsoft",
        "C:\\Program Files\\Zulu",
        "C:\\Program Files\\Amazon Corretto",
        "C:\\Program Files\\BellSoft",
        "C:\\Program Files\\Semeru"
      ];

      for (const root of roots) {
        if (!fs.existsSync(root)) continue;
        for (const dir of fs.readdirSync(root)) {
          const javaPath = path.join(root, dir, "bin", "java.exe");
          if (!fs.existsSync(javaPath)) continue;
          const probe = spawnSync(javaPath, ["-version"], { stdio: "ignore" });
          if (probe.status === 0 || probe.status === 1) return javaPath;
        }
      }
    }

    return null;
  }

  async findNextFreePort(startPort) {
    let port = Number(startPort || 25565);
    while (port < 65535) {
      // eslint-disable-next-line no-await-in-loop
      const open = await new Promise((resolve) => {
        const tester = net
          .createServer()
          .once("error", () => resolve(false))
          .once("listening", () => tester.close(() => resolve(true)))
          .listen(port, "127.0.0.1");
      });
      if (open) return port;
      port += 1;
    }
    throw new Error("No free ports available");
  }

  async fetchVersions(serverType) {
    const type = String(serverType || "").toLowerCase();
    const cacheKey = `versions:${type}`;
    const cached = this.versionCache.get(cacheKey);
    if (cached && Date.now() - cached.at < VERSION_CACHE_TTL) {
      return cached.data;
    }

    let data = [];
    if (type === "paper") {
      const res = await axios.get("https://api.papermc.io/v2/projects/paper");
      const versions = [...(res.data?.versions || [])].reverse();
      data = versions.map((id, idx) => ({
        id,
        label: id,
        stable: true,
        recommended: idx === 0
      }));
    } else if (type === "purpur") {
      const res = await axios.get("https://api.purpurmc.org/v2/purpur");
      const versions = [...(res.data?.versions || [])].reverse();
      data = versions.map((id, idx) => ({
        id,
        label: id,
        stable: true,
        recommended: idx === 0
      }));
    } else if (type === "vanilla") {
      const manifest = await axios.get(
        "https://launchermeta.mojang.com/mc/game/version_manifest.json"
      );
      data = (manifest.data?.versions || [])
        .filter((v) => v.type === "release")
        .map((v, idx) => ({
          id: v.id,
          label: v.id,
          stable: true,
          recommended: idx === 0
        }));
    } else if (type === "fabric") {
      const [games, loaders] = await Promise.all([
        axios.get("https://meta.fabricmc.net/v2/versions/game"),
        axios.get("https://meta.fabricmc.net/v2/versions/loader")
      ]);
      const latestLoader = loaders.data?.[0]?.version || null;
      data = (games.data || [])
        .filter((g) => g.stable)
        .map((g, idx) => ({
          id: g.version,
          label: g.version,
          stable: true,
          recommended: idx === 0,
          loaderVersion: latestLoader
        }));
    } else if (type === "forge" || type === "neoforge") {
      const promo = await axios.get(
        "https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json"
      );
      data = parseForgePromotions(promo.data);
    } else {
      throw new Error(`Unsupported server type: ${serverType}`);
    }

    this.versionCache.set(cacheKey, { at: Date.now(), data });
    return data;
  }

  async install(config, onProgress = () => {}) {
    this.resetCancelState();

    try {
      const normalizedType = String(config?.serverType || "").toLowerCase();
      if (config?.eulaAccepted !== true) {
        throw new Error("EULA must be accepted before installation.");
      }
      if (!this.validateName(config?.name)) {
        throw new Error("Invalid server name. Use letters, numbers, _ or - (max 64 chars).");
      }
      if (!this.validatePath(config?.installPath)) {
        throw new Error("Install path must be absolute, without '..', and parent must exist.");
      }

      const installBase = path.resolve(config.installPath);
      const serverDir = path.join(installBase, config.name);
      await fsp.mkdir(serverDir, { recursive: true });

      const port = await this.findNextFreePort(Number(config.port || 25565));
      const ram = Number(config.ram || 2048);
      const mcVersion = String(config.mcVersion || "");
      const loaderVersion = String(config.loaderVersion || "");

      onProgress({ stage: "validating", percent: 5, message: "Validating configuration..." });

      let jarUrl = "";
      let jarName = "server.jar";
      let forgeLog = [];

      if (normalizedType === "paper") {
        const builds = await axios.get(
          `https://api.papermc.io/v2/projects/paper/versions/${encodeURIComponent(mcVersion)}`
        );
        const latestBuild = builds.data?.builds?.at(-1);
        if (!latestBuild) throw new Error("No Paper build found for selected version.");
        jarUrl = `https://api.papermc.io/v2/projects/paper/versions/${mcVersion}/builds/${latestBuild}/downloads/paper-${mcVersion}-${latestBuild}.jar`;
      } else if (normalizedType === "purpur") {
        jarUrl = `https://api.purpurmc.org/v2/purpur/${encodeURIComponent(mcVersion)}/latest/download`;
      } else if (normalizedType === "vanilla") {
        const manifest = await axios.get(
          "https://launchermeta.mojang.com/mc/game/version_manifest.json"
        );
        const versionMeta = (manifest.data?.versions || []).find((v) => v.id === mcVersion);
        if (!versionMeta?.url) throw new Error("Version metadata not found in Mojang manifest.");
        const versionInfo = await axios.get(versionMeta.url);
        jarUrl = versionInfo.data?.downloads?.server?.url;
        if (!jarUrl) throw new Error("Vanilla server download URL not found.");
      } else if (normalizedType === "fabric") {
        const installerRes = await axios.get("https://meta.fabricmc.net/v2/versions/installer");
        const installerVersion = installerRes.data?.[0]?.version;
        if (!installerVersion) throw new Error("Fabric installer version not found.");
        const loader = loaderVersion || (await this.fetchVersions("fabric"))?.[0]?.loaderVersion;
        if (!loader) throw new Error("Fabric loader version not available.");
        jarUrl = `https://meta.fabricmc.net/v2/versions/loader/${mcVersion}/${loader}/${installerVersion}/server/jar`;
      } else if (normalizedType === "forge") {
        const selectedLoader = loaderVersion || mcVersion;
        jarName = "forge-installer.jar";
        jarUrl = `https://maven.minecraftforge.net/net/minecraftforge/forge/${selectedLoader}/forge-${selectedLoader}-installer.jar`;
      } else if (normalizedType === "neoforge") {
        const selectedLoader = loaderVersion || mcVersion;
        jarName = "neoforge-installer.jar";
        jarUrl = `https://maven.neoforged.net/releases/net/neoforged/neoforge/${selectedLoader}/neoforge-${selectedLoader}-installer.jar`;
      } else {
        throw new Error(`Unsupported server type: ${config.serverType}`);
      }

      this.checkCanceled();
      const targetPath = path.join(serverDir, jarName);
      onProgress({ stage: "downloading", percent: 20, message: `Downloading ${jarName}...` });
      await this.downloadFile(jarUrl, targetPath, (d) => {
        onProgress({
          stage: "downloading",
          percent: 20 + Math.floor((d.percent || 0) * 0.5),
          message: `Downloading ${jarName}...`,
          bytesDownloaded: d.bytesDownloaded,
          totalBytes: d.totalBytes
        });
      });

      this.checkCanceled();
      if (normalizedType === "forge" || normalizedType === "neoforge") { // eslint-disable-line no-lonely-if
        onProgress({ stage: "installing", percent: 75, message: "Running Forge installer..." });
        const result = await this.runForgeInstaller(targetPath, serverDir, (line) => {
          forgeLog.push(line);
          if (forgeLog.length > 200) forgeLog.shift();
          onProgress({
            stage: "installing",
            percent: 75,
            message: line,
            forgeOutput: [...forgeLog]
          });
        });
        if (!result.success) {
          const lastLines = forgeLog.slice(-20).join("\n");
          throw new Error(`Forge installer failed (exit ${result.exitCode}).\n${lastLines}`);
        }

        const jarCandidates = (await fsp.readdir(serverDir))
          .filter((name) => name.endsWith(".jar") && !name.includes("installer"))
          .sort((a, b) => (a.includes("server") ? -1 : b.includes("server") ? 1 : 0));
        const chosenJar = jarCandidates[0];
        if (!chosenJar) throw new Error("Forge install completed but no server JAR was found.");
        await fsp.copyFile(path.join(serverDir, chosenJar), path.join(serverDir, "server.jar"));
      } else {
        await fsp.rename(targetPath, path.join(serverDir, "server.jar"));
      }

      onProgress({ stage: "configuring", percent: 90, message: "Writing server config..." });
      await this.writeServerProperties(serverDir, { ...config, port });
      await fsp.writeFile(path.join(serverDir, "eula.txt"), "eula=true\n", "utf8");

      this.checkCanceled();
      onProgress({ stage: "done", percent: 100, message: "Installation complete." });

      const serverConfig = {
        id: config.name,
        name: config.name,
        path: serverDir,
        port,
        ram,
        serverType: config.serverType,
        mcVersion,
        loaderVersion: loaderVersion || null,
        cracked: Boolean(config.cracked),
        javaPath: config.javaPath || null
      };

      return { success: true, serverConfig };
    } catch (error) {
      return { success: false, error: toSafeError(error) };
    } finally {
      this.resetCancelState();
    }
  }

  async downloadFile(url, destPath, onProgress = () => {}) {
    ensureAllowedUrl(url);
    this.checkCanceled();

    const controller = new AbortController();
    this.activeAbortController = controller;

    await fsp.mkdir(path.dirname(destPath), { recursive: true });
    const writer = fs.createWriteStream(destPath);

    try {
      const response = await axios.get(url, {
        responseType: "stream",
          signal: controller.signal,
          headers: {
            "User-Agent": "VoxelPort/1.0.0 (https://github.com/voxelport/voxelport)"
          }
        });

      const totalBytes = Number(response.headers["content-length"] || 0);
      let bytesDownloaded = 0;

      await new Promise((resolve, reject) => {
        response.data.on("data", (chunk) => {
          bytesDownloaded += chunk.length;
          onProgress({
            bytesDownloaded,
            totalBytes,
            percent: totalBytes > 0 ? Math.round((bytesDownloaded / totalBytes) * 100) : 0
          });
        });
        response.data.on("error", reject);
        writer.on("error", reject);
        writer.on("finish", resolve);
        response.data.pipe(writer);
      });

      const stat = await fsp.stat(destPath);
      if (stat.size <= 0) throw new Error("Downloaded file is empty.");
    } catch (error) {
      await fsp.rm(destPath, { force: true });
      throw error;
    }
  }

  async runForgeInstaller(installerPath, serverDir, onOutput = () => {}) {
    const javaPath = await this.detectJava();
    if (!javaPath) throw new Error("Java not found. Download Java from https://adoptium.net");

    return new Promise((resolve) => {
      const child = spawn(javaPath, ["-jar", installerPath, "--installServer"], {
        cwd: serverDir,
        stdio: ["ignore", "pipe", "pipe"]
      });

      let remainderStdout = "";
      let remainderStderr = "";

      const handle = (chunk, stream) => {
        const text = `${stream === "stdout" ? remainderStdout : remainderStderr}${chunk.toString("utf8")}`;
        const lines = text.split(/\r?\n/);
        const remainder = lines.at(-1) || "";
        if (stream === "stdout") remainderStdout = remainder;
        else remainderStderr = remainder;
        for (const line of lines.slice(0, -1)) {
          if (line.trim()) onOutput(line);
        }
      };

      child.stdout.on("data", (chunk) => handle(chunk, "stdout"));
      child.stderr.on("data", (chunk) => handle(chunk, "stderr"));
      child.on("close", (exitCode) => resolve({ success: exitCode === 0, exitCode }));
      child.on("error", () => resolve({ success: false, exitCode: -1 }));
    });
  }

  async writeServerProperties(serverDir, config) {
    const content = [
      `server-port=${Number(config.port || 25565)}`,
      `online-mode=${config.cracked ? "false" : "true"}`,
      "motd=Managed by VoxelPort",
      "enable-query=true",
      "enable-rcon=false"
    ].join("\n");
    await fsp.writeFile(path.join(serverDir, "server.properties"), `${content}\n`, "utf8");
  }
}

export default InstallManager;
