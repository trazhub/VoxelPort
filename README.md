# VoxelPort

VoxelPort is an Electron + React desktop application for creating, running, managing, and sharing Minecraft Java servers through relay room codes.

## Features

- Install Paper, Purpur, Vanilla, Fabric, Forge, and NeoForge servers
- Start and stop servers, view console output, send commands, and inspect runtime stats
- Browse and install mods/plugins from Modrinth and Hangar
- Create relay rooms and let others join via 6-character room codes
- Manage installed mods/plugins and check for updates

## Relay Server

VoxelPort does not assume a public relay anymore. Set your own relay URL in Settings, for example:

`wss://your-relay.example.com`

If you enter only the host, VoxelPort automatically uses the `/relay` WebSocket path.

## Expected Latency

Latency depends on where your VPS is hosted relative to both the host machine and players.
For the host machine, Ethernet is strongly recommended over WiFi.

## Development Setup

1. Install dependencies:

```bash
npm install
```

2. Start the relay server locally in one terminal:

```bash
npm run relay:dev
```

3. Start the desktop app in another terminal:

```bash
npm run dev
```

## Build for Production

```bash
npm run build
```

Build artifacts are written to `dist-electron/`.

## Relay Server Deployment

### Docker

```bash
cd relay-server
docker build -t minecraft-relay .
docker run -d --name minecraft-relay -p 4000:4000 minecraft-relay
```

### Manual Node.js

```bash
cd relay-server
node index.js
```

The relay listens on TCP port `4000`.

## Self-Hosting the Relay

Run the relay server on a VPS near your players:

1. Deploy the contents of `relay-server/` on a VPS near your players.
2. Expose TCP port `4000` behind HTTPS/WSS using a reverse proxy such as Nginx or Caddy.
3. Point VoxelPort Settings to your relay URL, for example:

```text
wss://your-relay.example.com
```

4. Use a valid TLS certificate for public relays.

## Security Fixes Applied

- Path traversal protection for mod/plugin install filenames
- Path traversal validation for mod removal paths
- External URL validation in `open-external`
- Strict validation and sanitization for `add-server` IPC input
- Server port validation before relay room creation
- NeoForge host whitelist entries added for installer and mod manager

## How to Add and Start a Server

1. Open **Install Server** in the sidebar.
2. Choose a server type and version.
3. Configure name, path, port, RAM, and EULA acceptance.
4. Complete install.
5. In **Servers**, click **Start**.

## How to Install Mods and Plugins

1. Open **Mods & Plugins**.
2. Select a server.
3. Use the **Browse** tab to search and install.
4. Use the **Installed** tab to update or remove entries.

## How to Create and Join Rooms

### Create Room

1. Start the server.
2. On the server card, click **Share Room**.
3. Share the 6-character room code.

### Join Room

1. Open **Join Room**.
2. Enter the room code.
3. After success, connect in Minecraft to:

`localhost:25565`

## Known Limitations

- Public relay performance depends on your VPS location and the host machine network quality

## Troubleshooting

### Java not found

- Use **Settings -> Auto-detect Java**
- Install Java from `https://adoptium.net`

### Room not found or relay unreachable

- Verify the relay URL in Settings
- Verify your VPS reverse proxy and relay process are up
- Confirm the room code is exactly 6 uppercase alphanumeric characters

### Port in use

- The installer can suggest the next free port
- Change the port in the install configuration

### Forge or NeoForge install fails

- Check installer output in Install Step 4
- Validate selected build/version and Java compatibility

### Mod install fails

- Verify source and compatibility
- Retry; partial downloads are cleaned automatically
