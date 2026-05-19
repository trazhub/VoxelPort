import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import axios from "axios";
import { EventEmitter } from "node:events";

const USER_AGENT = "VoxelPort/1.0.0 (https://github.com/voxelport/voxelport)";
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

function ensureAllowed(rawUrl) {
  const host = new URL(rawUrl).hostname;
  if (!ALLOWED_DOMAINS.has(host)) {
    throw new Error(`Download host not allowed: ${host}`);
  }
}

function isJar(filename) {
  return String(filename || "").toLowerCase().endsWith(".jar");
}

function isPluginServer(serverType) {
  const type = String(serverType || "").toLowerCase();
  return ["paper", "purpur", "spigot", "waterfall", "velocity"].includes(type);
}

function normalizeModrinthHit(hit) {
  return {
    id: hit.project_id || hit.slug,
    slug: hit.slug,
    title: hit.title,
    description: hit.description,
    downloads: hit.downloads || 0,
    follows: hit.follows || 0,
    iconUrl: hit.icon_url || null,
    categories: hit.categories || [],
    versions: hit.versions || [],
    projectType: hit.project_type || "mod",
    author: hit.author || "",
    sourceUrl: `https://modrinth.com/${hit.project_type || "mod"}/${hit.slug}`,
    latestVersion: hit.latest_version || null,
    source: "modrinth"
  };
}

function normalizeHangarProject(project) {
  return {
    id: project.namespace?.owner ? `${project.namespace.owner}/${project.name}` : project.name,
    slug: project.name,
    title: project.name,
    description: project.description || "",
    downloads: project.stats?.downloads || 0,
    follows: project.stats?.watchers || 0,
    iconUrl: project.avatarUrl || null,
    categories: [],
    versions: [],
    projectType: "plugin",
    author: project.namespace?.owner || "",
    sourceUrl: `https://hangar.papermc.io/${project.namespace?.owner}/${project.name}`,
    latestVersion: project.lastVersion || null,
    source: "hangar"
  };
}

export class ModManager extends EventEmitter {
  constructor(getServerById) {
    super();
    this.getServerById = getServerById;
  }

  getManifestPath(serverDir) {
    return path.join(serverDir, "modmanifest.json");
  }

