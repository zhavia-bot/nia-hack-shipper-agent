"use client";

import { useState } from "react";

export function RunGenerationButton() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function trigger() {
    setBusy(true);
    setResult(null);
    try {
      const r = await fetch("/api/workflows/trigger", { method: "POST" });
      const body = await r.json();
      if (!r.ok) {
        setResult(`Failed: ${body.error ?? r.statusText}`);
      } else {
        setResult(`Started run ${body.runId ?? body.generation ?? "(ok)"}`);
      }
    } catch (err) {
      setResult(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
      <button
        type="button"
        onClick={trigger}
        disabled={busy}
        style={{
          fontSize: "0.85rem",
          fontWeight: 600,
          color: "#fff",
          background: busy ? "#666" : "#0e0e0e",
          border: "none",
          padding: "0.45rem 0.9rem",
          borderRadius: 8,
          cursor: busy ? "default" : "pointer",
        }}
      >
        {busy ? "Triggering…" : "Run a generation"}
      </button>
      {result && (
        <span style={{ fontSize: "0.78rem", color: "#555" }}>{result}</span>
      )}
    </div>
  );
}
