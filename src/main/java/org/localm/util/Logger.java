package org.localm.util;

import java.io.BufferedWriter;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;

public class Logger {
    private static Path logFile;
    private static final DateTimeFormatter FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    public static void init(Path dataDir) {
        logFile = dataDir.resolve("VoxelPort.log");
    }

    public static void info(String message) {
        log("INFO", message);
    }

    public static void warn(String message) {
        log("WARN", message);
    }

    public static void error(String message, Throwable t) {
        log("ERROR", message + (t != null ? ": " + t.getMessage() : ""));
        if (t != null) {
            t.printStackTrace();
        }
    }

    private static synchronized void log(String level, String message) {
        if (logFile == null) {
            System.err.println("[" + level + "] " + message);
            return;
        }
        String timestamp = LocalDateTime.now().format(FORMATTER);
        String entry = String.format("[%s] [%s] %s%n", timestamp, level, message);
        try (BufferedWriter writer = Files.newBufferedWriter(logFile, StandardCharsets.UTF_8,
                StandardOpenOption.CREATE, StandardOpenOption.APPEND)) {
            writer.write(entry);
        } catch (IOException e) {
            System.err.println("Failed to write to log file: " + e.getMessage());
        }
    }
}
