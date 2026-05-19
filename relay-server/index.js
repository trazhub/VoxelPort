import http from "node:http";
import crypto from "node:crypto";
import { WebSocketServer, WebSocket } from "ws";

const PORT = Number(process.env.PORT || 4000);
const RELAY_PATH = "/relay";
const ROOM_CODE_REGEX = /^[A-Z0-9]{6}$/;
const HEARTBEAT_MS = 30_000;
const PLAYER_PAIR_TIMEOUT_MS = 15_000;
const RATE_WINDOW_MS = 60_000;
const MAX_CREATES_PER_WINDOW = 5;
const MAX_JOINS_PER_WINDOW = 30;

const rooms = new Map();
const pendingPairs = new Map();

/** @type {Map<string, {creates: number[], joins: number[]}>} */
const rateLimits = new Map();

function getRateEntry(ip) {
  if (!rateLimits.has(ip)) rateLimits.set(ip, { creates: [], joins: [] });
  return rateLimits.get(ip);
}

function isRateLimited(ip, action) {
  const entry = getRateEntry(ip);
  const now = Date.now();
  entry[action] = entry[action].filter((t) => now - t < RATE_WINDOW_MS);
  const limit = action === "creates" ? MAX_CREATES_PER_WINDOW : MAX_JOINS_PER_WINDOW;
  if (entry[action].length >= limit) return true;
  entry[action].push(now);
  return false;
}

setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimits.entries()) {
    entry.creates = entry.creates.filter((t) => now - t < RATE_WINDOW_MS);
    entry.joins = entry.joins.filter((t) => now - t < RATE_WINDOW_MS);
    if (entry.creates.length === 0 && entry.joins.length === 0) rateLimits.delete(ip);
  }
}, RATE_WINDOW_MS);