  readManifest(serverDir) {
    const filePath = this.getManifestPath(serverDir);
    if (!fs.existsSync(filePath)) {
      return { mcVersion: "", loader: "", mods: [] };
    }
    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
      return {
        mcVersion: parsed.mcVersion || "",
        loader: parsed.loader || "",
        mods: Array.isArray(parsed.mods) ? parsed.mods : []
      };
    } catch {
      return { mcVersion: "", loader: "", mods: [] };
    }
  }

  writeManifest(serverDir, manifest) {
    const filePath = this.getManifestPath(serverDir);
    fs.writeFileSync(filePath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  }

  async searchModrinth(query, options = {}) {
    const q = String(query || "").trim();
    const type = String(options.serverType || "").toLowerCase();
    const facets = [];
    if (isPluginServer(type)) facets.push(["project_type:plugin"]);
    else facets.push(["project_type:mod"]);

    if (type === "fabric") facets.push(["categories:fabric"]);
    else if (type === "forge") facets.push(["categories:forge"]);
    else if (type === "neoforge") facets.push(["categories:neoforge"]);

    if (options.mcVersion) facets.push([`versions:${options.mcVersion}`]);
    if (options.category) facets.push([`categories:${options.category}`]);

    const res = await axios.get("https://api.modrinth.com/v2/search", {
      params: {
        query: q,
        facets: JSON.stringify(facets),
        limit: Number(options.limit || 20),
        offset: Number(options.offset || 0),
        index: options.index || "relevance"
      },
      headers: { "User-Agent": USER_AGENT }
    });

    return (res.data?.hits || []).map(normalizeModrinthHit);
  }

  async searchHangar(query, options = {}) {
    const platform = String(options.platform || "PAPER").toUpperCase();
    const res = await axios.get("https://hangar.papermc.io/api/v1/projects", {
      params: {
        q: String(query || ""),
        limit: Number(options.limit || 20),
        offset: Number(options.offset || 0),
        platform
      },
      headers: { "User-Agent": USER_AGENT }
    });

    return (res.data?.result || res.data?.projects || []).map(normalizeHangarProject);
  }

  async getModDetails(projectId, source) {
    if (source === "modrinth") {
      const res = await axios.get(
        `https://api.modrinth.com/v2/project/${encodeURIComponent(projectId)}`,
        { headers: { "User-Agent": USER_AGENT } }
      );
      return res.data;
    }
    if (source === "hangar") {
      const [owner, slug] = String(projectId).split("/");
      const res = await axios.get(
        `https://hangar.papermc.io/api/v1/projects/${encodeURIComponent(owner)}/${encodeURIComponent(slug)}`,
        { headers: { "User-Agent": USER_AGENT } }
      );
      return res.data;
    }
    throw new Error("Unknown source");
  }

  async getProjectVersions(projectId, source, mcVersion, loader) {
    if (source === "modrinth") {
      const params = {};
      if (loader) params.loaders = JSON.stringify([loader]);
      if (mcVersion) params.game_versions = JSON.stringify([mcVersion]);

      const res = await axios.get(
        `https://api.modrinth.com/v2/project/${encodeURIComponent(projectId)}/version`,
        { params, headers: { "User-Agent": USER_AGENT } }
      );

      return (res.data || [])
        .map((version) => {
          const primary = (version.files || []).find((f) => f.primary) || version.files?.[0];
          return {
            id: version.id,
            version: version.version_number,
            gameVersions: version.game_versions || [],
            loaders: version.loaders || [],
            file: primary
          };
        })
        .filter((v) => v.file)
        .sort((a, b) => new Date(b.date_published || 0) - new Date(a.date_published || 0));
    }

    if (source === "hangar") {
      const [owner, slug] = String(projectId).split("/");
      const platform = String(loader || "paper").toUpperCase();
      const res = await axios.get(
        `https://hangar.papermc.io/api/v1/projects/${encodeURIComponent(owner)}/${encodeURIComponent(slug)}/versions`,
        { headers: { "User-Agent": USER_AGENT } }
      );
      const versions = res.data?.result || [];
      return versions
        .map((v) => ({
          id: v.name,
          version: v.name,
          gameVersions: v.platformDependencies?.PAPER || [],
          loaders: ["paper"],
          file: {
            url: `https://hangar.papermc.io/api/v1/projects/${encodeURIComponent(owner)}/${encodeURIComponent(slug)}/versions/${encodeURIComponent(v.name)}/${platform}/download`,
            filename: `${slug}-${v.name}.jar`
          }
        }))
        .sort((a, b) => (a.version < b.version ? 1 : -1));
    }

    throw new Error("Unknown source");
  }

  resolveServer(serverId) {
    const server = this.getServerById?.(serverId);
    if (!server) throw new Error("Server not found");
    if (!server.path || !path.isAbsolute(server.path)) throw new Error("Invalid server path");
    return server;
  }

  async installMod(serverId, projectData, onProgress = () => {}) {
    const server = this.resolveServer(serverId);
    const folderName = isPluginServer(server.serverType) ? "plugins" : "mods";
    const targetDir = path.join(server.path, folderName);
    await fsp.mkdir(targetDir, { recursive: true });

    let filename = String(projectData.filename || "");
    let downloadUrl = String(projectData.downloadUrl || "");
    if (!downloadUrl && (projectData.source === "modrinth" || projectData.source === "hangar")) {
      const versions = await this.getProjectVersions(
        projectData.projectId || projectData.id,
        projectData.source,
        server.mcVersion,
        String(server.serverType || "").toLowerCase()
      );
      const selected =
        versions.find((v) => v.id === projectData.versionId) ||
        versions.find((v) => v.version === projectData.version) ||
        versions[0];
      downloadUrl = selected?.file?.url || "";
      filename = selected?.file?.filename || filename;
    }
    if (!isJar(filename)) throw new Error("Only .jar files are allowed");
    if (!downloadUrl) throw new Error("No download URL available for selected mod/plugin.");
    ensureAllowed(downloadUrl);

    const safeName = path.basename(filename);
    if (!safeName || !safeName.toLowerCase().endsWith(".jar")) {
      throw new Error("Invalid filename: must be a .jar file");
    }
    const tempPath = path.join(targetDir, `${safeName}.partial`);
    const finalPath = path.join(targetDir, safeName);
    if (!finalPath.startsWith(targetDir + path.sep)) {
      throw new Error("Invalid filename: path traversal detected");
    }
    let downloaded = 0;
    let total = 0;

    try {
      const response = await axios.get(downloadUrl, {
        responseType: "stream",
        headers: { "User-Agent": USER_AGENT }
      });
      total = Number(response.headers["content-length"] || 0);
      const writer = fs.createWriteStream(tempPath);

      await new Promise((resolve, reject) => {
        response.data.on("data", (chunk) => {
          downloaded += chunk.length;
          onProgress({
            percent: total > 0 ? Math.round((downloaded / total) * 100) : 0,
            message: `Downloading ${filename}...`
          });
        });
        response.data.on("error", reject);
        writer.on("error", reject);
        writer.on("finish", resolve);
        response.data.pipe(writer);
      });

      await fsp.rename(tempPath, finalPath);

      const manifest = this.readManifest(server.path);
      manifest.mcVersion = server.mcVersion || manifest.mcVersion;
      manifest.loader = String(server.serverType || manifest.loader).toLowerCase();
      manifest.mods = manifest.mods.filter((m) => m.id !== projectData.id);
      manifest.mods.push({
        id: projectData.id,
        name: projectData.name || projectData.title || filename,
        filename: safeName,
        version: projectData.version || projectData.versionId || "unknown",
        source: projectData.source,
        projectId: projectData.projectId || projectData.id,
        versionId: projectData.versionId || "",
        downloadUrl,
        installedAt: new Date().toISOString()
      });
      this.writeManifest(server.path, manifest);
      return { success: true, filename: safeName };
    } catch (error) {
      await fsp.rm(tempPath, { force: true });
      return { success: false, error: String(error?.message || error) };
    }
  }

  async removeMod(serverId, modId) {
    const server = this.resolveServer(serverId);
    const manifest = this.readManifest(server.path);
    const mod = manifest.mods.find((m) => m.id === modId);
    if (!mod) return { success: false, error: "Mod not found" };

    const folderName = isPluginServer(server.serverType) ? "plugins" : "mods";
    const safeFilename = path.basename(mod.filename);
    const targetPath = path.join(server.path, folderName, safeFilename);
    if (!targetPath.startsWith(path.join(server.path, folderName))) {
      throw new Error("Invalid mod filename in manifest");
    }
    await fsp.rm(targetPath, { force: true });

    manifest.mods = manifest.mods.filter((m) => m.id !== modId);
    this.writeManifest(server.path, manifest);
    return { success: true };
  }

  async getMods(serverId) {
    const server = this.resolveServer(serverId);
    return this.readManifest(server.path).mods.map((mod) => ({
      ...mod,
      updateAvailable: Boolean(mod.updateAvailable)
    }));
  }

  async checkUpdates(serverId) {
    const server = this.resolveServer(serverId);
    const manifest = this.readManifest(server.path);

    const results = await Promise.allSettled(
      manifest.mods.map((mod) =>
        this.getProjectVersions(
          mod.projectId,
          mod.source,
          server.mcVersion || manifest.mcVersion,
          manifest.loader
        )
      )
    );

    const updates = manifest.mods.map((mod, idx) => {
      const result = results[idx];
      if (result.status === "fulfilled") {
        const latest = result.value[0];
        const hasUpdate = Boolean(latest && latest.id && latest.id !== mod.versionId);
        mod.updateAvailable = hasUpdate;
        mod.latestVersionId = latest?.id || mod.versionId;
        return {
          modId: mod.id,
          currentVersion: mod.version,
          latestVersion: latest?.version || mod.version,
          hasUpdate
        };
      }
      return {
        modId: mod.id,
        currentVersion: mod.version,
        latestVersion: mod.version,
        hasUpdate: false
      };
    });

    this.writeManifest(server.path, manifest);
    return updates;
  }

  async updateMod(serverId, modId, onProgress = () => {}) {
    const server = this.resolveServer(serverId);
    const manifest = this.readManifest(server.path);
    const mod = manifest.mods.find((m) => m.id === modId);
    if (!mod) return { success: false, error: "Mod not found" };

    const versions = await this.getProjectVersions(
      mod.projectId,
      mod.source,
      server.mcVersion || manifest.mcVersion,
      manifest.loader
    );
    const latest = versions[0];
    if (!latest?.file?.url || !latest?.file?.filename) {
      return { success: false, error: "No compatible update found" };
    }

    const installResult = await this.installMod(
      serverId,
      {
        id: mod.id,
        name: mod.name,
        source: mod.source,
        projectId: mod.projectId,
        versionId: latest.id,
        version: latest.version,
        filename: latest.file.filename,
        downloadUrl: latest.file.url
      },
      onProgress
    );
    if (!installResult.success) return installResult;

    if (mod.filename !== installResult.filename) {
      const folderName = isPluginServer(server.serverType) ? "plugins" : "mods";
      await fsp.rm(path.join(server.path, folderName, mod.filename), { force: true });
    }
    return { success: true };
  }
}

export default ModManager;
