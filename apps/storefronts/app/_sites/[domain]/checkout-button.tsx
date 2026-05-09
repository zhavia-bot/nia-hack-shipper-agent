"use client";

import { useState } from "react";

export function CheckoutButton({ subdomain }: { subdomain: string }) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function go() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ subdomain }),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`checkout failed (${res.status}): ${txt}`);
      }
      const { url } = (await res.json()) as { url?: string };
      if (!url) throw new Error("no checkout url");
      window.location.assign(url);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={go}
        disabled={loading}
        style={{
          padding: "0.75rem 1.25rem",
          fontSize: "1rem",
          fontWeight: 600,
          background: "#111",
          color: "#fff",
          border: "none",
          borderRadius: 8,
          cursor: loading ? "default" : "pointer",
          opacity: loading ? 0.7 : 1,
        }}
      >
        {loading ? "Redirecting…" : "Buy now"}
      </button>
      {err && (
        <p style={{ color: "#b00", marginTop: "0.5rem", fontSize: "0.9rem" }}>
          {err}
        </p>
      )}
    </>
  );
}
