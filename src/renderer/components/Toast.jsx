import React from "react";
import { CheckCircle2, Info, X, XCircle } from "lucide-react";

const TOAST_TYPES = {
  success: {
    icon: CheckCircle2,
    border: "border-accent/30",
    bg: "bg-accent/10",
    text: "text-accent"
  },
  error: {
    icon: XCircle,
    border: "border-danger/30",
    bg: "bg-danger/10",
    text: "text-danger"
  },
  info: {
    icon: Info,
    border: "border-diamond/30",
    bg: "bg-diamond/10",
    text: "text-diamond"
  }
};

export default function Toast({ toasts, onClose }) {
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-full max-w-sm flex-col gap-2">
      {toasts.map((toast) => {
        const style = TOAST_TYPES[toast.type] || TOAST_TYPES.info;
        const Icon = style.icon;

        return (
          <div
            key={toast.id}
            className={`toast-slide-in pointer-events-auto rounded-xl border px-4 py-3 shadow-card ${style.border} ${style.bg}`}
          >
            <div className="flex items-start gap-3">
              <Icon size={16} className={`mt-0.5 shrink-0 ${style.text}`} />
              <div className="min-w-0 flex-1 text-sm text-text-primary">{toast.message}</div>
              <button
                type="button"
                onClick={() => onClose(toast.id)}
                className="rounded p-1 text-text-faint transition hover:bg-bg-hover hover:text-text-primary"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
