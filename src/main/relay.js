import net from "node:net";
import { EventEmitter } from "node:events";
import WebSocket from "ws";

const ROOM_CODE_REGEX = /^[A-Z0-9]{6}$/;
const DEFAULT_JOIN_PORT = 25565;
const MAX_JOIN_PORT_OFFSET = 20;

function stripLineFeed(value) {
  return String(value || "").replace(/[\r\n]/g, "");
}

function connectSocket(host, port) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port }, () => resolve(socket));
    socket.once("error", reject);
  });
}

function listenServer(server, port) {
  return new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.off("error", onError);
      resolve();
    };

    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, "127.0.0.1");
  });
}

async function createProxyServer(startPort = DEFAULT_JOIN_PORT) {
  for (let offset = 0; offset <= MAX_JOIN_PORT_OFFSET; offset += 1) {
    const port = startPort + offset;
    const server = net.createServer();

    try {
      await listenServer(server, port);
      return { server, port };
    } catch (error) {
      server.removeAllListeners();
      if (!["EADDRINUSE", "EACCES"].includes(error?.code)) {
        throw error;
      }
    }
  }

  throw new Error(
    `No free local port available between ${startPort} and ${startPort + MAX_JOIN_PORT_OFFSET}`
  );
}

function connectRelaySocket(relayUrl) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(relayUrl);

    const cleanup = () => {
      socket.off("open", onOpen);
      socket.off("error", onError);
    };

    const onOpen = () => {
      cleanup();
      resolve(socket);
    };

    const onError = (error) => {
      cleanup();
      reject(error);
    };

    socket.once("open", onOpen);
    socket.once("error", onError);
  });
}

function sendJson(socket, payload) {
  socket.send(JSON.stringify(payload));
}

function closeWebSocket(socket) {
  if (!socket) return;
  if (socket.readyState === WebSocket.CLOSING || socket.readyState === WebSocket.CLOSED) return;
  try {
    socket.close();
  } catch {
    try {
      socket.terminate();
    } catch {}
  }
}

export class RelayClient extends EventEmitter {
  constructor(relayUrl) {
    super();
    this.relayUrl = relayUrl;

    this.hostControlSocket = null;
    this.localMinecraftPort = null;
    this.roomCode = null;
    this.playerCount = 0;
    this.hostBridges = new Map();

    this.localProxyServer = null;
    this.localProxySockets = new Set();
  }

  async createRoom(localMinecraftPort) {
    await this.leaveRoom();
    this.closeRoom();
    this.localMinecraftPort = Number(localMinecraftPort);

    const socket = await connectRelaySocket(this.relayUrl);
    const code = await this.sendAndWait(socket, { type: "create" }, (payload) => Boolean(payload?.code));
    this.hostControlSocket = socket;
    this.setupControlProtocol(socket);
    this.roomCode = String(code.code || "").toUpperCase();
    this.playerCount = 0;
    return { code: this.roomCode };
  }

  async joinRoom(code) {
    const normalizedCode = stripLineFeed(code).toUpperCase();
    if (!ROOM_CODE_REGEX.test(normalizedCode)) {
      throw new Error("Invalid room code");
    }

    this.closeRoom();
    await this.leaveRoom();

    const { server, port } = await createProxyServer(DEFAULT_JOIN_PORT);
    this.localProxyServer = server;
    this.localProxyServer.on("connection", (localSocket) => {
      this.proxyLocalPlayer(localSocket, normalizedCode).catch((error) => {
        localSocket.destroy();
        this.emit("error", error);
      });
    });

    this.roomCode = normalizedCode;
    this.emit("connected", { code: normalizedCode, localPort: port });
    return { localPort: port };
  }

  async proxyLocalPlayer(localSocket, code) {
    this.localProxySockets.add(localSocket);
    const relaySocket = await connectRelaySocket(this.relayUrl);
    relaySocket.binaryType = "nodebuffer";
    localSocket.setNoDelay(true);
    const pendingChunks = [];
    let relayReady = false;

    let cleanedUp = false;
    const cleanup = () => {
      if (cleanedUp) return;
      cleanedUp = true;
      this.localProxySockets.delete(localSocket);
      closeWebSocket(relaySocket);
      localSocket.destroy();
    };

    relaySocket.on("error", (error) => {
      this.emit("error", error);
      cleanup();
    });
    relaySocket.on("close", cleanup);
    localSocket.on("error", cleanup);
    localSocket.on("close", cleanup);

    relaySocket.on("message", (data, isBinary) => {
      if (!isBinary) {
        try {
          const payload = JSON.parse(data.toString("utf8"));
          if (payload.status === "paired") {
            relayReady = true;
            while (pendingChunks.length > 0 && relaySocket.readyState === WebSocket.OPEN) {
              relaySocket.send(pendingChunks.shift(), { binary: true });
            }
            return;
          }
          if (payload.error) {
            this.emit("error", new Error(payload.error));
            cleanup();
          }
        } catch {
          this.emit("error", new Error("Invalid relay response"));
          cleanup();
        }
        return;
      }

      localSocket.write(data);
    });

    const joinResult = await this.sendAndWait(
      relaySocket,
      { type: "join", code },
      (payload) => payload?.status === "joining"
    );

    localSocket.on("data", (chunk) => {
      if (!relayReady) {
        pendingChunks.push(Buffer.from(chunk));
        return;
      }
      if (relaySocket.readyState === WebSocket.OPEN) {
        relaySocket.send(chunk, { binary: true });
      }
    });

    return joinResult;
  }

