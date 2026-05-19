package org.localm.service;

import org.localm.util.Logger;
import org.localm.util.SimpleJson;

import java.io.*;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.util.Map;
import java.util.concurrent.CompletableFuture;

public class UpdateService {
    public static final String CURRENT_VERSION = "1.1.0";
    private static final String REPO_URL = "https://api.github.com/repos/trazhub/VoxelPort/releases/latest";
    private final HttpClient client = HttpClient.newHttpClient();

    public record UpdateInfo(String version, String downloadUrl, String changelog) {}

    public CompletableFuture<UpdateInfo> checkForUpdates() {
        return CompletableFuture.supplyAsync(() -> {
            try {
                HttpRequest request = HttpRequest.newBuilder()
                        .uri(URI.create(REPO_URL))
                        .header("Accept", "application/vnd.github.v3+json")
                        .GET()
                        .build();

                HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
                if (response.statusCode() != 200) return null;

                Map<String, Object> json = SimpleJson.asObject(SimpleJson.parse(response.body()));
                String tag = SimpleJson.asString(json.get("tag_name")).replace("v", "");
                String changelog = SimpleJson.asString(json.get("body"));

                if (isNewer(tag, CURRENT_VERSION)) {
                    for (Object assetValue : SimpleJson.asArray(json.get("assets"))) {
                        Map<String, Object> asset = SimpleJson.asObject(assetValue);
                        String name = SimpleJson.asString(asset.get("name"));
                        if (name.endsWith(".jar")) {
                            return new UpdateInfo(tag, SimpleJson.asString(asset.get("browser_download_url")), changelog);
                        }
                    }
                }
            } catch (Exception e) {
                Logger.error("Update check failed", e);
            }
            return null;
        });
    }

    private boolean isNewer(String remote, String local) {
        String[] r = remote.split("\\.");
        String[] l = local.split("\\.");
        for (int i = 0; i < Math.min(r.length, l.length); i++) {
            int rv = Integer.parseInt(r[i]);
            int lv = Integer.parseInt(l[i]);
            if (rv > lv) return true;
            if (rv < lv) return false;
        }
        return r.length > l.length;
    }

    public void applyUpdate(UpdateInfo info, Path currentJar, java.util.function.Consumer<String> status) throws Exception {
        status.accept("Downloading update v" + info.version + "...");
        Path tempJar = currentJar.resolveSibling("VoxelPort.update.jar");
        
        HttpRequest request = HttpRequest.newBuilder().uri(URI.create(info.downloadUrl)).GET().build();
        client.send(request, HttpResponse.BodyHandlers.ofFile(tempJar));

        status.accept("Applying update and restarting...");
        
        String javaBin = ProcessHandle.current().info().command().orElse("java");
        Path updaterScript;
        
        if (System.getProperty("os.name").toLowerCase().contains("win")) {
            updaterScript = currentJar.resolveSibling("updater.ps1");
            String ps = String.format("""
                Start-Sleep -Seconds 2
                Move-Item -Path "%s" -Destination "%s" -Force
                Start-Process "%s" -ArgumentList "-jar", "%s"
                Remove-Item -Path "%s"
                """, tempJar.getFileName(), currentJar.getFileName(), javaBin, currentJar.getFileName(), updaterScript.getFileName());
            Files.writeString(updaterScript, ps);
            new ProcessBuilder("powershell.exe", "-ExecutionPolicy", "Bypass", "-File", updaterScript.toString()).start();
        } else {
            updaterScript = currentJar.resolveSibling("updater.sh");
            String sh = String.format("""
                sleep 2
                mv "%s" "%s"
                "%s" -jar "%s" &
                rm "$0"
                """, tempJar.getFileName(), currentJar.getFileName(), javaBin, currentJar.getFileName());
            Files.writeString(updaterScript, sh);
            new ProcessBuilder("sh", updaterScript.toString()).start();
        }
        
        System.exit(0);
    }

    public Path getCurrentJarPath() {
        try {
            return Paths.get(UpdateService.class.getProtectionDomain().getCodeSource().getLocation().toURI());
        } catch (Exception e) {
            return null;
        }
    }
}
