import { EventEmitter } from "node:events";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import pidusage from "pidusage";

const NAME_REGEX = /^[a-zA-Z0-9_-]+$/;

function stripLineFeed(value) {
  return String(value || "").replace(/[\r\n]/g, "");
}

function splitLines(buffer, chunk) {
  const text = `${buffer}${chunk.toString("utf8")}`;
  const lines = text.split(/\r?\n/);
  return { lines: lines.slice(0, -1), remainder: lines.at(-1) || "" };
}

function hasParentTraversal(inputPath) {
  const normalized = path.normalize(inputPath);
  return normalized.split(path.sep).includes("..");
}

function findJavaFromCommonLocations() {
  const candidates = [];
  if (process.env.JAVA_HOME) {
    candidates.push(path.join(process.env.JAVA_HOME, "bin", os.platform() === "win32" ? "java.exe" : "java"));
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
        candidates.push(path.join(root, dir, "bin", "java.exe"));
      }
    }
  } else if (os.platform() === "darwin") {
    const root = "/Library/Java/JavaVirtualMachines";
    if (fs.existsSync(root)) {
      for (const dir of fs.readdirSync(root)) {
        candidates.push(path.join(root, dir, "Contents", "Home", "bin", "java"));
      }
    }
  } else {
    candidates.push("/usr/bin/java");
    const root = "/usr/lib/jvm";
    if (fs.existsSync(root)) {
      for (const dir of fs.readdirSync(root)) {
        candidates.push(path.join(root, dir, "bin", "java"));
      }
    }
  }

  for (const javaPath of candidates) {
    try {
      if (!fs.existsSync(javaPath)) continue;
      const probe = spawnSync(javaPath, ["-version"], { stdio: "ignore" });
      if (probe.status === 0 || probe.status === 1) return javaPath;
    } catch {
      continue;
    }
  }
  return null;
}

export class ServerManager extends EventEmitter {
  constructor() {
    super();
    this.processes = new Map();
    this.serverMeta = new Map();
  }

  async detectJava() {
    const pathProbe = spawnSync("java", ["-version"], { stdio: "ignore" });
    if (pathProbe.status === 0 || pathProbe.status === 1) return "java";
    return findJavaFromCommonLocations();
  }

  validateConfig(config) {
    if (!config?.id || !NAME_REGEX.test(String(config.id))) {
      throw new Error("Invalid server id");
    }
    if (!config?.path || !path.isAbsolute(config.path) || hasParentTraversal(config.path)) {
      throw new Error("Invalid server path");
    }
    if (!fs.existsSync(config.path)) throw new Error("Server path does not exist");
    if (!fs.existsSync(path.join(config.path, "server.jar"))) {
      throw new Error("server.jar not found in server path");
    }
  }

  async startServer(config) {
    this.validateConfig(config);
    const id = String(config.id);
    const running = this.processes.get(id);
    if (running && !running.killed) {
      return { success: false, error: "Server already running", serverId: id };
    }

    let javaPath = config.javaPath;
    if (!javaPath) javaPath = await this.detectJava();
    if (!javaPath) throw new Error("Java not found");

    const ram = Number(config.ram || 2048);
    const args = [`-Xmx${ram}M`, `-Xms${ram}M`, "-jar", "server.jar", "--nogui"];

    const child = spawn(javaPath, args, {
      cwd: config.path,
      stdio: ["pipe", "pipe", "pipe"]
    });

    const meta = {
      id,
      config: { ...config, javaPath },
      status: "starting",
      startedAt: Date.now(),
      uptime: 0,
      playerCount: 0,
      stdoutRemainder: "",
      stderrRemainder: "",
      lastOutput: []
    };

    this.processes.set(id, child);
    this.serverMeta.set(id, meta);

    const onLine = (line, stream = "stdout") => {
      if (!line) return;
      meta.lastOutput.push(line);
      if (meta.lastOutput.length > 500) meta.lastOutput.shift();
      this.maybeUpdatePlayerCount(meta, line);
      this.emit("output", { serverId: id, line, stream });
      if (line.includes("Done (") || line.includes("For help, type")) {
        if (meta.status === "starting") {
          meta.status = "running";
          this.emit("started", { serverId: id });
        }
      }
    };

    child.stdout.on("data", (chunk) => {
      const { lines, remainder } = splitLines(meta.stdoutRemainder, chunk);
      meta.stdoutRemainder = remainder;
      for (const line of lines) onLine(line, "stdout");
    });

    child.stderr.on("data", (chunk) => {
      const { lines, remainder } = splitLines(meta.stderrRemainder, chunk);
      meta.stderrRemainder = remainder;
      for (const line of lines) onLine(line, "stderr");
    });

    child.on("error", (error) => {
      meta.status = "stopped";
      this.emit("error", { serverId: id, error: error.message });
    });

    child.on("close", (code) => {
      meta.status = "stopped";
      meta.exitCode = code;
      this.processes.delete(id);
      this.emit("stopped", { serverId: id, exitCode: code });
    });

    return { success: true, serverId: id };
  }

