import React, { useEffect, useState } from "react";

export default function InputModal({
  open,
  title,
  placeholder = "",
  initialValue = "",
  confirmLabel = "Save",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel
}) {
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    if (open) setValue(initialValue);
  }, [open, initialValue]);

  useEffect(() => {
    if (!open) return undefined;

    const onKeyDown = (event) => {
      if (event.key === "Escape") onCancel?.();
      if (event.key === "Enter") onConfirm?.(value);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onCancel, onConfirm, value]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <button
        type="button"
        aria-label="Close modal"
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onCancel}
      />
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-border bg-bg-card p-6 shadow-card">
        <h2 className="text-lg font-semibold text-text-primary">{title}</h2>
        <input
          autoFocus
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={placeholder}
          className="mt-4 w-full rounded-lg border border-border bg-bg-input px-3 py-2 text-sm text-text-primary"
        />
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-border px-4 py-2 text-sm text-text-muted transition hover:bg-bg-hover hover:text-text-primary"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={() => onConfirm?.(value)}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-bg-primary"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
