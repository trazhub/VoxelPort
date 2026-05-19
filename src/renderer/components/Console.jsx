import React, { useEffect, useMemo, useRef, useState } from "react";
import { Send, Trash2 } from "lucide-react";

function colorizeConsoleLine(line) {
  if (/\b(error|exception|failed|fatal|crash)\b/i.test(line))  return "console-error";
  if (/\b(warn|warning)\b/i.test(line))                         return "console-warn";
  if (/\b(info|done|started|loaded)\b/i.test(line))            return "console-info";
  if (/\b(joined|left|saved|stopped|starting)\b/i.test(line))  return "console-ok";
  return "text-text-muted";
}

export default function Console({ lines = [], onSendCommand, onClear }) {
  const [command, setCommand] = useState("");
  const [history, setHistory] = useState([]);
  const [histIdx, setHistIdx] = useState(-1);
  const viewRef  = useRef(null);
  const inputRef = useRef(null);

  const cappedLines = useMemo(() => lines.slice(-500), [lines]);

  useEffect(() => {
    if (viewRef.current) viewRef.current.scrollTop = viewRef.current.scrollHeight;
  }, [cappedLines]);

  const submit = async (e) => {
    e.preventDefault();
    const cleaned = command.trim();
    if (!cleaned) return;
    setHistory((h) => [cleaned, ...h].slice(0, 50));
    setHistIdx(-1);
    await onSendCommand?.(cleaned);
    setCommand("");
  };

  const handleKeyDown = (e) => {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      const next = Math.min(histIdx + 1, history.length - 1);
      setHistIdx(next);
      setCommand(history[next] ?? "");
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = histIdx - 1;
      if (next < 0) { setHistIdx(-1); setCommand(""); }
      else { setHistIdx(next); setCommand(history[next] ?? ""); }
    }
  };

  return (
    <div className="flex flex-col">
      {/* Output */}
      <div
        ref={viewRef}
        className="h-44 overflow-y-auto p-3 font-mono text-[11px] leading-relaxed"
        onClick={() => inputRef.current?.focus()}
      >
        {cappedLines.length === 0 ? (
          <div className="text-text-faint italic">Waiting for server output…</div>
        ) : (
          cappedLines.map((line, idx) => (
            <div
              key={`${idx}-${line.slice(0, 16)}`}
              className={`whitespace-pre-wrap break-all ${colorizeConsoleLine(line)}`}
            >
              {line}
            </div>
          ))
        )}
        {/* Blinking cursor */}
        <span className="inline-block h-3 w-1.5 translate-y-0.5 bg-accent animate-pixel-blink" />
      </div>

      {/* Command Input */}
      <form className="flex items-center gap-2 border-t border-border bg-bg-panel/30 px-2 py-1.5" onSubmit={submit}>
        <button
          type="button"
          onClick={onClear}
          title="Clear console"
          className="flex items-center rounded px-1.5 py-0.5 text-[10px] text-text-faint transition hover:bg-danger/10 hover:text-danger"
        >
          <Trash2 size={10} />
        </button>
        <span className="font-mono text-xs text-accent select-none">&gt;</span>
        <input
          ref={inputRef}
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          onKeyDown={handleKeyDown}
          className="flex-1 bg-transparent font-mono text-xs text-text-primary outline-none placeholder:text-text-faint"
          placeholder="say Hello, world!"
        />
        <button
          type="submit"
          disabled={!command.trim()}
          className="flex items-center gap-1 rounded-lg bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent ring-1 ring-accent/20 transition hover:bg-accent hover:text-bg-primary disabled:opacity-40"
        >
          <Send size={11} />
        </button>
      </form>
    </div>
  );
}
