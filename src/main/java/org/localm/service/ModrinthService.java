package org.localm.service;

import org.localm.model.ModrinthProject;

import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;

/**
 * Modrinth API v2 service.
 *
 * Loader detection order (auto):
 *   Paper / Purpur / Spigot / Bukkit  → "paper"  (plugin folder)
 *   Fabric                            → "fabric"
 *   Forge                             → "forge"
 *   NeoForge                          → "neoforge"
 */
public class ModrinthService {

    private static final String UA = "VoxelPort/1.0.0 (github.com/trazhub/VoxelPort)";
    private final HttpClient http = HttpClient.newBuilder()
            .followRedirects(HttpClient.Redirect.NORMAL)
            .build();

    // ─────────────────────────────────────────────────────────────────────────
    //  Loader detection
    // ─────────────────────────────────────────────────────────────────────────

    public enum LoaderType {
        PAPER("paper", "plugin", "plugins"),
        FABRIC("fabric", "mod", "mods"),
        FORGE("forge", "mod", "mods"),
        NEOFORGE("neoforge", "mod", "mods"),
        SPIGOT("spigot", "plugin", "plugins"),
        UNKNOWN("paper", "plugin", "plugins");

        /** Modrinth API loader identifier */
        public final String modrinthId;
        /** Modrinth project_type filter ("plugin" or "mod") */
        public final String projectType;
        /** Sub-folder inside the server dir that holds installed jars */
        public final String folder;

        LoaderType(String modrinthId, String projectType, String folder) {
            this.modrinthId  = modrinthId;
            this.projectType = projectType;
            this.folder      = folder;
        }

        /** Human-readable display name */
        public String displayName() {
            return switch (this) {
                case PAPER   -> "Paper / Purpur";
                case FABRIC  -> "Fabric";
                case FORGE   -> "Forge";
                case NEOFORGE -> "NeoForge";
                case SPIGOT  -> "Spigot";
                default       -> "Unknown";
            };
        }
    }