  maybeUpdatePlayerCount(meta, line) {
    const onlineRegexes = [
      /There are (\d+) of a max/i,
      /players online:\s*(\d+)/i,
      /online players \((\d+)\)/i
    ];
    for (const regex of onlineRegexes) {
      const match = line.match(regex);
      if (match) {
        meta.playerCount = Number(match[1]);
        return;
      }
    }

    if (/\bjoined the game\b/i.test(line)) {
      meta.playerCount += 1;
    } else if (/\bleft the game\b/i.test(line)) {
      meta.playerCount = Math.max(0, meta.playerCount - 1);
    }
  }

  async stopServer(id) {
    const serverId = String(id);
    const child = this.processes.get(serverId);
    const meta = this.serverMeta.get(serverId);
    if (!child || !meta) return { success: false, error: "Server is not running" };

    if (meta.status === "stopping") return { success: true };
    meta.status = "stopping";

    try {
      child.stdin.write("stop\n");
    } catch {
      // no-op
    }

    await Promise.race([
      new Promise((resolve) => child.once("close", () => resolve(true))),
      new Promise((resolve) =>
        setTimeout(() => {
          if (!child.killed) child.kill("SIGKILL");
          resolve(true);
        }, 10_000)
      )
    ]);

    meta.status = "stopped";
    return { success: true };
  }

  async sendCommand(id, command) {
    const serverId = String(id);
    const child = this.processes.get(serverId);
    if (!child) return { success: false, error: "Server not running" };
    const cleaned = stripLineFeed(command);
    try {
      child.stdin.write(`${cleaned}\n`);
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error?.message || error) };
    }
  }

  getStatus(id) {
    const meta = this.serverMeta.get(String(id));
    return meta?.status || "stopped";
  }

  async getStats(id) {
    const serverId = String(id);
    const meta = this.serverMeta.get(serverId);
    const child = this.processes.get(serverId);
    if (!meta || !child) {
      return { ramMb: 0, cpuPercent: 0, uptime: 0, playerCount: 0 };
    }

    const uptime = Math.max(0, Math.floor((Date.now() - meta.startedAt) / 1000));

    try {
      const stats = await pidusage(child.pid);
      return {
        ramMb: Number((stats.memory / (1024 * 1024)).toFixed(1)),
        cpuPercent: Number((stats.cpu || 0).toFixed(1)),
        uptime,
        playerCount: meta.playerCount
      };
    } catch {
      return {
        ramMb: 0,
        cpuPercent: 0,
        uptime,
        playerCount: meta.playerCount
      };
    }
  }

  getAllServers() {
    const servers = [];
    for (const [id, meta] of this.serverMeta.entries()) {
      servers.push({
        id,
        ...meta.config,
        status: meta.status,
        playerCount: meta.playerCount
      });
    }
    return servers;
  }
}

export default ServerManager;
