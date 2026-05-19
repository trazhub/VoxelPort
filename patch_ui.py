import re

with open("src/main/java/org/localm/LocalMJava.java", "r", encoding="utf-8") as f:
    content = f.read()

# Find the start of buildUi
start_marker = "    private JComponent buildUi() {"
# Find the end of managePanel
end_marker = "        return panel;\n    }"
start_idx = content.find(start_marker)
end_idx = content.find(end_marker, start_idx) + len(end_marker)

if start_idx == -1 or end_idx < len(end_marker):
    print("Could not find markers!")
    exit(1)

new_ui = """    private JComponent buildUi() {
        JPanel root = new JPanel(new BorderLayout(0, 0));

        // -- Header ------------------------------------------------------------
        JPanel header = new JPanel(new BorderLayout(12, 0));
        header.setBorder(new EmptyBorder(10, 16, 10, 16));
        header.setBackground(new Color(30, 32, 40));

        JLabel title = new JLabel("VoxelPort");
        title.setFont(title.getFont().deriveFont(Font.BOLD, 18f));
        title.setForeground(new Color(100, 200, 255));
        header.add(title, BorderLayout.WEST);

        JPanel rightHeader = new JPanel(new FlowLayout(FlowLayout.RIGHT, 15, 0));
        rightHeader.setOpaque(false);
        
        JButton sponsorHeaderBtn = new JButton("Sponsor");
        sponsorHeaderBtn.setCursor(new Cursor(Cursor.HAND_CURSOR));
        sponsorHeaderBtn.setForeground(new Color(216, 74, 123));
        sponsorHeaderBtn.setFocusPainted(false);
        sponsorHeaderBtn.setContentAreaFilled(false);
        sponsorHeaderBtn.setBorderPainted(false);
        sponsorHeaderBtn.setFont(sponsorHeaderBtn.getFont().deriveFont(Font.BOLD, 12f));
        sponsorHeaderBtn.addActionListener(e -> {
            try {
                Desktop.getDesktop().browse(new URI("https://github.com/sponsors/trazhub"));
            } catch (Exception ex) {
                showError(ex);
            }
        });
        rightHeader.add(sponsorHeaderBtn);

        JLabel badge = new JLabel("v1.0.0");
        badge.setFont(badge.getFont().deriveFont(Font.PLAIN, 11f));
        badge.setForeground(new Color(120, 120, 140));
        badge.setBorder(new EmptyBorder(4, 0, 0, 0));
        rightHeader.add(badge);

        header.add(rightHeader, BorderLayout.EAST);
        root.add(header, BorderLayout.NORTH);

        // -- Tabs --------------------------------------------------------------
        JTabbedPane tabs = new JTabbedPane();
        tabs.addTab("Host",       hostPanel());
        tabs.addTab("Join Room",  joinPanel());
        tabs.addTab("Settings",   settingsPanel());
        root.add(tabs, BorderLayout.CENTER);

        // -- Status bar --------------------------------------------------------
        JPanel statusBar = new JPanel(new BorderLayout());
        statusBar.setBorder(new EmptyBorder(6, 12, 7, 12));
        statusBar.setBackground(new Color(18, 24, 32));
        status.setFont(new Font(Font.MONOSPACED, Font.PLAIN, 12));
        status.setForeground(new Color(195, 216, 245));
        statusBar.add(status, BorderLayout.WEST);
        root.add(statusBar, BorderLayout.SOUTH);

        // Stats refresh timer
        new javax.swing.Timer(3000, e -> serverList.repaint()).start();

        return root;
    }

    private JComponent hostPanel() {
        JPanel panel = new JPanel(new BorderLayout(10, 10));
        panel.setBorder(new EmptyBorder(8, 10, 8, 10));

        // -- LEFT sidebar ------------------------------------------------------
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
                    String msg = "No servers - click Install";
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
        JMenuItem ctxStart  = new JMenuItem("Start");
        JMenuItem ctxStop   = new JMenuItem("Stop");
        JMenuItem ctxFolder = new JMenuItem("Open Folder");
        JMenuItem ctxMods   = new JMenuItem("Plugins & Mods");
        JMenuItem ctxDelete = new JMenuItem("Delete");
        ctxStart.addActionListener(e  -> CompletableFuture.runAsync(() -> { try { startServer(); } catch(Exception x){ SwingUtilities.invokeLater(()->showError(x)); } }));
        ctxStop.addActionListener(e   -> CompletableFuture.runAsync(() -> { try { stopServer();  } catch(Exception x){ SwingUtilities.invokeLater(()->showError(x)); } }));
        ctxFolder.addActionListener(e -> CompletableFuture.runAsync(this::openServerFolder));
        ctxMods.addActionListener(e   -> openModManager());
        ctxDelete.addActionListener(e -> runAsyncUi(this::deleteServer));
        listCtx.add(ctxStart); listCtx.add(ctxStop); listCtx.addSeparator();
        listCtx.add(ctxFolder); listCtx.add(ctxMods); listCtx.addSeparator();
        listCtx.add(ctxDelete);
        serverList.setComponentPopupMenu(listCtx);

        JButton create = colorBtn("+ Install New Server", new Color(40, 110, 180), Color.WHITE);
        create.addActionListener(e -> runAsyncUi(() -> installServer(crackedToggle.isSelected())));
        left.add(create, BorderLayout.SOUTH);
        panel.add(left, BorderLayout.WEST);

        JPanel right = new JPanel(new BorderLayout(10, 10));

        JPanel config = new JPanel();
        config.setLayout(new BoxLayout(config, BoxLayout.Y_AXIS));
        config.setBorder(BorderFactory.createTitledBorder("Configuration"));
        
        // Add cracked toggle inside config so it's accessible
        crackedToggle.setFont(crackedToggle.getFont().deriveFont(Font.BOLD));
        crackedToggle.setToolTipText("Check before installing a new server if you want it cracked.");
        config.add(formRow("Install Setting", crackedToggle));

        config.add(formRow("Name", serverName));
        config.add(formRow("Version", versionBox));
        
        JPanel ramPanel = new JPanel(new BorderLayout(5, 5));
        ramPanel.add(ramSlider, BorderLayout.CENTER);
        ramPanel.add(ramLabel, BorderLayout.EAST);
        config.add(formRow("RAM Allocation", ramPanel));
        
        config.add(formRow("Server Port", serverPort));
        
        // Advanced Configuration
        JTabbedPane advancedTabs = new JTabbedPane();
        
        JPanel advOptions = new JPanel(new FlowLayout(FlowLayout.LEFT, 10, 5));
        advOptions.add(autoBackup);
        advOptions.add(new JLabel("Java Profile:"));
        advOptions.add(profileBox);
        advOptions.add(new JLabel("Auto-Backup (hours, 0=off):"));
        advOptions.add(backupInterval);
        advancedTabs.addTab("Settings", advOptions);

        JPanel webhookTab = new JPanel(new FlowLayout(FlowLayout.LEFT, 10, 5));
        webhookTab.add(new JLabel("Discord Webhook URL:"));
        webhookTab.add(webhookField);
        advancedTabs.addTab("Webhooks", webhookTab);

        config.add(advancedTabs);
        
        // Primary: Start / Stop
        JPanel primary = new JPanel(new FlowLayout(FlowLayout.LEFT, 6, 4));
        JButton startBtn = colorBtn("Start Server", new Color(34, 140, 60), Color.WHITE);
        JButton stopBtn  = colorBtn("Stop Server",  new Color(180, 40, 40), Color.WHITE);
        startBtn.addActionListener(e -> CompletableFuture.runAsync(() -> { try { startServer(); } catch(Exception x){ SwingUtilities.invokeLater(()->showError(x)); } }));
        stopBtn.addActionListener(e  -> CompletableFuture.runAsync(() -> { try { stopServer();  } catch(Exception x){ SwingUtilities.invokeLater(()->showError(x)); } }));
        primary.add(startBtn); primary.add(stopBtn);
        
        // Secondary: tools
        JPanel secondary = new JPanel(new FlowLayout(FlowLayout.LEFT, 5, 2));
        secondary.add(button("Updates",    this::checkUpdates));
        secondary.add(button("Folder",     this::openServerFolder));

        JButton modBtn = new JButton("Plugins & Mods");
        modBtn.addActionListener(e -> openModManager());
        secondary.add(modBtn);

        JButton propBtn = new JButton("Properties");
        propBtn.addActionListener(e -> openPropertiesEditor());
        secondary.add(propBtn);

        JButton backupBtn = new JButton("Backup...");
        backupBtn.addActionListener(e -> showBackupMenu(backupBtn));
        secondary.add(backupBtn);

        JButton delBtn = colorBtn("Delete", new Color(120, 30, 30), Color.WHITE);
        delBtn.addActionListener(e -> runAsyncUi(this::deleteServer));
        secondary.add(delBtn);

        JPanel actions = new JPanel();
        actions.setLayout(new BoxLayout(actions, BoxLayout.Y_AXIS));
        actions.add(primary); actions.add(secondary);
        config.add(actions);
        right.add(config, BorderLayout.NORTH);

        JPanel center = new JPanel(new BorderLayout(5, 5));
        
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
        center.add(room, BorderLayout.NORTH);

        JPanel consolePanel = new JPanel(new BorderLayout(5, 5));
        consolePanel.setBorder(BorderFactory.createTitledBorder("Console"));
        
        graphContainer.setPreferredSize(new Dimension(0, 60));
        consolePanel.add(graphContainer, BorderLayout.NORTH);

        console.setEditable(false);
        console.setBackground(CONSOLE_BG);
        console.setForeground(CONSOLE_FG);
        console.setFont(new Font(Font.MONOSPACED, Font.PLAIN, 13));
        console.setCaretColor(new Color(125, 211, 252));
        console.setMargin(new Insets(8, 10, 8, 10));
        JScrollPane consoleScroll = new JScrollPane(console);
        consoleScroll.setBorder(BorderFactory.createLineBorder(new Color(51, 65, 85)));
        consoleScroll.getViewport().setBackground(CONSOLE_BG);
        consolePanel.add(consoleScroll, BorderLayout.CENTER);

        // Console Toolbar (Search & Filter)
        JPanel consoleToolbar = new JPanel(new BorderLayout(5, 0));
        consoleInput.setFont(new Font(Font.MONOSPACED, Font.PLAIN, 13));
        consoleInput.setBackground(new Color(15, 23, 42));
        consoleInput.setForeground(CONSOLE_FG);
        consoleInput.setCaretColor(new Color(125, 211, 252));
        consoleInput.setBorder(BorderFactory.createCompoundBorder(
                BorderFactory.createLineBorder(new Color(51, 65, 85)),
                new EmptyBorder(5, 8, 5, 8)));
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
        
        JPanel filterPanel = new JPanel(new FlowLayout(FlowLayout.RIGHT, 5, 0));
        JTextField searchField = new JTextField(10);
        searchField.setToolTipText("Search console...");
        JCheckBox filterToggle = new JCheckBox("Filter Noise");
        searchField.addActionListener(e -> highlightSearch(searchField.getText()));
        filterToggle.addActionListener(e -> {
            String name = serverList.getSelectedValue();
            if (name != null) {
                applyConsoleFilter(name, filterToggle.isSelected());
            }
        });
        filterPanel.add(new JLabel("Search:"));
        filterPanel.add(searchField);
        filterPanel.add(filterToggle);
        
        consoleToolbar.add(consoleInput, BorderLayout.CENTER);
        consoleToolbar.add(filterPanel, BorderLayout.EAST);
        consolePanel.add(consoleToolbar, BorderLayout.SOUTH);
        
        // Player List Panel
        JList<String> playerList = new JList<>(playerModel);
        playerList.setPreferredSize(new Dimension(150, 0));
        playerList.setBorder(BorderFactory.createTitledBorder("Online Players"));
        JPopupMenu playerCtx = new JPopupMenu();
        JMenuItem kick = new JMenuItem("Kick");
        kick.addActionListener(e -> {
            String p = playerList.getSelectedValue();
            if (p != null) processManager.sendCommand(selectedServer(), "kick " + p);
        });
        playerCtx.add(kick);
        playerList.setComponentPopupMenu(playerCtx);
        
        center.add(consolePanel, BorderLayout.CENTER);
        center.add(new JScrollPane(playerList), BorderLayout.EAST);
        
        right.add(center, BorderLayout.CENTER);
        panel.add(right, BorderLayout.CENTER);
        return panel;
    }"""

new_content = content[:start_idx] + new_ui + content[end_idx:]

with open("src/main/java/org/localm/LocalMJava.java", "w", encoding="utf-8") as f:
    f.write(new_content)

print("Patched LocalMJava.java")