    /**
     * Inspect a server directory and return its loader type.
     * Detection is done by checking well-known marker files/folders.
     */
    public static LoaderType detectLoader(Path serverDir) {
        // NeoForge marker
        if (Files.exists(serverDir.resolve("neoforge-server-launcher.jar"))
                || Files.exists(serverDir.resolve(".neoforge"))) {
            return LoaderType.NEOFORGE;
        }
        // Fabric marker
        if (Files.exists(serverDir.resolve("fabric-server-launch.jar"))
                || Files.exists(serverDir.resolve(".fabric"))) {
            return LoaderType.FABRIC;
        }
        // Forge marker
        if (Files.exists(serverDir.resolve("user_jvm_args.txt"))
                || Files.exists(serverDir.resolve("forge-server-launcher.jar"))
                || Files.exists(serverDir.resolve("libraries/net/minecraftforge"))) {
            return LoaderType.FORGE;
        }
        // Spigot (no Paper branding)
        if (Files.exists(serverDir.resolve("spigot.jar"))
                || Files.exists(serverDir.resolve("spigot-server-launcher.jar"))) {
            return LoaderType.SPIGOT;
        }
        // Paper / Purpur (default plugin server)
        if (Files.exists(serverDir.resolve("plugins"))
                || Files.exists(serverDir.resolve("server.jar"))) {
            return LoaderType.PAPER;
        }
        return LoaderType.UNKNOWN;
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  Installed jar listing
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * List all .jar files in the appropriate sub-folder (plugins/ or mods/).
     * Returns an empty list if the folder doesn't exist yet.
     */
    public List<Path> listInstalled(Path serverDir, LoaderType loader) {
        Path folder = serverDir.resolve(loader.folder);
        if (!Files.exists(folder)) return Collections.emptyList();
        try (var stream = Files.list(folder)) {
            return stream
                    .filter(p -> p.toString().toLowerCase(Locale.ROOT).endsWith(".jar"))
                    .sorted(Comparator.comparing(p -> p.getFileName().toString().toLowerCase(Locale.ROOT)))
                    .toList();
        } catch (IOException e) {
            return Collections.emptyList();
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  Search
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Search Modrinth for plugins or mods, optionally filtered by MC version.
     *
     * @param query     search text
     * @param loader    detected loader (drives project_type facet)
     * @param mcVersion MC version string like "1.21.1", or null for unfiltered
     */
    public List<ModrinthProject> search(String query, LoaderType loader, String mcVersion)
            throws IOException, InterruptedException {

        StringBuilder facets = new StringBuilder("[[\"project_type:" + loader.projectType + "\"]");
        if (mcVersion != null && !mcVersion.isBlank()) {
            facets.append(",[\"versions:").append(mcVersion).append("\"]");
        }
        facets.append("]");

        String url = "https://api.modrinth.com/v2/search"
                + "?query=" + URLEncoder.encode(query, StandardCharsets.UTF_8)
                + "&limit=20"
                + "&facets=" + URLEncoder.encode(facets.toString(), StandardCharsets.UTF_8);

        String json = get(url);

        List<ModrinthProject> projects = new ArrayList<>();
        // Each hit object starts with "project_id"
        Matcher m = Pattern.compile(
                "\"project_id\"\\s*:\\s*\"([^\"]+)\"[^}]*?" +
                "\"slug\"\\s*:\\s*\"([^\"]+)\"[^}]*?" +
                "\"author\"\\s*:\\s*\"([^\"]+)\"[^}]*?" +
                "\"title\"\\s*:\\s*\"([^\"]+)\"[^}]*?" +
                "\"description\"\\s*:\\s*\"([^\"]+)\"[^}]*?" +
                "\"downloads\"\\s*:\\s*(\\d+)"
        ).matcher(json);

        while (m.find()) {
            // Extract optional icon_url that may appear before or after; simple search around match
            long dl = 0;
            try { dl = Long.parseLong(m.group(6)); } catch (Exception ignored) {}

            // Try to find icon_url near this hit
            String iconUrl = null;
            int hitStart = m.start();
            int hitEnd   = Math.min(json.length(), m.end() + 200);
            Matcher icon = Pattern.compile("\"icon_url\"\\s*:\\s*\"([^\"]+)\"")
                    .matcher(json.substring(Math.max(0, hitStart - 50), hitEnd));
            if (icon.find()) iconUrl = icon.group(1);

            projects.add(new ModrinthProject(
                    m.group(1), m.group(2), m.group(4), m.group(5), m.group(3), dl, iconUrl));
        }
        return projects;
    }

    /** Legacy overload kept for compatibility */
    public List<ModrinthProject> search(String query, String type)
            throws IOException, InterruptedException {
        LoaderType lt = "mod".equals(type) ? LoaderType.FABRIC : LoaderType.PAPER;
        return search(query, lt, null);
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  Download URL resolution
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Fetch the best matching download URL for a project version.
     * Tries the detected loader first, then common fallbacks.
     */
    public String getLatestDownloadUrl(String projectId, String mcVersion, LoaderType loader)
            throws IOException, InterruptedException {

        // Candidate loaders to try in order
        List<String> candidates = new ArrayList<>();
        candidates.add(loader.modrinthId);
        // Paper servers also accept bukkit/spigot plugins
        if (loader == LoaderType.PAPER || loader == LoaderType.SPIGOT) {
            candidates.addAll(List.of("paper", "spigot", "bukkit"));
        }
        // Fabric can sometimes use universal
        if (loader == LoaderType.FABRIC) {
            candidates.add("fabric");
        }

        for (String tryLoader : candidates.stream().distinct().toList()) {
            String url = "https://api.modrinth.com/v2/project/" + projectId + "/version"
                    + "?game_versions=" + URLEncoder.encode("[\"" + mcVersion + "\"]", StandardCharsets.UTF_8)
                    + "&loaders="       + URLEncoder.encode("[\"" + tryLoader + "\"]", StandardCharsets.UTF_8);

            String json = get(url);
            Matcher m = Pattern.compile("\"url\"\\s*:\\s*\"([^\"]+\\.jar)\"").matcher(json);
            if (m.find()) return m.group(1);
        }

        // Last resort: any version, any loader (picks first jar available)
        String url = "https://api.modrinth.com/v2/project/" + projectId + "/version";
        String json = get(url);
        Matcher m = Pattern.compile("\"url\"\\s*:\\s*\"([^\"]+\\.jar)\"").matcher(json);
        if (m.find()) return m.group(1);

        return null;
    }

    /** Legacy string-loader overload */
    public String getLatestDownloadUrl(String projectId, String mcVersion, String loader)
            throws IOException, InterruptedException {
        LoaderType lt = loaderFromString(loader);
        return getLatestDownloadUrl(projectId, mcVersion, lt);
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  Internals
    // ─────────────────────────────────────────────────────────────────────────

    private String get(String url) throws IOException, InterruptedException {
        HttpRequest req = HttpRequest.newBuilder(URI.create(url))
                .header("User-Agent", UA)
                .build();
        return http.send(req, HttpResponse.BodyHandlers.ofString()).body();
    }

    private static LoaderType loaderFromString(String s) {
        return switch (s == null ? "" : s.toLowerCase(Locale.ROOT)) {
            case "fabric"   -> LoaderType.FABRIC;
            case "forge"    -> LoaderType.FORGE;
            case "neoforge" -> LoaderType.NEOFORGE;
            case "spigot"   -> LoaderType.SPIGOT;
            default         -> LoaderType.PAPER;
        };
    }
}
