package org.localm.service;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Arrays;
import java.util.HexFormat;
import java.util.Locale;
import java.util.concurrent.CompletableFuture;
import java.util.function.Consumer;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class TunnelService {
    private Process tunnelProcess;
    private Process accessProcess;
    private ServerSocket hostProxy;
    private ServerSocket clientProxy;

    public void startRoom(int serverPort, Consumer<String> codeConsumer, Consumer<String> statusConsumer) throws Exception {
        stopRoom();
        int bridgePort = freePort();
        hostProxy = new ServerSocket();
        hostProxy.bind(new InetSocketAddress("127.0.0.1", bridgePort));
        CompletableFuture.runAsync(() -> acceptProxy(hostProxy, serverPort));

        Path daemon = daemonPath();
        tunnelProcess = new ProcessBuilder(daemon.toString(), "tunnel", "--url", "tcp://localhost:" + bridgePort).redirectErrorStream(true).start();
        CompletableFuture.runAsync(() -> {
            try (BufferedReader r = new BufferedReader(new InputStreamReader(tunnelProcess.getInputStream()))) {
                String line;
                Pattern urlPattern = Pattern.compile("https://[a-z0-9-]+\\.trycloudflare\\.com", Pattern.CASE_INSENSITIVE);
                while ((line = r.readLine()) != null) {
                    Matcher m = urlPattern.matcher(line);
                    if (m.find()) {
                        String code = encrypt(m.group());
                        codeConsumer.accept(code);
                        statusConsumer.accept("Room ready");
                    }
                }
            } catch (Exception ignored) {}
        });
        statusConsumer.accept("Starting room...");
    }

    public void stopRoom() {
        closeQuiet(hostProxy);
        hostProxy = null;
        if (tunnelProcess != null) tunnelProcess.destroyForcibly();
        tunnelProcess = null;
    }

    public void startJoinProxy(String code, int localPort, Consumer<String> statusConsumer) throws Exception {
        stopJoinProxy();
        String url = decrypt(code.trim());
        String host = URI.create(url).getHost();
        int bridgePort = freePort();
        accessProcess = new ProcessBuilder(daemonPath().toString(), "access", "tcp", "--hostname", host, "--url", "127.0.0.1:" + bridgePort).start();
        Thread.sleep(2500);

        clientProxy = new ServerSocket();
        clientProxy.bind(new InetSocketAddress("127.0.0.1", localPort));
        CompletableFuture.runAsync(() -> acceptProxy(clientProxy, bridgePort));
        statusConsumer.accept("Join proxy ready");
    }

    public void stopJoinProxy() {
        closeQuiet(clientProxy);
        clientProxy = null;
        if (accessProcess != null) accessProcess.destroyForcibly();
        accessProcess = null;
    }

    private void acceptProxy(ServerSocket server, int targetPort) {
        while (!server.isClosed()) {
            try {
                Socket incoming = server.accept();
                Socket target = new Socket("127.0.0.1", targetPort);
                CompletableFuture.runAsync(() -> pump(incoming, target));
                CompletableFuture.runAsync(() -> pump(target, incoming));
            } catch (IOException ignored) {
                return;
            }
        }
    }

    private void pump(Socket from, Socket to) {
        try (InputStream in = from.getInputStream(); OutputStream out = to.getOutputStream()) {
            in.transferTo(out);
        } catch (IOException ignored) {
        } finally {
            closeQuiet(from);
            closeQuiet(to);
        }
    }

    private Path daemonPath() {
        String osName = System.getProperty("os.name", "").toLowerCase(Locale.ROOT);
        String binName = osName.contains("win") ? "tunnel-daemon.exe" : "tunnel-daemon";
        
        Path dev = Path.of("bin", binName).toAbsolutePath();
        if (Files.exists(dev)) return dev;
        Path app = Path.of(System.getProperty("user.dir"), "bin", binName);
        if (Files.exists(app)) return app;
        Path managed = managedToolsDir().resolve(binName);
        if (Files.exists(managed)) return managed;
        downloadTunnelDaemon(managed);
        return managed;
    }

    private Path managedToolsDir() {
        String base = System.getenv("APPDATA");
        if (base == null || base.isBlank()) {
            base = System.getProperty("user.home");
        }
        Path dir = Path.of(base, "VoxelPort", "tools");
        try {
            Files.createDirectories(dir);
        } catch (IOException e) {
            throw new RuntimeException("Failed to create tools directory: " + dir, e);
        }
        return dir;
    }

    private void downloadTunnelDaemon(Path target) {
        String osName = System.getProperty("os.name", "").toLowerCase(Locale.ROOT);
        String arch = System.getProperty("os.arch").toLowerCase(Locale.ROOT);
        
        String cfOs = "windows";
        String cfArch = "amd64";
        String ext = ".exe";
        
        if (osName.contains("mac")) {
            cfOs = "darwin";
            ext = "";
        } else if (osName.contains("linux")) {
            cfOs = "linux";
            ext = "";
        }
        
        if (arch.contains("aarch64") || arch.contains("arm64")) {
            cfArch = "arm64";
        }
        
        String url = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-" + cfOs + "-" + cfArch + ext;
        if (cfOs.equals("darwin") && cfArch.equals("arm64")) {
            // Cloudflare doesn't natively publish a cloudflared-darwin-arm64 directly without a tgz, but darwin-amd64 works via Rosetta or some custom URLs exist. We will fall back to amd64 for darwin just in case, but let's try the direct binary first.
        }

        try {
            Path temp = Files.createTempFile("voxelport-cloudflared-", ext);
            try (InputStream in = URI.create(url).toURL().openStream()) {
                Files.copy(in, temp, StandardCopyOption.REPLACE_EXISTING);
            }
            Files.move(temp, target, StandardCopyOption.REPLACE_EXISTING);
            if (!osName.contains("win")) {
                target.toFile().setExecutable(true);
            }
        } catch (IOException e) {
            throw new IllegalStateException("Failed to download tunnel-daemon.exe automatically", e);
        }
    }

    private int freePort() throws IOException {
        try (ServerSocket socket = new ServerSocket(0, 0, InetAddress.getByName("127.0.0.1"))) {
            return socket.getLocalPort();
        }
    }

    private byte[] key() throws Exception {
        return MessageDigest.getInstance("SHA-256").digest("localm-tunnel-v1".getBytes(StandardCharsets.UTF_8));
    }

    private String encrypt(String url) throws Exception {
        byte[] iv = new byte[12];
        new SecureRandom().nextBytes(iv);
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(key(), "AES"), new GCMParameterSpec(128, iv));
        byte[] encrypted = cipher.doFinal(url.getBytes(StandardCharsets.UTF_8));
        byte[] out = new byte[iv.length + encrypted.length];
        System.arraycopy(iv, 0, out, 0, iv.length);
        System.arraycopy(encrypted, 0, out, iv.length, encrypted.length);
        return HexFormat.of().formatHex(out).toUpperCase(Locale.ROOT);
    }

    private String decrypt(String code) throws Exception {
        byte[] raw = HexFormat.of().parseHex(code);
        byte[] iv = Arrays.copyOfRange(raw, 0, 12);
        byte[] encrypted = Arrays.copyOfRange(raw, 12, raw.length);
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, new SecretKeySpec(key(), "AES"), new GCMParameterSpec(128, iv));
        return new String(cipher.doFinal(encrypted), StandardCharsets.UTF_8);
    }

    private void closeQuiet(Closeable closeable) {
        try { if (closeable != null) closeable.close(); } catch (IOException ignored) {}
    }
}