  setupControlProtocol(socket) {
    socket.on("message", (data, isBinary) => {
      if (isBinary) return;

      let payload;
      try {
        payload = JSON.parse(data.toString("utf8"));
      } catch {
        this.emit("error", new Error("Invalid relay control payload"));
        return;
      }

      this.handleControlMessage(payload);
    });

    socket.on("close", () => {
      this.emit("room-closed");
      this.roomCode = null;
      this.playerCount = 0;
      this.hostControlSocket = null;
    });

    socket.on("error", (error) => this.emit("error", error));
  }

  async handleControlMessage(payload) {
    if (payload.type === "player-join-request") {
      try {
        await this.createBridgeForPlayer(payload.playerId);
      } catch (error) {
        this.emit("error", error);
      }
      return;
    }

    if (payload.type === "player-joined") {
      this.playerCount = Number(payload.playerCount || this.playerCount);
      this.emit("player-joined", { playerCount: this.playerCount, playerId: payload.playerId });
      return;
    }

    if (payload.type === "player-left") {
      this.playerCount = Number(payload.playerCount || 0);
      this.emit("player-left", { playerCount: this.playerCount, playerId: payload.playerId });
      return;
    }

    if (payload.error) {
      this.emit("error", new Error(payload.error));
    }
  }

  async createBridgeForPlayer(playerId) {
    if (!this.roomCode || !this.localMinecraftPort) return;

    const relaySocket = await connectRelaySocket(this.relayUrl);
    relaySocket.binaryType = "nodebuffer";
    const localSocket = await connectSocket("127.0.0.1", this.localMinecraftPort);
    localSocket.setNoDelay(true);
    const pendingChunks = [];
    let relayReady = false;

    let cleanedUp = false;
    const cleanup = () => {
      if (cleanedUp) return;
      cleanedUp = true;
      const pair = this.hostBridges.get(playerId);
      if (pair) this.hostBridges.delete(playerId);
      closeWebSocket(relaySocket);
      localSocket.destroy();
    };

    this.hostBridges.set(playerId, { relaySocket, localSocket });

    relaySocket.on("error", (error) => {
      this.emit("error", error);
      cleanup();
    });
    relaySocket.on("close", cleanup);
    localSocket.on("error", cleanup);
    localSocket.on("close", cleanup);

    relaySocket.on("message", (data, isBinary) => {
      if (!isBinary) {
        try {
          const payload = JSON.parse(data.toString("utf8"));
          if (payload.status === "paired") {
            relayReady = true;
            while (pendingChunks.length > 0 && relaySocket.readyState === WebSocket.OPEN) {
              relaySocket.send(pendingChunks.shift(), { binary: true });
            }
            return;
          }
          if (payload.error) {
            this.emit("error", new Error(payload.error));
            cleanup();
          }
        } catch {
          this.emit("error", new Error("Invalid relay bridge payload"));
          cleanup();
        }
        return;
      }

      localSocket.write(data);
    });

    await this.sendAndWait(
      relaySocket,
      { type: "host-pair", code: this.roomCode, playerId },
      (payload) => payload?.status === "paired"
    );

    localSocket.on("data", (chunk) => {
      if (!relayReady) {
        pendingChunks.push(Buffer.from(chunk));
        return;
      }
      if (relaySocket.readyState === WebSocket.OPEN) {
        relaySocket.send(chunk, { binary: true });
      }
    });
  }

  sendAndWait(socket, payload, predicate, timeoutMs = 15_000) {
    return new Promise((resolve, reject) => {
      let timer = null;

      const cleanup = () => {
        if (timer) clearTimeout(timer);
        timer = null;
        socket.off("message", onMessage);
        socket.off("error", onError);
        socket.off("close", onClose);
      };

      const onMessage = (data, isBinary) => {
        if (isBinary) return;

        let parsed;
        try {
          parsed = JSON.parse(data.toString("utf8"));
        } catch (error) {
          cleanup();
          reject(error);
          return;
        }

        if (parsed.error) {
          cleanup();
          reject(new Error(parsed.error));
          return;
        }

        if (predicate(parsed)) {
          cleanup();
          resolve(parsed);
        }
      };

      const onError = (error) => {
        cleanup();
        reject(error);
      };

      const onClose = () => {
        cleanup();
        reject(new Error("Relay connection closed"));
      };

      timer = setTimeout(() => {
        cleanup();
        reject(new Error(`Relay handshake timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      socket.on("message", onMessage);
      socket.on("error", onError);
      socket.on("close", onClose);
      sendJson(socket, payload);
    });
  }

  closeRoom() {
    for (const pair of this.hostBridges.values()) {
      closeWebSocket(pair.relaySocket);
      pair.localSocket.destroy();
    }
    this.hostBridges.clear();

    if (this.hostControlSocket) {
      closeWebSocket(this.hostControlSocket);
      this.hostControlSocket = null;
    }

    this.roomCode = null;
    this.playerCount = 0;
  }

  async leaveRoom() {
    for (const socket of this.localProxySockets) {
      socket.destroy();
    }
    this.localProxySockets.clear();

    if (this.localProxyServer) {
      await new Promise((resolve) => this.localProxyServer.close(() => resolve()));
      this.localProxyServer = null;
    }

    this.emit("disconnected");
  }

  getPlayerCount() {
    return this.playerCount;
  }
}

export default RelayClient;