function log(message, extra = "") {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}${extra ? ` ${extra}` : ""}`);
}

function safeSendJson(socket, payload) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  try {
    socket.send(JSON.stringify(payload));
  } catch (error) {
    log("Failed to send payload:", String(error?.message || error));
  }
}

function safeSendBinary(socket, payload) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  try {
    socket.send(payload, { binary: true });
  } catch (error) {
    log("Failed to forward binary payload:", String(error?.message || error));
  }
}

function safeClose(socket, code = 1000, reason = "closing") {
  if (!socket) return;
  if (socket.readyState === WebSocket.CLOSING || socket.readyState === WebSocket.CLOSED) return;
  try {
    socket.close(code, reason);
  } catch {
    try {
      socket.terminate();
    } catch {}
  }
}

function generateRoomCode() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  do {
    code = Array.from(crypto.randomBytes(6), (n) => chars[n % chars.length]).join("");
  } while (rooms.has(code));
  return code;
}

function clearBridgeState(socket) {
  if (!socket) return;
  socket.peer = null;
  socket.mode = "json";
}

function cleanupPlayer(roomCode, playerId, reason = "disconnected") {
  const room = rooms.get(roomCode);
  if (!room) return;
  const player = room.players.get(playerId);
  if (!player) return;

  room.players.delete(playerId);
  pendingPairs.delete(`${roomCode}:${playerId}`);

  clearBridgeState(player.playerSocket);
  clearBridgeState(player.hostBridgeSocket);

  safeClose(player.playerSocket, 1000, reason);
  safeClose(player.hostBridgeSocket, 1000, reason);

  if (room.hostControl && room.hostControl.readyState === WebSocket.OPEN) {
    safeSendJson(room.hostControl, {
      type: "player-left",
      playerId,
      playerCount: room.players.size,
      reason
    });
  }

  log(`Player ${playerId} left room ${roomCode}.`, `count=${room.players.size}`);
}

function cleanupRoom(code) {
  const room = rooms.get(code);
  if (!room) return;

  for (const [playerId] of room.players) {
    cleanupPlayer(code, playerId, "room-closed");
  }

  safeClose(room.hostControl, 1000, "room-closed");
  rooms.delete(code);
  log(`Room ${code} removed.`);
}

function wireBridge(playerSocket, hostBridgeSocket) {
  playerSocket.mode = "raw";
  hostBridgeSocket.mode = "raw";
  playerSocket.peer = hostBridgeSocket;
  hostBridgeSocket.peer = playerSocket;
}

function handleCreate(socket) {
  if (socket.role) {
    safeSendJson(socket, { error: "Handshake already completed" });
    safeClose(socket, 1008, "handshake-complete");
    return;
  }

  const ip = socket.remoteAddress || "unknown";
  if (isRateLimited(ip, "creates")) {
    safeSendJson(socket, { error: "Rate limit exceeded. Try again later." });
    safeClose(socket, 1008, "rate-limited");
    return;
  }

  const code = generateRoomCode();
  socket.role = "host-control";
  socket.roomCode = code;

  rooms.set(code, {
    code,
    hostControl: socket,
    players: new Map()
  });

  safeSendJson(socket, { code });
  log(`Room created: ${code}`);
}

function handleJoin(socket, payload) {
  const code = String(payload?.code || "").toUpperCase();
  if (!ROOM_CODE_REGEX.test(code)) {
    safeSendJson(socket, { error: "Room not found" });
    safeClose(socket, 1008, "invalid-room");
    return;
  }

  const ip = socket.remoteAddress || "unknown";
  if (isRateLimited(ip, "joins")) {
    safeSendJson(socket, { error: "Rate limit exceeded. Try again later." });
    safeClose(socket, 1008, "rate-limited");
    return;
  }

  const room = rooms.get(code);
  if (!room || !room.hostControl || room.hostControl.readyState !== WebSocket.OPEN) {
    safeSendJson(socket, { error: "Room not found" });
    safeClose(socket, 1008, "room-not-found");
    return;
  }

  const playerId = crypto.randomUUID();
  socket.role = "player";
  socket.roomCode = code;
  socket.playerId = playerId;

  room.players.set(playerId, {
    playerSocket: socket,
    hostBridgeSocket: null
  });
  pendingPairs.set(`${code}:${playerId}`, Date.now());

  safeSendJson(socket, { status: "joining", playerId });
  safeSendJson(room.hostControl, {
    type: "player-join-request",
    playerId,
    playerCount: room.players.size
  });

  setTimeout(() => {
    if (!pendingPairs.has(`${code}:${playerId}`)) return;
    safeSendJson(socket, { error: "Host did not accept connection in time" });
    cleanupPlayer(code, playerId, "pair-timeout");
  }, PLAYER_PAIR_TIMEOUT_MS);

  log(`Join requested: room=${code} player=${playerId}`);
}

function handleHostPair(socket, payload) {
  const code = String(payload?.code || "").toUpperCase();
  const playerId = String(payload?.playerId || "");

  if (!ROOM_CODE_REGEX.test(code) || !playerId) {
    safeSendJson(socket, { error: "Invalid pair request" });
    safeClose(socket, 1008, "invalid-pair");
    return;
  }

  const room = rooms.get(code);
  if (!room || room.hostControl?.readyState !== WebSocket.OPEN) {
    safeSendJson(socket, { error: "Room not found" });
    safeClose(socket, 1008, "room-not-found");
    return;
  }

  const player = room.players.get(playerId);
  if (!player || player.playerSocket.readyState !== WebSocket.OPEN) {
    safeSendJson(socket, { error: "Player not found" });
    safeClose(socket, 1008, "player-not-found");
    return;
  }

  player.hostBridgeSocket = socket;
  socket.role = "host-bridge";
  socket.roomCode = code;
  socket.playerId = playerId;
  pendingPairs.delete(`${code}:${playerId}`);

  wireBridge(player.playerSocket, socket);

  safeSendJson(socket, { status: "paired", playerId });
  safeSendJson(player.playerSocket, { status: "paired", playerId });
  safeSendJson(room.hostControl, {
    type: "player-joined",
    playerId,
    playerCount: room.players.size
  });
  log(`Paired room=${code} player=${playerId}`);
}

function handleJsonMessage(socket, payload) {
  const type = String(payload?.type || "");

  if (type === "create") {
    handleCreate(socket);
    return;
  }

  if (type === "join") {
    handleJoin(socket, payload);
    return;
  }

  if (type === "host-pair") {
    handleHostPair(socket, payload);
    return;
  }

  safeSendJson(socket, { error: "Unknown type" });
  safeClose(socket, 1008, "unknown-type");
}

function handleSocketClose(socket) {
  if (socket.role === "host-control" && socket.roomCode) {
    log(`Host disconnected for room ${socket.roomCode}.`);
    cleanupRoom(socket.roomCode);
    return;
  }

  if ((socket.role === "player" || socket.role === "host-bridge") && socket.roomCode && socket.playerId) {
    cleanupPlayer(socket.roomCode, socket.playerId, `${socket.role}-disconnect`);
  }
}

function setupSocket(socket) {
  socket.mode = "json";
  socket.isAlive = true;

  socket.on("pong", () => {
    socket.isAlive = true;
  });

  socket.on("message", (data, isBinary) => {
    if (socket.mode === "raw") {
      if (!isBinary) return;
      safeSendBinary(socket.peer, data);
      return;
    }

    if (isBinary) {
      safeSendJson(socket, { error: "Binary payload not allowed during handshake" });
      safeClose(socket, 1008, "unexpected-binary");
      return;
    }

    let payload;
    try {
      payload = JSON.parse(data.toString("utf8"));
    } catch {
      safeSendJson(socket, { error: "Invalid JSON" });
      safeClose(socket, 1008, "invalid-json");
      return;
    }

    try {
      handleJsonMessage(socket, payload);
    } catch (error) {
      log("Unhandled request error:", String(error?.message || error));
      safeSendJson(socket, { error: "Internal server error" });
      safeClose(socket, 1011, "internal-error");
    }
  });

  socket.on("close", () => handleSocketClose(socket));
  socket.on("error", (error) => {
    log("Socket error:", String(error?.message || error));
  });
}

const server = http.createServer((req, res) => {
  if (req.url === "/" || req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    res.end(
      JSON.stringify({
        ok: true,
        service: "voxelport-relay",
        rooms: rooms.size
      })
    );
    return;
  }

  res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
  res.end("Not found");
});

const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (req, socket, head) => {
  const { pathname } = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  if (pathname !== RELAY_PATH) {
    socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
    socket.destroy();
    return;
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    ws.remoteAddress = req.socket.remoteAddress || "unknown";
    log(`Client connected from ${req.socket.remoteAddress}:${req.socket.remotePort}`);
    setupSocket(ws);
  });
});

server.on("error", (error) => {
  log("Relay server fatal error:", String(error?.message || error));
});

const heartbeat = setInterval(() => {
  for (const client of wss.clients) {
    if (client.isAlive === false) {
      safeClose(client, 1001, "heartbeat-timeout");
      continue;
    }
    client.isAlive = false;
    try {
      client.ping();
    } catch {}
  }
}, HEARTBEAT_MS);

wss.on("close", () => clearInterval(heartbeat));

server.listen(PORT, () => {
  log(`Relay server listening on http://0.0.0.0:${PORT}${RELAY_PATH}`);
});
