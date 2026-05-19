import React, { useEffect, useState } from "react";
import { Check, Wifi } from "lucide-react";

export default function JoinRoom() {
  const [code,       setCode]       = useState("");
  const [loading,    setLoading]    = useState(false);
  const [connected,  setConnected]  = useState(false);
  const [error,      setError]      = useState("");
  const [statusCode, setStatusCode] = useState("");
  const [localPort,  setLocalPort]  = useState(25565);

  useEffect(() => {
    const unsub = window.api.onRoomStatus((payload) => {
      if (payload.status === "connected") {
        setConnected(true);
        setError("");
        if (payload.localPort) setLocalPort(Number(payload.localPort));
      }
      if (payload.status === "error") {
        setConnected(false);
        setError(payload.error || "Relay server unreachable.");
      }
    });
    return unsub;
  }, []);

  const submit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    const normalized = code.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
    const res = await window.api.joinRoom(normalized);
    setLoading(false);
    if (!res.success) {
      setError(/room not found/i.test(res.error || "")
        ? "Room not found. Double-check the code."
        : res.error || "Relay server unreachable.");
      setConnected(false);
      return;
    }
    setConnected(true);
    setStatusCode(normalized);
    setLocalPort(Number(res.data?.localPort || 25565));
  };

  return (
    <div className="mx-auto max-w-md animate-fade-in">
      <div className="mb-6">
        <h1 className="font-pixel text-2xl text-accent">Join Room</h1>
        <p className="mt-1 text-sm text-text-muted">Enter a 6-character room code to join a friend's server</p>
      </div>

      <div className="rounded-xl border border-border bg-bg-card p-6 shadow-card">
        {!connected ? (
          <form onSubmit={submit} className="space-y-5">
            {/* Code input */}
            <div>
              <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-text-faint">
                Room Code
              </label>
              <div className="flex items-center justify-center gap-2">
                {/* 6 individual letter boxes */}
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    className={`flex h-12 w-10 items-center justify-center rounded-lg border font-pixel text-xl font-bold transition ${
                      code[i]
                        ? "border-accent/40 bg-accent/10 text-accent shadow-glow-green"
                        : "border-border bg-bg-input text-text-faint"
                    }`}
                  >
                    {code[i] || "·"}
                  </div>
                ))}
              </div>
              {/* Hidden real input behind the boxes */}
              <input
                value={code}
                onChange={(e) =>
                  setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))
                }
                maxLength={6}
                autoFocus
                placeholder=""
                className="mt-3 w-full rounded-lg border border-border bg-bg-input px-4 py-2.5 text-center font-mono text-sm tracking-widest text-text-primary placeholder:text-text-faint transition"
              />
            </div>

            {error && (
              <div className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2.5 text-sm text-danger">
                ⚠️ {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || code.length !== 6}
              className="w-full rounded-lg bg-accent/10 px-4 py-3 text-sm font-medium text-accent ring-1 ring-accent/30 transition hover:bg-accent hover:text-bg-primary hover:shadow-glow-green disabled:opacity-40"
            >
              {loading ? (
                <span className="inline-flex items-center gap-2 justify-center">
                  <span className="h-3.5 w-3.5 animate-spin rounded-sm border border-accent border-t-transparent" />
                  Connecting…
                </span>
              ) : (
                <span className="inline-flex items-center gap-2 justify-center">
                  <Wifi size={14} />
                  Join Room
                </span>
              )}
            </button>
          </form>
        ) : (
          <div className="space-y-4 animate-slide-up">
            {/* Success state */}
            <div className="flex items-center gap-3 rounded-lg border border-accent/30 bg-accent/5 p-4">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/20">
                <Check size={18} className="text-accent" />
              </div>
              <div>
                <div className="font-medium text-accent">Connected!</div>
                <div className="text-xs text-text-muted">Room {statusCode}</div>
              </div>
            </div>

            {/* Connection instructions */}
            <div className="rounded-lg border border-border bg-bg-panel p-4 space-y-2 text-sm">
              <div className="font-medium text-text-primary">Open Minecraft and connect to:</div>
              <div className="flex items-center gap-2 rounded bg-bg-input px-3 py-2 font-mono text-sm">
                <span className="text-diamond">localhost</span>
                <span className="text-text-faint">:</span>
                <span className="text-gold font-bold">{localPort}</span>
              </div>
            </div>

            {error && (
              <div className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2.5 text-sm text-danger">
                ⚠️ {error}
              </div>
            )}

            <button
              type="button"
              className="w-full rounded-lg bg-danger/10 px-4 py-2.5 text-sm font-medium text-danger ring-1 ring-danger/30 transition hover:bg-danger hover:text-white"
              onClick={async () => {
                await window.api.leaveRoom();
                setConnected(false);
                setStatusCode("");
                setCode("");
              }}
            >
              Leave Room
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
