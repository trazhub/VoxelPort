package org.localm.service;

import com.sun.net.httpserver.HttpServer;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpExchange;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

public class HeadlessWebServer {
    private HttpServer server;
    private final Map<String, StringBuilder> serverLogs = new ConcurrentHashMap<>();
    private final ServerProcessManager processManager;

    public HeadlessWebServer(ServerProcessManager processManager) {
        this.processManager = processManager;
    }

    public void start(int port) throws IOException {
        server = HttpServer.create(new InetSocketAddress(port), 0);
        server.createContext("/", new RootHandler());
        server.setExecutor(null);
        server.start();
    }

    public void addLog(String name, String line) {
        serverLogs.computeIfAbsent(name, k -> new StringBuilder()).append(line).append("\n");
        // Keep logs bounded
        StringBuilder sb = serverLogs.get(name);
        if (sb.length() > 50000) {
            sb.delete(0, 10000);
        }
    }

    private class RootHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange t) throws IOException {
            String path = t.getRequestURI().getPath();
            String response;

            if (path.startsWith("/log/")) {
                String name = path.substring(5);
                response = serverLogs.getOrDefault(name, new StringBuilder("No logs yet")).toString();
            } else {
                StringBuilder html = new StringBuilder("<html><head><title>VoxelPort Headless</title>");
                html.append("<style>body{background:#12171f;color:#e5ecf6;font-family:sans-serif;} pre{background:#0c1117;padding:10px;overflow:auto;height:400px;}</style>");
                html.append("</head><body><h1>VoxelPort Headless Mode</h1>");
                
                for (String name : serverLogs.keySet()) {
                    html.append("<h2>Server: ").append(name).append("</h2>");
                    html.append("<pre id='").append(name).append("'>Loading logs...</pre>");
                    html.append("<script>setInterval(() => { fetch('/log/").append(name).append("').then(r => r.text()).then(t => { const e = document.getElementById('").append(name).append("'); e.innerText = t; e.scrollTop = e.scrollHeight; }); }, 2000);</script>");
                }
                
                html.append("</body></html>");
                response = html.toString();
            }

            byte[] bytes = response.getBytes(StandardCharsets.UTF_8);
            t.getResponseHeaders().set("Content-Type", "text/html; charset=UTF-8");
            t.sendResponseHeaders(200, bytes.length);
            try (OutputStream os = t.getResponseBody()) {
                os.write(bytes);
            }
        }
    }
}
