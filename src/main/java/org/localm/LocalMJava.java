package org.localm;

import org.localm.model.ModrinthProject;
import org.localm.model.RamPreset;
import org.localm.model.ServerVersion;
import org.localm.service.BackupService;
import org.localm.service.ConfigService;
import org.localm.service.ModrinthService;
import org.localm.service.ServerProcessManager;
import org.localm.service.ServerStore;
import org.localm.service.TunnelService;
import org.localm.service.VersionService;

import com.formdev.flatlaf.FlatDarkLaf;
import javax.swing.*;
import javax.swing.border.EmptyBorder;
import javax.swing.border.MatteBorder;
import javax.swing.text.*;
import java.awt.*;
import java.awt.datatransfer.StringSelection;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.List;
import java.util.*;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class LocalMJava extends JFrame {
    private final ServerStore store;
    private final VersionService versionService = new VersionService();
    private final ServerProcessManager processManager;
    private final TunnelService tunnelService = new TunnelService();
    private final BackupService backupService = new BackupService();
    private final ConfigService configService = new ConfigService();
    private final ModrinthService modrinthService = new ModrinthService();

    private final DefaultListModel<String> serverModel = new DefaultListModel<>();
    private final JList<String> serverList = new JList<>(serverModel);
    private final JComboBox<ServerVersion> versionBox = new JComboBox<>();
    private final JTextPane console = new JTextPane();
    private final JTextField consoleInput = new JTextField();
    private final JTextField serverName = new JTextField("My Server");
    private final JTextField serverPort = new JTextField("25565");
    private final JSlider ramSlider = new JSlider(JSlider.HORIZONTAL, 1024, getSystemRamMb(), 4096);
    private final JLabel ramLabel = new JLabel("4096 MB");
    private final JCheckBox autoBackup = new JCheckBox("Auto-backup on stop");
    private final JLabel status = new JLabel("Ready");
    private final JTextField roomCode = new JTextField();
    private final JTextField joinCode = new JTextField();
    private final JTextField joinAddress = new JTextField("localhost:25565");

    private final Map<String, DefaultStyledDocument> consoleDocs = new ConcurrentHashMap<>();

    public static void main(String[] args) {
        if (args.length > 0) {
            runCliMain(args);
            return;
        }

        // Apply FlatLaf dark theme before any Swing component is created
        try { FlatDarkLaf.setup(); } catch (Exception ignored) {}
        UIManager.put("Button.arc", 6);
        UIManager.put("Component.arc", 6);
        UIManager.put("TabbedPane.tabHeight", 32);

        LocalMJava app;
        try {
            app = new LocalMJava();
        } catch (IOException e) {
            System.err.println("Failed to initialize store: " + e.getMessage());
            return;
        }

        SwingUtilities.invokeLater(() -> app.setVisible(true));
    }

    private static void runCliMain(String[] args) {
        try {
            ServerStore cliStore = new ServerStore();
            ServerProcessManager cliProcessManager = new ServerProcessManager(cliStore.getDataDir());
            new CliRunner(cliStore, cliProcessManager).run(args);
        } catch (IOException e) {
            System.err.println("Failed to initialize store: " + e.getMessage());
        }
    }

    private void runCli(String[] args) {
        String cmd = args[0].toLowerCase(Locale.ROOT);
        try {
            switch (cmd) {
                case "--list" -> {
                    System.out.println("Installed Servers:");
                    store.stringPropertyNames().stream()
                            .filter(k -> k.endsWith(".dir"))
                            .map(k -> k.substring(0, k.length() - 4))
                            .sorted()
                            .forEach(name -> {
                                String port = store.getProperty(name + ".port", "25565");
                                String version = store.getProperty(name + ".version", "unknown");
                                System.out.printf("- %s (%s, Port: %s)\n", name, version, port);
                            });
                }
                case "--start" -> {
                    if (args.length < 2) throw new IllegalArgumentException("Usage: --start <server-name>");
                    String name = args[1];
                    if (!store.containsKey(name + ".dir")) throw new IllegalArgumentException("Server not found: " + name);
                    System.out.println("Starting " + name + "...");
                    startServerCli(name);
                }
                case "--stop" -> {
                    System.out.println("Note: CLI stop is not yet persistent across processes. Use Ctrl+C or 'stop' in console if available.");
                }
                default -> System.out.println("Unknown command. Available: --list, --start <name>");
            }
        } catch (Exception e) {
            System.err.println("Error: " + e.getMessage());
        }
    }

    private static final class CliRunner {
        private final ServerStore store;
        private final ServerProcessManager processManager;

        private CliRunner(ServerStore store, ServerProcessManager processManager) {
            this.store = store;
            this.processManager = processManager;
        }

        private void run(String[] args) {
            String cmd = args[0].toLowerCase(Locale.ROOT);
            try {
                switch (cmd) {
                    case "--list" -> {
                        System.out.println("Installed Servers:");
                        store.stringPropertyNames().stream()
                                .filter(k -> k.endsWith(".dir"))
                                .map(k -> k.substring(0, k.length() - 4))
                                .sorted()
                                .forEach(name -> {
                                    String port = store.getProperty(name + ".port", "25565");
                                    String version = store.getProperty(name + ".version", "unknown");
                                    System.out.printf("- %s (%s, Port: %s)\n", name, version, port);
                                });
                    }
                    case "--start" -> {
                        if (args.length < 2) throw new IllegalArgumentException("Usage: --start <server-name>");
                        String name = args[1];
                        if (!store.containsKey(name + ".dir")) throw new IllegalArgumentException("Server not found: " + name);
                        System.out.println("Starting " + name + "...");
                        startServerCli(name);
                    }
                    case "--stop" -> {
                        if (args.length < 2) throw new IllegalArgumentException("Usage: --stop <server-name>");
                        String name = args[1];
                        try (Socket s = new Socket("127.0.0.1", 42851);
                             PrintWriter out = new PrintWriter(new OutputStreamWriter(s.getOutputStream(), StandardCharsets.UTF_8), true);
                             BufferedReader in = new BufferedReader(new InputStreamReader(s.getInputStream(), StandardCharsets.UTF_8))) {
                            out.println("STOP " + name);
                            String response = in.readLine();
                            if ("OK".equals(response)) {
                                System.out.println("Stop command sent to " + name + " via GUI.");
                            } else {
                                System.out.println("Server " + name + " is not running or GUI rejected stop.");
                            }
                        } catch (IOException ex) {
                            System.out.println("Could not connect to GUI. Is the VoxelPort GUI running?");
                        }
                    }
                    default -> System.out.println("Unknown command. Available: --list, --start <name>");
                }
            } catch (Exception e) {
                System.err.println("Error: " + e.getMessage());
            }
        }

        private void startServerCli(String name) throws IOException {
            Path dir = store.getServerDir(name);
            int port = Integer.parseInt(store.getProperty(name + ".port", "25565"));
            Path propsFile = dir.resolve("server.properties");
            if (Files.exists(propsFile)) {
                String content = Files.readString(propsFile);
                content = content.replaceAll("server-port=\\d+", "server-port=" + port);
                Files.writeString(propsFile, content);
            }

            String javaBin = processManager.detectJava(store.getProperty(name + ".version", "1.21"));
            int ram = Integer.parseInt(store.getProperty(name + ".ram", "4096"));
            ProcessBuilder pb = new ProcessBuilder(javaBin, "-Xmx" + ram + "M", "-Xms" + Math.max(512, ram / 2) + "M", "-jar", "server.jar", "--nogui");
            pb.directory(dir.toFile());
            pb.inheritIO();
            Process p = pb.start();
            Runtime.getRuntime().addShutdownHook(new Thread(() -> {
                try {
                    System.out.println("\nShutting down server...");
                    p.getOutputStream().write("stop\n".getBytes(StandardCharsets.UTF_8));
                    p.getOutputStream().flush();
                    p.waitFor();
                } catch (Exception ignored) {}
            }));
            try {
                p.waitFor();
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }
    }

    private void startServerCli(String name) throws IOException {
        Path dir = store.getServerDir(name);
        int port = Integer.parseInt(store.getProperty(name + ".port", "25565"));
        Path propsFile = dir.resolve("server.properties");
        if (Files.exists(propsFile)) {
            String content = Files.readString(propsFile);
            content = content.replaceAll("server-port=\\d+", "server-port=" + port);
            Files.writeString(propsFile, content);
        }

        String javaBin = processManager.detectJava(store.getProperty(name + ".version", "1.21"));
        int ram = Integer.parseInt(store.getProperty(name + ".ram", "4096"));
        ProcessBuilder pb = new ProcessBuilder(javaBin, "-Xmx" + ram + "M", "-Xms" + Math.max(512, ram / 2) + "M", "-jar", "server.jar", "--nogui");
        pb.directory(dir.toFile());
        pb.inheritIO();
        Process p = pb.start();
        Runtime.getRuntime().addShutdownHook(new Thread(() -> {
            try {
                System.out.println("\nShutting down server...");
                p.getOutputStream().write("stop\n".getBytes(StandardCharsets.UTF_8));
                p.getOutputStream().flush();
                p.waitFor();
            } catch (Exception ignored) {}
        }));
        try {
            p.waitFor();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    public LocalMJava() throws IOException {
        super("VoxelPort  v1.0.0");
        this.store = new ServerStore();
        this.processManager = new ServerProcessManager(store.getDataDir());

        setDefaultCloseOperation(WindowConstants.EXIT_ON_CLOSE);
        setSize(1280, 760);
        setMinimumSize(new Dimension(900, 600));
        setLocationRelativeTo(null);

        roomCode.setEditable(false);
        joinAddress.setEditable(false);

        // RAM slider – tick labels
        int sysRam = getSystemRamMb();
        ramSlider.setMajorTickSpacing(Math.max(1024, sysRam / 8));
        ramSlider.setPaintTicks(true);
        ramSlider.setPaintLabels(true);
        ramSlider.setSnapToTicks(false);
        java.util.Hashtable<Integer, JLabel> lblMap = new java.util.Hashtable<>();
        for (int mb = 1024; mb <= sysRam; mb += Math.max(1024, sysRam / 8)) {
            lblMap.put(mb, new JLabel(mb >= 1024 ? (mb / 1024) + "G" : mb + "M"));
        }
        ramSlider.setLabelTable(lblMap);
        ramSlider.addChangeListener(e -> ramLabel.setText(ramSlider.getValue() + " MB"));
        roomCode.setEditable(false);

        setContentPane(buildUi());
        refreshServerList();
        loadVersions();

        addWindowListener(new java.awt.event.WindowAdapter() {
            @Override public void windowClosing(java.awt.event.WindowEvent e) {
                processManager.stopAll();
                stopRoom();
                stopJoinProxy();
            }
        });
        
        startCliListener();
    }

    private void startCliListener() {
        Thread t = new Thread(() -> {
            try (ServerSocket server = new ServerSocket(42851, 50, InetAddress.getByName("127.0.0.1"))) {
                while (!Thread.currentThread().isInterrupted()) {
                    try (Socket s = server.accept();
                         BufferedReader in = new BufferedReader(new InputStreamReader(s.getInputStream(), StandardCharsets.UTF_8));
                         PrintWriter out = new PrintWriter(new OutputStreamWriter(s.getOutputStream(), StandardCharsets.UTF_8), true)) {
                        
                        String line = in.readLine();
                        if (line != null && line.startsWith("STOP ")) {
                            String name = line.substring(5).trim();
                            if (processManager.isAlive(name)) {
                                stopServerByName(name);
                                out.println("OK");
                            } else {
                                out.println("NOT_RUNNING");
                            }
                        }
                    } catch (Exception e) {
                        e.printStackTrace();
                    }
                }
            } catch (IOException e) {
                // Ignore port binding issues
            }
        });
        t.setDaemon(true);
        t.start();
    }

    private JComponent buildUi() {
        JPanel root = new JPanel(new BorderLayout(0, 0));

        // ── Header ────────────────────────────────────────────────────────────
        JPanel header = new JPanel(new BorderLayout(12, 0));
        header.setBorder(new EmptyBorder(10, 16, 10, 16));
        header.setBackground(new Color(30, 32, 40));

        JLabel title = new JLabel("⛏  VoxelPort");
        title.setFont(title.getFont().deriveFont(Font.BOLD, 18f));
        title.setForeground(new Color(100, 200, 255));
        header.add(title, BorderLayout.WEST);

        JLabel badge = new JLabel("v1.0.0");
        badge.setFont(badge.getFont().deriveFont(Font.PLAIN, 11f));
        badge.setForeground(new Color(120, 120, 140));
        header.add(badge, BorderLayout.EAST);
        root.add(header, BorderLayout.NORTH);

        // ── Tabs ──────────────────────────────────────────────────────────────
        JTabbedPane tabs = new JTabbedPane();
        tabs.addTab("🖥  Host",       hostPanel());
        tabs.addTab("🔗  Join Room",  joinPanel());
        tabs.addTab("⚙  Settings",   settingsPanel());
        root.add(tabs, BorderLayout.CENTER);

        // ── Status bar ────────────────────────────────────────────────────────
        JPanel statusBar = new JPanel(new BorderLayout());
        statusBar.setBorder(new EmptyBorder(3, 10, 4, 10));
        statusBar.setBackground(new Color(25, 27, 35));
        status.setFont(status.getFont().deriveFont(11f));
        status.setForeground(new Color(140, 160, 180));
        statusBar.add(status, BorderLayout.WEST);
        root.add(statusBar, BorderLayout.SOUTH);

        // Stats refresh timer
        new javax.swing.Timer(3000, e -> serverList.repaint()).start();

        return root;
    }

    private JComponent hostPanel() {
        JPanel panel = new JPanel(new BorderLayout(10, 10));
        panel.setBorder(new EmptyBorder(8, 10, 8, 10));

        // ── LEFT sidebar ──────────────────────────────────────────────────────
        JPanel left = new JPanel(new BorderLayout(0, 4));
        left.setPreferredSize(new Dimension(215, 0));

        JLabel serverHeader = new JLabel("Servers (0)");
        serverHeader.setFont(serverHeader.getFont().deriveFont(Font.BOLD, 11f));
        serverHeader.setForeground(new Color(120, 140, 180));
        serverHeader.setBorder(new EmptyBorder(0, 4, 2, 0));
        left.add(serverHeader, BorderLayout.NORTH);
        
        serverList.setSelectionMode(ListSelectionModel.SINGLE_SELECTION);
        serverList.addListSelectionListener(e -> {
            if (!e.getValueIsAdjusting()) updateConfigUi();
        });
        serverList.setCellRenderer(new StatusRenderer());
        serverList.setFixedCellHeight(36);

        // Empty-state placeholder
        JPanel listWrapper = new JPanel(new BorderLayout()) {
            @Override protected void paintComponent(Graphics g) {
                super.paintComponent(g);
                if (serverModel.isEmpty()) {
                    g.setFont(g.getFont().deriveFont(Font.ITALIC, 11f));
                    g.setColor(new Color(120, 120, 140));
                    String msg = "No servers — click Install";
                    FontMetrics fm = g.getFontMetrics();
                    g.drawString(msg, (getWidth() - fm.stringWidth(msg)) / 2, getHeight() / 2);
                }
            }
        };
        listWrapper.add(new JScrollPane(serverList), BorderLayout.CENTER);
        left.add(listWrapper, BorderLayout.CENTER);

        // Keep count label updated
        serverModel.addListDataListener(new javax.swing.event.ListDataListener() {
            void sync() { serverHeader.setText("Servers (" + serverModel.size() + ")"); }
            public void intervalAdded(javax.swing.event.ListDataEvent e)   { sync(); }
            public void intervalRemoved(javax.swing.event.ListDataEvent e) { sync(); }
            public void contentsChanged(javax.swing.event.ListDataEvent e) { sync(); }
        });

        // Right-click context menu
        JPopupMenu listCtx = new JPopupMenu();
        JMenuItem ctxStart  = new JMenuItem("▶ Start");
        JMenuItem ctxStop   = new JMenuItem("■ Stop");
        JMenuItem ctxFolder = new JMenuItem("📂 Open Folder");
        JMenuItem ctxMods   = new JMenuItem("🧩 Plugins & Mods");
        JMenuItem ctxDelete = new JMenuItem("🗑 Delete");
        ctxStart.addActionListener(e  -> CompletableFuture.runAsync(() -> { try { startServer(); } catch(Exception x){ SwingUtilities.invokeLater(()->showError(x)); } }));
        ctxStop.addActionListener(e   -> CompletableFuture.runAsync(() -> { try { stopServer();  } catch(Exception x){ SwingUtilities.invokeLater(()->showError(x)); } }));
        ctxFolder.addActionListener(e -> CompletableFuture.runAsync(this::openServerFolder));
        ctxMods.addActionListener(e   -> openModManager());
        ctxDelete.addActionListener(e -> CompletableFuture.runAsync(this::deleteServer));
        listCtx.add(ctxStart); listCtx.add(ctxStop); listCtx.addSeparator();
        listCtx.add(ctxFolder); listCtx.add(ctxMods); listCtx.addSeparator();
        listCtx.add(ctxDelete);
        serverList.setComponentPopupMenu(listCtx);

        JButton create = colorBtn("+ Install New Server", new Color(40, 110, 180), Color.WHITE);
        create.addActionListener(e -> CompletableFuture.runAsync(this::installServer));
        left.add(create, BorderLayout.SOUTH);
        panel.add(left, BorderLayout.WEST);

        JPanel right = new JPanel(new BorderLayout(10, 10));

        JPanel config = new JPanel();
        config.setLayout(new BoxLayout(config, BoxLayout.Y_AXIS));
        config.setBorder(BorderFactory.createTitledBorder("Configuration"));
        
        config.add(formRow("Name", serverName));
        config.add(formRow("Version", versionBox));
        
        JPanel ramPanel = new JPanel(new BorderLayout(5, 5));
        ramPanel.add(ramSlider, BorderLayout.CENTER);
        ramPanel.add(ramLabel, BorderLayout.EAST);
        config.add(formRow("RAM Allocation", ramPanel));
        
        config.add(formRow("Server Port", serverPort));
        config.add(formRow("Options", autoBackup));
        
        // Primary: Start / Stop
        JPanel primary = new JPanel(new FlowLayout(FlowLayout.LEFT, 6, 4));
        JButton startBtn = colorBtn("▶  Start Server", new Color(34, 140, 60), Color.WHITE);
        JButton stopBtn  = colorBtn("■  Stop Server",  new Color(180, 40, 40), Color.WHITE);
        startBtn.addActionListener(e -> CompletableFuture.runAsync(() -> { try { startServer(); } catch(Exception x){ SwingUtilities.invokeLater(()->showError(x)); } }));
        stopBtn.addActionListener(e  -> CompletableFuture.runAsync(() -> { try { stopServer();  } catch(Exception x){ SwingUtilities.invokeLater(()->showError(x)); } }));
        primary.add(startBtn); primary.add(stopBtn);

        // Secondary: tools
        JPanel secondary = new JPanel(new FlowLayout(FlowLayout.LEFT, 5, 2));
        secondary.add(button("🔄 Updates",    this::checkUpdates));
        secondary.add(button("📂 Folder",     this::openServerFolder));

        JButton modBtn = new JButton("🧩 Plugins & Mods");
        modBtn.addActionListener(e -> openModManager());
        secondary.add(modBtn);

        JButton propBtn = new JButton("⚙ Properties");
        propBtn.addActionListener(e -> openPropertiesEditor());
        secondary.add(propBtn);

        JButton backupBtn = new JButton("💾 Backup...");
        backupBtn.addActionListener(e -> showBackupMenu(backupBtn));
        secondary.add(backupBtn);

        JButton delBtn = colorBtn("🗑 Delete", new Color(120, 30, 30), Color.WHITE);
        delBtn.addActionListener(e -> CompletableFuture.runAsync(this::deleteServer));
        secondary.add(delBtn);

        JPanel actions = new JPanel();
        actions.setLayout(new BoxLayout(actions, BoxLayout.Y_AXIS));
        actions.add(primary); actions.add(secondary);
        config.add(actions);
        right.add(config, BorderLayout.NORTH);

        JPanel center = new JPanel(new GridLayout(1, 2, 10, 10));
        
        JPanel room = new JPanel();
        room.setLayout(new BoxLayout(room, BoxLayout.Y_AXIS));
        room.setBorder(BorderFactory.createTitledBorder("Public Room"));
        
        JPanel roomButtons = new JPanel(new FlowLayout(FlowLayout.LEFT, 5, 5));
        roomButtons.add(button("Start Room", this::startRoom));
        roomButtons.add(button("Stop Room", this::stopRoom));
        roomButtons.add(button("Copy Code", () -> copy(roomCode.getText())));
        room.add(roomButtons);
        
        roomCode.setPreferredSize(new Dimension(100, 25));
        room.add(roomCode);
        center.add(room);

        JPanel consolePanel = new JPanel(new BorderLayout(5, 5));
        consolePanel.setBorder(BorderFactory.createTitledBorder("Console"));
        
        console.setEditable(false);
        console.setBackground(new Color(18, 18, 24));
        console.setForeground(new Color(200, 210, 220));
        console.setFont(new Font(Font.MONOSPACED, Font.PLAIN, 12));
        console.setCaretColor(new Color(100, 220, 100));
        JScrollPane consoleScroll = new JScrollPane(console);
        consolePanel.add(consoleScroll, BorderLayout.CENTER);

        consoleInput.setFont(new Font(Font.MONOSPACED, Font.PLAIN, 12));
        consoleInput.setToolTipText("Type a command and press Enter");
        consoleInput.addActionListener(e -> {
            String cmd = consoleInput.getText().trim();
            if (!cmd.isEmpty()) {
                try {
                    processManager.sendCommand(selectedServer(), cmd);
                    consoleInput.setText("");
                } catch (Exception ex) {
                    showError(ex);
                }
            }
        });
        consolePanel.add(consoleInput, BorderLayout.SOUTH);
        center.add(consolePanel);
        
        right.add(center, BorderLayout.CENTER);
        panel.add(right, BorderLayout.CENTER);
        return panel;
    }

    private void showBackupMenu(JButton source) {
        String name = selectedServer();
        JPopupMenu menu = new JPopupMenu();
        JMenuItem world = new JMenuItem("World Only");
        world.addActionListener(e -> CompletableFuture.runAsync(() -> doBackup(name, false)));
        JMenuItem full = new JMenuItem("Full Server");
        full.addActionListener(e -> CompletableFuture.runAsync(() -> doBackup(name, true)));
        menu.add(world);
        menu.add(full);
        menu.show(source, 0, source.getHeight());
    }

    private void doBackup(String name, boolean full) {
        try {
            setStatus("Creating " + (full ? "full" : "world") + " backup...");
            Path out = backupService.backup(name, store.getServerDir(name), full);
            setStatus("Backup created: " + out.getFileName());
        } catch (IOException e) {
            SwingUtilities.invokeLater(() -> showError(e));
        }
    }

    private void openPropertiesEditor() {
        try {
            String name = selectedServer();
            Path dir = store.getServerDir(name);
            Properties props = configService.loadProperties(dir);
            
            // Convert properties to a 2D array for the table
            List<String[]> dataList = new ArrayList<>();
            props.forEach((k, v) -> dataList.add(new String[]{k.toString(), v.toString()}));
            dataList.sort(Comparator.comparing(a -> a[0]));
            
            String[][] data = dataList.toArray(new String[0][]);
            String[] columnNames = {"Property", "Value"};
            
            JTable table = new JTable(data, columnNames);
            table.setFillsViewportHeight(true);
            
            int result = JOptionPane.showConfirmDialog(this, new JScrollPane(table), "Server Properties: " + name, JOptionPane.OK_CANCEL_OPTION, JOptionPane.PLAIN_MESSAGE);
            if (result == JOptionPane.OK_OPTION) {
                // Read values back from the table
                Properties newProps = new Properties();
                for (int i = 0; i < table.getRowCount(); i++) {
                    String key = table.getValueAt(i, 0).toString();
                    String value = table.getValueAt(i, 1).toString();
                    newProps.setProperty(key, value);
                }
                configService.saveProperties(dir, newProps);
                setStatus("Saved properties for " + name);
            }
        } catch (Exception e) {
            showError(e);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  Mod & Plugin Manager
    // ─────────────────────────────────────────────────────────────────────────

    private void openModManager() {
        String name;
        try {
            name = selectedServer();
        } catch (IllegalStateException e) {
            showError(e);
            return;
        }

        Path serverDir  = store.getServerDir(name);
        String mcVersion = store.getProperty(name + ".version", "1.20.1");
        org.localm.service.ModrinthService.LoaderType loader =
                org.localm.service.ModrinthService.detectLoader(serverDir);

        // ── Dialog shell ───────────────────────────────────────────────────
        JDialog dialog = new JDialog(this,
                "Plugins & Mods  —  " + name + "  [" + loader.displayName() + "]", true);
        dialog.setSize(820, 600);
        dialog.setLocationRelativeTo(this);
        dialog.setLayout(new BorderLayout(8, 8));

        // ── Header bar ────────────────────────────────────────────────────
        JPanel header = new JPanel(new BorderLayout(8, 4));
        header.setBorder(new EmptyBorder(10, 12, 6, 12));

        JLabel loaderBadge = new JLabel("Loader: " + loader.displayName() + "  |  MC " + mcVersion);
        loaderBadge.setFont(loaderBadge.getFont().deriveFont(Font.BOLD));
        loaderBadge.setForeground(new Color(60, 120, 200));
        header.add(loaderBadge, BorderLayout.WEST);

        JTextField searchField = new JTextField();
        searchField.setToolTipText("Search Modrinth...");
        JButton searchBtn = new JButton("🔍 Search");

        JPanel searchBar = new JPanel(new BorderLayout(5, 0));
        searchBar.add(searchField, BorderLayout.CENTER);
        searchBar.add(searchBtn, BorderLayout.EAST);
        header.add(searchBar, BorderLayout.CENTER);

        dialog.add(header, BorderLayout.NORTH);

        // ── Split pane: left = search results, right = installed ───────────
        JSplitPane split = new JSplitPane(JSplitPane.HORIZONTAL_SPLIT);
        split.setDividerLocation(480);
        split.setResizeWeight(0.6);

        // LEFT – Search results ────────────────────────────────────────────
        DefaultListModel<ModrinthProject> resultModel = new DefaultListModel<>();
        JList<ModrinthProject> resultList = new JList<>(resultModel);
        resultList.setSelectionMode(ListSelectionModel.SINGLE_SELECTION);
        resultList.setCellRenderer(new ModrinthCellRenderer());
        resultList.setFixedCellHeight(60);

        JPanel leftPanel = new JPanel(new BorderLayout(4, 4));
        leftPanel.setBorder(BorderFactory.createTitledBorder("Modrinth Results"));
        leftPanel.add(new JScrollPane(resultList), BorderLayout.CENTER);

        // Description pane below results
        JTextArea descArea = new JTextArea(3, 40);
        descArea.setEditable(false);
        descArea.setLineWrap(true);
        descArea.setWrapStyleWord(true);
        descArea.setFont(descArea.getFont().deriveFont(11f));
        descArea.setBackground(new Color(250, 250, 250));
        descArea.setBorder(new EmptyBorder(4, 6, 4, 6));
        leftPanel.add(new JScrollPane(descArea), BorderLayout.SOUTH);

        resultList.addListSelectionListener(ev -> {
            if (!ev.getValueIsAdjusting()) {
                ModrinthProject p = resultList.getSelectedValue();
                if (p != null) {
                    descArea.setText(p.title() + " by " + p.author()
                            + "\n" + formatDownloads(p.downloads()) + " downloads\n\n"
                            + p.description());
                }
            }
        });

        split.setLeftComponent(leftPanel);

        // RIGHT – Installed jars ───────────────────────────────────────────
        DefaultListModel<Path> installedModel = new DefaultListModel<>();
        JList<Path> installedList = new JList<>(installedModel);
        installedList.setSelectionMode(ListSelectionModel.SINGLE_SELECTION);
        installedList.setCellRenderer(new JarFileCellRenderer());

        JPanel rightPanel = new JPanel(new BorderLayout(4, 4));
        rightPanel.setBorder(BorderFactory.createTitledBorder(
                "Installed " + capitalize(loader.folder)));
        rightPanel.add(new JScrollPane(installedList), BorderLayout.CENTER);

        JButton deleteBtn  = new JButton("🗑 Delete");
        JButton openDirBtn = new JButton("📂 Open Folder");
        JButton refreshBtn = new JButton("↻");
        refreshBtn.setToolTipText("Refresh installed list");

        JPanel rightBtns = new JPanel(new FlowLayout(FlowLayout.LEFT, 4, 4));
        rightBtns.add(deleteBtn);
        rightBtns.add(openDirBtn);
        rightBtns.add(refreshBtn);
        rightPanel.add(rightBtns, BorderLayout.SOUTH);
        split.setRightComponent(rightPanel);

        dialog.add(split, BorderLayout.CENTER);

        // ── Bottom status / progress bar ───────────────────────────────────
        JProgressBar progress = new JProgressBar();
        progress.setStringPainted(true);
        progress.setString("Ready");
        progress.setVisible(false);

        JButton installBtn = new JButton("⬇ Install Selected");
        installBtn.setFont(installBtn.getFont().deriveFont(Font.BOLD));
        installBtn.setBackground(new Color(50, 150, 80));
        installBtn.setForeground(Color.WHITE);
        installBtn.setOpaque(true);

        JPanel bottom = new JPanel(new BorderLayout(8, 4));
        bottom.setBorder(new EmptyBorder(4, 10, 10, 10));
        bottom.add(progress,    BorderLayout.CENTER);
        bottom.add(installBtn,  BorderLayout.EAST);
        dialog.add(bottom, BorderLayout.SOUTH);

        // ── Helpers ───────────────────────────────────────────────────────
        Runnable reloadInstalled = () -> {
            List<Path> jars = modrinthService.listInstalled(serverDir, loader);
            SwingUtilities.invokeLater(() -> {
                installedModel.clear();
                jars.forEach(installedModel::addElement);
            });
        };
        reloadInstalled.run();

        // ── Search action ─────────────────────────────────────────────────
        Runnable doSearch = () -> {
            String query = searchField.getText().trim();
            if (query.isEmpty()) return;
            progress.setVisible(true);
            progress.setIndeterminate(true);
            progress.setString("Searching Modrinth...");
            resultModel.clear();
            descArea.setText("");
            CompletableFuture.runAsync(() -> {
                try {
                    List<ModrinthProject> results =
                            modrinthService.search(query, loader, mcVersion);
                    SwingUtilities.invokeLater(() -> {
                        resultModel.clear();
                        results.forEach(resultModel::addElement);
                        progress.setIndeterminate(false);
                        progress.setString("Found " + results.size() + " results");
                        if (!results.isEmpty()) resultList.setSelectedIndex(0);
                    });
                } catch (Exception ex) {
                    SwingUtilities.invokeLater(() -> {
                        progress.setVisible(false);
                        showError(ex);
                    });
                }
            });
        };

        searchField.addActionListener(e -> doSearch.run());
        searchBtn.addActionListener(e -> doSearch.run());

        // ── Install action ────────────────────────────────────────────────
        installBtn.addActionListener(e -> {
            ModrinthProject selected = resultList.getSelectedValue();
            if (selected == null) {
                JOptionPane.showMessageDialog(dialog,
                        "Select a project from the search results first.",
                        "No selection", JOptionPane.INFORMATION_MESSAGE);
                return;
            }
            installBtn.setEnabled(false);
            progress.setVisible(true);
            progress.setIndeterminate(true);
            progress.setString("Resolving download for " + selected.title() + "...");

            CompletableFuture.runAsync(() -> {
                try {
                    String downloadUrl = modrinthService.getLatestDownloadUrl(
                            selected.id(), mcVersion, loader);
                    if (downloadUrl == null) {
                        throw new Exception("No compatible .jar found for "
                                + selected.title() + " on " + mcVersion
                                + " [" + loader.displayName() + "]");
                    }

                    Path targetDir = serverDir.resolve(loader.folder);
                    Files.createDirectories(targetDir);
                    Path targetFile = targetDir.resolve(selected.slug() + ".jar");

                    SwingUtilities.invokeLater(() ->
                            progress.setString("Downloading " + selected.title() + "..."));

                    versionService.download(downloadUrl, targetFile);

                    SwingUtilities.invokeLater(() -> {
                        progress.setIndeterminate(false);
                        progress.setString("Installed " + selected.title() + " ✓");
                        installBtn.setEnabled(true);
                        setStatus("Installed " + selected.title());
                        reloadInstalled.run();
                    });
                } catch (Exception ex) {
                    SwingUtilities.invokeLater(() -> {
                        progress.setVisible(false);
                        installBtn.setEnabled(true);
                        showError(ex);
                    });
                }
            });
        });

        // ── Delete installed jar ──────────────────────────────────────────
        deleteBtn.addActionListener(e -> {
            Path jar = installedList.getSelectedValue();
            if (jar == null) return;
            int ok = JOptionPane.showConfirmDialog(dialog,
                    "Delete " + jar.getFileName() + "?",
                    "Confirm Delete", JOptionPane.YES_NO_OPTION, JOptionPane.WARNING_MESSAGE);
            if (ok != JOptionPane.YES_OPTION) return;
            try {
                Files.deleteIfExists(jar);
                reloadInstalled.run();
                setStatus("Deleted " + jar.getFileName());
            } catch (IOException ex) {
                showError(ex);
            }
        });

        // ── Open installed folder ─────────────────────────────────────────
        openDirBtn.addActionListener(e -> {
            Path dir = serverDir.resolve(loader.folder);
            try { Files.createDirectories(dir); } catch (IOException ignored) {}
            CompletableFuture.runAsync(() -> open(dir));
        });

        refreshBtn.addActionListener(e -> reloadInstalled.run());

        dialog.setVisible(true);
    }

    /** Format large download counts nicely (e.g. 1.2M, 340K) */
    private String formatDownloads(long n) {
        if (n >= 1_000_000) return String.format("%.1fM", n / 1_000_000.0);
        if (n >= 1_000)     return String.format("%.1fK", n / 1_000.0);
        return String.valueOf(n);
    }

    private String capitalize(String s) {
        return s.isEmpty() ? s : Character.toUpperCase(s.charAt(0)) + s.substring(1);
    }

    /** Cell renderer for Modrinth search results */
    private class ModrinthCellRenderer extends DefaultListCellRenderer {
        @Override
        public Component getListCellRendererComponent(
                JList<?> list, Object value, int index,
                boolean isSelected, boolean cellHasFocus) {
            JLabel label = (JLabel) super.getListCellRendererComponent(
                    list, value, index, isSelected, cellHasFocus);
            if (value instanceof ModrinthProject p) {
                label.setText("<html><b>" + escHtml(p.title())
                        + "</b>  <font color='#888888'>by " + escHtml(p.author()) + "</font>"
                        + "<br/><font color='#555555' size='-1'>" + escHtml(p.description())
                        + "</font></html>");
                label.setToolTipText(formatDownloads(p.downloads()) + " downloads");
                label.setBorder(new EmptyBorder(4, 8, 4, 8));
            }
            return label;
        }
    }

    /** Cell renderer for installed .jar files */
    private class JarFileCellRenderer extends DefaultListCellRenderer {
        @Override
        public Component getListCellRendererComponent(
                JList<?> list, Object value, int index,
                boolean isSelected, boolean cellHasFocus) {
            JLabel label = (JLabel) super.getListCellRendererComponent(
                    list, value, index, isSelected, cellHasFocus);
            if (value instanceof Path p) {
                long size = 0;
                try { size = Files.size(p); } catch (IOException ignored) {}
                label.setText("<html>" + escHtml(p.getFileName().toString())
                        + " <font color='#888888'>" + formatBytes(size) + "</font></html>");
                label.setBorder(new EmptyBorder(2, 8, 2, 8));
            }
            return label;
        }
    }

    private static String escHtml(String s) {
        if (s == null) return "";
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
    }

    private JComponent joinPanel() {
        JPanel wrapper = new JPanel(new GridBagLayout());
        JPanel panel = new JPanel();
        panel.setLayout(new BoxLayout(panel, BoxLayout.Y_AXIS));
        panel.setBorder(BorderFactory.createTitledBorder("Join A VoxelPort Room"));
        panel.setPreferredSize(new Dimension(500, 300));
        
        panel.add(formRow("Room Code", joinCode));
        
        JPanel buttons = new JPanel(new FlowLayout(FlowLayout.LEFT, 5, 5));
        buttons.add(button("Connect", this::startJoinProxy));
        buttons.add(button("Disconnect", this::stopJoinProxy));
        buttons.add(button("Copy Address", () -> copy(joinAddress.getText())));
        panel.add(buttons);
        
        joinAddress.setEditable(false);
        panel.add(formRow("Minecraft Address", joinAddress));
        
        wrapper.add(panel);
        return wrapper;
    }

    private JComponent settingsPanel() {
        JPanel panel = new JPanel(new BorderLayout(10, 10));
        panel.setBorder(BorderFactory.createTitledBorder("System & App Info"));

        // ── App Info ──────────────────────────────────────────────────────────
        String appVersion = "1.0.0";
        Path dataDir = store.getDataDir();

        // ── JVM heap snapshot ────────────────────────────────────────────────
        long heapUsed = Runtime.getRuntime().totalMemory() - Runtime.getRuntime().freeMemory();
        long heapMax  = Runtime.getRuntime().maxMemory();

        // ── Physical system memory via OperatingSystemMXBean ─────────────────
        long totalPhysicalRam = -1;
        long freePhysicalRam  = -1;
        try {
            com.sun.management.OperatingSystemMXBean osBean =
                (com.sun.management.OperatingSystemMXBean)
                    java.lang.management.ManagementFactory.getOperatingSystemMXBean();
            totalPhysicalRam = osBean.getTotalMemorySize();
            freePhysicalRam  = osBean.getFreeMemorySize();
        } catch (Exception ignored) {}

        String ramLine = (totalPhysicalRam > 0)
            ? formatBytes(totalPhysicalRam - freePhysicalRam)
              + " used / " + formatBytes(totalPhysicalRam) + " total"
            : "unavailable";

        // ── Disk space for data folder ────────────────────────────────────────
        String diskLine;
        try {
            java.io.File root = dataDir.toFile();
            long usable = root.getUsableSpace();
            long total  = root.getTotalSpace();
            diskLine = formatBytes(total - usable) + " used / " + formatBytes(total) + " total";
        } catch (Exception ignored) {
            diskLine = "unavailable";
        }

        // ── Hostname ──────────────────────────────────────────────────────────
        String hostname;
        try {
            hostname = java.net.InetAddress.getLocalHost().getHostName();
        } catch (Exception ignored) {
            hostname = "unknown";
        }

        String infoText = """
                ╔══════════════════════════════════════╗
                  VoxelPort  v%s
                ╚══════════════════════════════════════╝

                ── APP INFO ───────────────────────────
                Version      : %s
                Data Folder  : %s

                ── SYSTEM INFO ────────────────────────
                Hostname     : %s
                OS           : %s  %s
                Architecture : %s
                CPU Cores    : %d logical processors
                System RAM   : %s
                JVM Heap     : %s used / %s max
                Disk (data)  : %s

                ── JAVA RUNTIME ───────────────────────
                Java Version : %s
                Vendor       : %s
                JVM Home     : %s

                VoxelPort is a standalone Minecraft server
                management tool focused on performance
                and simplicity.
                """.formatted(
                appVersion,
                appVersion,
                dataDir,
                hostname,
                System.getProperty("os.name"),
                System.getProperty("os.version"),
                System.getProperty("os.arch"),
                Runtime.getRuntime().availableProcessors(),
                ramLine,
                formatBytes(heapUsed), formatBytes(heapMax),
                diskLine,
                System.getProperty("java.version"),
                System.getProperty("java.vendor"),
                System.getProperty("java.home")
        );

        JTextArea info = new JTextArea(infoText);
        info.setEditable(false);
        info.setLineWrap(true);
        info.setWrapStyleWord(true);
        info.setFont(new Font(Font.MONOSPACED, Font.PLAIN, 12));
        info.setBackground(new Color(30, 30, 30));
        info.setForeground(new Color(200, 255, 200));
        info.setBorder(new EmptyBorder(8, 10, 8, 10));

        panel.add(new JScrollPane(info), BorderLayout.CENTER);

        JButton openData = new JButton("Open Data Folder");
        openData.addActionListener(e -> CompletableFuture.runAsync(() -> open(store.getDataDir())));
        panel.add(openData, BorderLayout.SOUTH);
        return panel;
    }

    private String formatBytes(long bytes) {
        if (bytes < 1024) return bytes + " B";
        int exp = (int) (Math.log(bytes) / Math.log(1024));
        String pre = "KMGTPE".charAt(exp - 1) + "";
        return String.format("%.1f %sB", bytes / Math.pow(1024, exp), pre);
    }

    private JPanel formRow(String label, JComponent field) {
        JPanel row = new JPanel(new BorderLayout(5, 5));
        row.setMaximumSize(new Dimension(Integer.MAX_VALUE, 50));
        row.setBorder(new EmptyBorder(0, 0, 10, 0));
        JLabel l = new JLabel(label);
        row.add(l, BorderLayout.NORTH);
        row.add(field, BorderLayout.CENTER);
        return row;
    }

    private JButton button(String text, Runnable action) {
        JButton b = new JButton(text);
        b.addActionListener(e -> CompletableFuture.runAsync(() -> {
            try {
                action.run();
            } catch (Exception ex) {
                SwingUtilities.invokeLater(() -> showError(ex));
            }
        }));
        return b;
    }

    /** Button with explicit background/foreground (accent colors). */
    private JButton colorBtn(String text, Color bg, Color fg) {
        JButton b = new JButton(text);
        b.setBackground(bg);
        b.setForeground(fg);
        b.setOpaque(true);
        b.setFocusPainted(false);
        return b;
    }

    private void checkUpdates() {
        String name = selectedServer();
        String mcVersion = store.getProperty(name + ".version");
        Path dir = store.getServerDir(name);
        setStatus("Checking for updates...");

        CompletableFuture.runAsync(() -> {
            try {
                String latestUrl = null;
                if (mcVersion != null) {
                    try {
                        String paper = versionService.httpGet("https://api.papermc.io/v2/projects/paper/versions/" + mcVersion + "/builds");
                        String build = lastNumber(paper, "\"build\"\\s*:\\s*(\\d+)");
                        String file = last(paper, "\"name\"\\s*:\\s*\"([^\"]+\\.jar)\"");
                        if (build != null && file != null) latestUrl = "https://api.papermc.io/v2/projects/paper/versions/" + mcVersion + "/builds/" + build + "/downloads/" + file;
                    } catch (Exception ignored) {}

                    if (latestUrl == null) {
                        try {
                            latestUrl = "https://api.purpurmc.org/v2/purpur/" + mcVersion + "/latest/download";
                        } catch (Exception ignored) {}
                    }
                }

                if (latestUrl == null) {
                    setStatus("Could not find update info");
                    return;
                }

                String finalUrl = latestUrl;
                SwingUtilities.invokeLater(() -> {
                    int ok = JOptionPane.showConfirmDialog(this, "Found latest build for " + mcVersion + ".\nDo you want to redownload server.jar to ensure it's up to date?", "Check Updates", JOptionPane.YES_NO_OPTION);
                    if (ok == JOptionPane.YES_OPTION) {
                        CompletableFuture.runAsync(() -> {
                            try {
                                setStatus("Updating " + name + "...");
                                versionService.download(finalUrl, dir.resolve("server.jar"));
                                setStatus("Updated " + name);
                            } catch (Exception e) {
                                showError(e);
                            }
                        });
                    } else {
                        setStatus("Ready");
                    }
                });
            } catch (Exception e) {
                showError(e);
            }
        });
    }

    private void loadVersions() {
        CompletableFuture.runAsync(() -> {
            setStatus("Loading versions...");
            List<ServerVersion> versions = versionService.fetchVersions();
            SwingUtilities.invokeLater(() -> {
                versionBox.removeAllItems();
                versions.forEach(versionBox::addItem);
                setStatus(versions.isEmpty() ? "Could not load versions" : "Ready");
            });
        });
    }

    private String last(String input, String regex) {
        Matcher matcher = Pattern.compile(regex).matcher(input);
        String last = null;
        while (matcher.find()) last = matcher.group(1);
        return last;
    }

    private String lastNumber(String input, String regex) {
        Matcher matcher = Pattern.compile(regex).matcher(input);
        String last = null;
        while (matcher.find()) last = matcher.group(1);
        return last;
    }

    private void installServer() {
        ServerVersion version = (ServerVersion) versionBox.getSelectedItem();
        if (version == null) throw new IllegalStateException("No server version selected");
        String name = cleanName(serverName.getText());

        Path parentDir = chooseParentInstallDirectory(name);
        if (parentDir == null) return;
        Path dir = parentDir.resolve(name);
        try {
            Files.createDirectories(dir);
            int port = findNextFreeServerPort();
            Files.writeString(dir.resolve("eula.txt"), "eula=true\n");
            Files.writeString(dir.resolve("server.properties"), "server-port=" + port + "\nonline-mode=true\nmax-players=20\nmotd=VoxelPort Server\n");

            if (version.label().startsWith("Forge")) {
                setStatus("Downloading Forge installer...");
                Path installer = dir.resolve("forge-installer.jar");
                versionService.download(version.url(), installer);
                setStatus("Installing Forge (this may take a few minutes)...");
                String javaBin = processManager.detectJava(version.mcVersion());
                Process p = new ProcessBuilder(javaBin, "-jar", "forge-installer.jar", "--installServer")
                        .directory(dir.toFile())
                        .start();
                p.waitFor();
                Files.deleteIfExists(installer);
                Files.deleteIfExists(dir.resolve("forge-installer.jar.log"));

                if (!Files.exists(dir.resolve("user_jvm_args.txt"))) {
                    try (var stream = Files.list(dir)) {
                        Path forgeJar = stream.filter(f -> f.getFileName().toString().startsWith("forge-") && f.toString().endsWith(".jar"))
                                .findFirst().orElse(null);
                        if (forgeJar != null) {
                            Files.move(forgeJar, dir.resolve("server.jar"), StandardCopyOption.REPLACE_EXISTING);
                        }
                    }
                }
            } else {
                setStatus("Downloading server jar...");
                versionService.download(version.url(), dir.resolve("server.jar"));
            }

            store.setProperty(name + ".dir", dir.toString());
            store.setProperty(name + ".version", version.mcVersion());
            store.setProperty(name + ".port", String.valueOf(port));
            store.setProperty(name + ".ram", String.valueOf(getSelectedRam()));
            store.setProperty(name + ".autoBackup", String.valueOf(autoBackup.isSelected()));
            store.save();
            refreshServerList();
            setStatus("Installed " + name + " on port " + port);
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    private Path chooseParentInstallDirectory(String serverName) {
        if (SwingUtilities.isEventDispatchThread()) {
            JFileChooser chooser = new JFileChooser();
            chooser.setFileSelectionMode(JFileChooser.DIRECTORIES_ONLY);
            chooser.setDialogTitle("Choose parent folder for " + serverName);
            if (chooser.showOpenDialog(this) != JFileChooser.APPROVE_OPTION) return null;
            return chooser.getSelectedFile().toPath();
        }

        final Path[] selectedPath = new Path[1];
        final RuntimeException[] failure = new RuntimeException[1];
        try {
            SwingUtilities.invokeAndWait(() -> {
                try {
                    JFileChooser chooser = new JFileChooser();
                    chooser.setFileSelectionMode(JFileChooser.DIRECTORIES_ONLY);
                    chooser.setDialogTitle("Choose parent folder for " + serverName);
                    if (chooser.showOpenDialog(this) == JFileChooser.APPROVE_OPTION) {
                        selectedPath[0] = chooser.getSelectedFile().toPath();
                    }
                } catch (RuntimeException e) {
                    failure[0] = e;
                }
            });
        } catch (Exception e) {
            throw new RuntimeException("Failed to open install directory chooser", e);
        }

        if (failure[0] != null) throw failure[0];
        return selectedPath[0];
    }

    private int getSelectedRam() {
        return ramSlider.getValue();
    }
    
    private int getSystemRamMb() {
        try {
            com.sun.management.OperatingSystemMXBean osBean = (com.sun.management.OperatingSystemMXBean) java.lang.management.ManagementFactory.getOperatingSystemMXBean();
            return (int) (osBean.getTotalMemorySize() / 1024 / 1024);
        } catch (Exception e) {
            return 16384;
        }
    }

    private int findNextFreeServerPort() {
        int port = 25565;
        Set<Integer> usedPorts = new HashSet<>();
        for (String key : store.stringPropertyNames()) {
            if (key.endsWith(".port")) {
                String name = key.substring(0, key.length() - 5);
                if (store.containsKey(name + ".dir")) {
                    try {
                        usedPorts.add(Integer.parseInt(store.getProperty(key)));
                    } catch (NumberFormatException ignored) {}
                }
            }
        }
        while (usedPorts.contains(port)) {
            port++;
        }
        return port;
    }

    private void startServer() {
        String name = selectedServer();
        Path dir = store.getServerDir(name);
        if (processManager.isAlive(name)) throw new IllegalStateException("Server already running");
        
        store.setProperty(name + ".ram", String.valueOf(getSelectedRam()));
        store.setProperty(name + ".port", serverPort.getText());
        store.setProperty(name + ".autoBackup", String.valueOf(autoBackup.isSelected()));
        try { store.save(); } catch (IOException ignored) {}

        try {
            int port = Integer.parseInt(store.getProperty(name + ".port", "25565"));
            Path propsFile = dir.resolve("server.properties");
            if (Files.exists(propsFile)) {
                String content = Files.readString(propsFile);
                content = content.replaceAll("server-port=\\d+", "server-port=" + port);
                Files.writeString(propsFile, content);
            }

            String mcVersion = store.getProperty(name + ".version", "1.21");
            int ram = Integer.parseInt(store.getProperty(name + ".ram", String.valueOf(getSelectedRam())));
            processManager.startServer(name, dir, mcVersion, ram, (n, text) -> {
                SwingUtilities.invokeLater(() -> appendConsole(n, text));
            }, () -> {
                if (store.getBoolean(name + ".autoBackup", false)) {
                    doBackup(name, false);
                }
                SwingUtilities.invokeLater(() -> {
                    setStatus(name + " stopped");
                    serverList.repaint();
                });
            });
            setStatus("Server running: " + name);
            serverList.repaint();
        } catch (IOException e) {
            throw new RuntimeException(e);
        }
    }

    private void stopServer() {
        String name = selectedServer();
        stopServerByName(name);
    }

    private void stopServerByName(String name) {
        processManager.stopServer(name);
        if (processManager.isAlive(name)) {
            setStatus("Stopping " + name + "...");
        }
    }

    private void appendConsole(String name, String text) {
        DefaultStyledDocument doc = consoleDocs.computeIfAbsent(name, k -> new DefaultStyledDocument());
        try {
            int lastIdx = 0;
            Matcher m = Pattern.compile("\u001B\\[([;\\d]*)m").matcher(text);
            SimpleAttributeSet style = new SimpleAttributeSet();
            StyleConstants.setForeground(style, new Color(200, 210, 220));
            StyleConstants.setFontFamily(style, Font.MONOSPACED);
            StyleConstants.setFontSize(style, 12);

            while (m.find()) {
                String segment = text.substring(lastIdx, m.start());
                if (!segment.isEmpty()) {
                    doc.insertString(doc.getLength(), segment, style);
                }
                
                String params = m.group(1);
                if (params == null || params.isEmpty() || "0".equals(params)) {
                    style = new SimpleAttributeSet();
                    StyleConstants.setForeground(style, Color.BLACK);
                    StyleConstants.setFontFamily(style, Font.MONOSPACED);
                    StyleConstants.setFontSize(style, 12);
                } else {
                    for (String part : params.split(";")) {
                        if (part.isEmpty()) continue;
                        int code = Integer.parseInt(part);
                        if (code == 0) {
                            StyleConstants.setForeground(style, Color.BLACK);
                            StyleConstants.setBold(style, false);
                        } else if (code == 1) {
                            StyleConstants.setBold(style, true);
                        } else if ((code >= 30 && code <= 37) || (code >= 90 && code <= 97)) {
                            StyleConstants.setForeground(style, getAnsiColor(code));
                        }
                    }
                }
                lastIdx = m.end();
            }
            String remaining = text.substring(lastIdx);
            if (!remaining.isEmpty()) {
                doc.insertString(doc.getLength(), remaining, style);
            }
            doc.insertString(doc.getLength(), "\n", style);

            if (name.equals(serverList.getSelectedValue())) {
                console.setCaretPosition(doc.getLength());
            }
        } catch (BadLocationException ignored) {}
    }

    private Color getAnsiColor(int code) {
        return switch (code) {
            case 30 -> Color.BLACK;
            case 31 -> new Color(178, 34, 34);
            case 32 -> new Color(34, 139, 34);
            case 33 -> new Color(184, 134, 11);
            case 34 -> new Color(0, 0, 139);
            case 35 -> new Color(139, 0, 139);
            case 36 -> new Color(0, 139, 139);
            case 37 -> Color.DARK_GRAY;
            case 90 -> Color.GRAY;
            case 91 -> Color.RED;
            case 92 -> new Color(50, 205, 50);
            case 93 -> new Color(218, 165, 32);
            case 94 -> Color.BLUE;
            case 95 -> Color.MAGENTA;
            case 96 -> Color.CYAN;
            case 97 -> Color.LIGHT_GRAY;
            default -> Color.BLACK;
        };
    }

    private void openServerFolder() {
        open(store.getServerDir(selectedServer()));
    }

    private void openPluginsFolder() {
        Path plugins = store.getServerDir(selectedServer()).resolve("plugins");
        try {
            Files.createDirectories(plugins);
            open(plugins);
        } catch (IOException e) {
            throw new RuntimeException(e);
        }
    }

    private void deleteServer() {
        String name = selectedServer();
        Path dir = store.getServerDir(name);
        int ok = JOptionPane.showConfirmDialog(this, "Delete " + name + " from VoxelPort and from this PC?\nThis removes worlds, plugins, and backups.", "Delete Server", JOptionPane.YES_NO_OPTION, JOptionPane.WARNING_MESSAGE);
        if (ok != JOptionPane.YES_OPTION) return;
        if (processManager.isAlive(name)) throw new IllegalStateException("Stop the server before deleting it");
        try {
            deleteRecursive(dir);
            store.remove(name + ".dir");
            store.remove(name + ".version");
            store.remove(name + ".port");
            store.remove(name + ".ram");
            store.remove(name + ".autoBackup");
            store.save();
            refreshServerList();
            setStatus("Deleted " + name);
        } catch (IOException e) {
            throw new RuntimeException(e);
        }
    }

    private class StatusRenderer extends DefaultListCellRenderer {
        @Override public Component getListCellRendererComponent(JList<?> list, Object value, int index, boolean isSelected, boolean cellHasFocus) {
            JLabel label = (JLabel) super.getListCellRendererComponent(list, value, index, isSelected, cellHasFocus);
            String name = (String) value;
            boolean online = processManager.isAlive(name);
            String stats = processManager.getProcessStats(name);

            label.setText(online && !stats.isEmpty() ? name + " (" + stats + ")" : name);
            label.setBorder(new EmptyBorder(2, 5, 2, 5));

            label.setIcon(new Icon() {
                @Override public void paintIcon(Component c, Graphics g, int x, int y) {
                    g.setColor(online ? Color.GREEN : Color.GRAY);
                    g.fillOval(x, y + 2, 8, 8);
                }
                @Override public int getIconWidth() { return 12; }
                @Override public int getIconHeight() { return 12; }
            });
            return label;
        }
    }

    private void startRoom() {
        try {
            String name = selectedServer();
            int serverPort = Integer.parseInt(store.getProperty(name + ".port", "25565"));
            tunnelService.startRoom(serverPort, code -> roomCode.setText(code), this::setStatus);
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    private void stopRoom() {
        tunnelService.stopRoom();
    }

    private void startJoinProxy() {
        try {
            tunnelService.startJoinProxy(joinCode.getText().trim(), 25565, this::setStatus);
            joinAddress.setText("localhost:25565");
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    private void stopJoinProxy() {
        tunnelService.stopJoinProxy();
    }

    private void refreshServerList() {
        store.cleanupOrphans();
        serverModel.clear();
        store.stringPropertyNames().stream()
                .filter(k -> k.endsWith(".dir"))
                .map(k -> k.substring(0, k.length() - 4))
                .sorted()
                .forEach(serverModel::addElement);
        if (!serverModel.isEmpty()) {
            serverList.setSelectedIndex(0);
            updateConfigUi();
        }
    }

    private void updateConfigUi() {
        String name = serverList.getSelectedValue();
        if (name == null) return;
        serverName.setText(name);
        serverPort.setText(store.getProperty(name + ".port", "25565"));
        autoBackup.setSelected(store.getBoolean(name + ".autoBackup", false));

        console.setDocument(consoleDocs.computeIfAbsent(name, k -> new DefaultStyledDocument()));

        String ramStr = store.getProperty(name + ".ram", "4096");
        try {
            int ram = Integer.parseInt(ramStr);
            ramSlider.setValue(ram);
        } catch (Exception ignored) {}
    }

    private String selectedServer() {
        String selected = serverList.getSelectedValue();
        if (selected == null) throw new IllegalStateException("Select a server first");
        return selected;
    }

    private String cleanName(String name) {
        String value = name == null ? "" : name.trim();
        if (value.isEmpty() || value.matches(".*[<>:\"/\\\\|?*].*")) throw new IllegalArgumentException("Invalid server name");
        return value;
    }

    private void deleteRecursive(Path path) throws IOException {
        if (!Files.exists(path)) return;
        try (var walk = Files.walk(path)) {
            walk.sorted(Comparator.reverseOrder()).forEach(p -> {
                try { Files.deleteIfExists(p); } catch (IOException e) { throw new UncheckedIOException(e); }
            });
        }
    }

    private void copy(String text) {
        Toolkit.getDefaultToolkit().getSystemClipboard().setContents(new StringSelection(text), null);
        setStatus("Copied");
    }

    private void open(Path path) {
        try {
            Desktop.getDesktop().open(path.toFile());
        } catch (IOException e) {
            throw new RuntimeException(e);
        }
    }

    private boolean isWindows() {
        return System.getProperty("os.name").toLowerCase(Locale.ROOT).contains("win");
    }

    private void setStatus(String message) {
        SwingUtilities.invokeLater(() -> status.setText(message));
    }

    private void showError(Throwable error) {
        JOptionPane.showMessageDialog(this, error.getMessage(), "VoxelPort", JOptionPane.ERROR_MESSAGE);
        setStatus("Error: " + error.getMessage());
    }
}
