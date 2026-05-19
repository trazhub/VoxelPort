import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Radio, Users } from "lucide-react";
import RoomCode from "../components/RoomCode.jsx";
import { useAppContext, useToast } from "../App.jsx";

export default function CreateRoom() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { servers } = useAppContext();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [code, setCode] = useState("");
  const [playerCount, setPlayerCount] = useState(0);
  const [status, setStatus] = useState("connecting");
  const [confirmClose, setConfirmClose] = useState(false);

  const serverId = params.get("serverId");
  const server = useMemo(
    () => servers.find((item) => item.id === serverId) || servers[0] || null,
    [servers, serverId]
  );

  useEffect(() => {
    const unsub = window.api.onRoomStatus((payload) => {
      if (payload.code) setCode(String(payload.code).toUpperCase());
      setPlayerCount(Number(payload.playerCount || 0));
      setStatus(payload.status || "active");
      if (payload.error) setError(payload.error);
    });
    return unsub;
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!server) {
        setError("No running server available.");
        setLoading(false);
        return;
      }
      const res = await window.api.createRoom(server.port);
      if (!mounted) return;
      if (res.success) {
        setCode(res.data?.code || "");
        setStatus("active");
      } else {
        setError(res.error || "Failed to create room.");
      }
      setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, [server?.id]);

  return (
    <div className="mx-auto max-w-lg animate-fade-in">
      <div className="mb-6 flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate("/")}
          className="rounded-lg p-1.5 text-text-faint transition hover:bg-bg-hover hover:text-text-primary"
        >
          <ArrowLeft size={16} />
        </button>
        <div>
          <h1 className="font-pixel text-xl text-accent">Create Room</h1>
          {server && (
            <p className="mt-0.5 text-xs text-text-muted">
              Sharing {server.name || server.id} on port {server.port}
            </p>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-bg-panel py-16">
          <div className="mb-4 h-6 w-6 animate-spin rounded-sm border-2 border-accent border-t-transparent" />
          <p className="text-sm text-text-muted">Creating room...</p>
        </div>
      ) : error ? (
        <div className="rounded-xl border border-danger/30 bg-danger/5 p-6">
          <p className="mb-4 text-sm text-danger">Warning: {error}</p>
          <button
            type="button"
            className="rounded-lg border border-border px-4 py-2 text-sm text-text-muted transition hover:bg-bg-hover"
            onClick={() => navigate("/")}
          >
            Back to Servers
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <RoomCode code={code} />

          <div className="rounded-xl border border-border bg-bg-card p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm">
                <Radio size={14} className="animate-pulse text-accent" />
                <span className="capitalize text-text-muted">{status}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Users size={14} className="text-diamond" />
                <span className="font-medium text-text-primary">{playerCount}</span>
                <span className="text-text-muted">connected</span>
              </div>
            </div>
          </div>

          <div className="space-y-1.5 rounded-xl border border-border bg-bg-panel p-4 text-sm text-text-muted">
            <div className="mb-2 font-medium text-text-primary">How to share</div>
            <div className="flex gap-2"><span className="font-bold text-accent">1.</span> Share the room code above with your friends</div>
            <div className="flex gap-2"><span className="font-bold text-accent">2.</span> They open VoxelPort, go to Join Room, and enter the code</div>
            <div className="flex gap-2"><span className="font-bold text-accent">3.</span> They connect to <code className="rounded bg-bg-primary px-1.5 py-0.5 text-xs text-diamond">localhost</code> in Minecraft</div>
          </div>

          {confirmClose && (
            <div className="rounded-xl border border-danger/30 bg-danger/10 p-4 text-sm">
              <div className="font-medium text-danger">Close the room for all connected players?</div>
              <div className="mt-1 text-text-muted">Connected players will be disconnected immediately.</div>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    await window.api.closeRoom();
                    showToast("Room closed.", "success");
                    navigate("/");
                  }}
                  className="rounded-lg bg-danger px-4 py-2 text-xs font-medium text-white"
                >
                  Close Room
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmClose(false)}
                  className="rounded-lg border border-border px-4 py-2 text-xs text-text-muted transition hover:bg-bg-hover hover:text-text-primary"
                >
                  Keep Room Open
                </button>
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setConfirmClose(true)}
              className="flex-1 rounded-lg bg-danger/10 px-4 py-2.5 text-sm font-medium text-danger ring-1 ring-danger/30 transition hover:bg-danger hover:text-white"
            >
              Close Room
            </button>
            <button
              type="button"
              className="rounded-lg border border-border px-4 py-2.5 text-sm text-text-muted transition hover:bg-bg-hover hover:text-text-primary"
              onClick={() => navigate("/")}
            >
              Back
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
