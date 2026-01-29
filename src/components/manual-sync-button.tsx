"use client";

import { useState } from "react";

type SyncState = "idle" | "loading" | "success" | "error";

export function ManualSyncButton() {
  const [status, setStatus] = useState<SyncState>("idle");

  const handleSync = async () => {
    setStatus("loading");
    try {
      const res = await fetch("/api/manual-sync", { method: "POST" });
      if (!res.ok) {
        setStatus("error");
        return;
      }
      setStatus("success");
      window.location.reload();
    } catch {
      setStatus("error");
    }
  };

  const label = status === "loading" ? "Sincronizando..." : "Sincronizar agora";

  return (
    <div>
      <button
        className="primary-button"
        type="button"
        onClick={handleSync}
        disabled={status === "loading"}
      >
        {label}
      </button>
      {status === "error" && (
        <div className="toolbar-status" role="status">
          Não foi possível sincronizar.
        </div>
      )}
    </div>
  );
}
