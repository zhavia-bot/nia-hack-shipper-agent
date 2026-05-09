"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@autoresearch/convex/api";
import { fmtRelativeTime } from "@/lib/format";

/**
 * Operator panel: every tenant the current user owns, with kill +
 * force-refund buttons for the live ones. Convex `tenants.mine`
 * resolves identity via Clerk; the action endpoints
 * (`/api/operator/cancel`, `/api/operator/force-refund`) re-check
 * ownership server-side, so a stale page can't escalate.
 *
 * Force-refund is destructive — confirm() before firing. We also
 * disable the button while the request is in flight to keep the
 * audit log tidy (server is idempotent regardless).
 */
export function TenantsPanel() {
  const tenants = useQuery(api.tenants.mine, {});

  return (
    <section
      style={{
        background: "#fff",
        border: "1px solid #e8e6e1",
        borderRadius: 12,
        padding: "1.25rem 1.5rem",
      }}
    >
      <div
        style={{
          fontSize: "0.78rem",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          color: "#777",
          marginBottom: "0.85rem",
        }}
      >
        Tenants — operator controls
      </div>

      {tenants === undefined && <p style={{ color: "#999" }}>Loading…</p>}
      {tenants && tenants.length === 0 && (
        <p style={{ color: "#999" }}>
          No tenants yet. They'll appear here as the agent ships hypotheses.
        </p>
      )}
      {tenants && tenants.length > 0 && (
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontVariantNumeric: "tabular-nums",
            fontSize: "0.88rem",
          }}
        >
          <thead>
            <tr style={{ color: "#777", textAlign: "left" }}>
              <th style={cellStyle}>Subdomain</th>
              <th style={cellStyle}>Headline</th>
              <th style={cellStyle}>Status</th>
              <th style={cellStyle}>Created</th>
              <th style={cellStyle}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {tenants.map((t) => (
              <TenantRow
                key={t._id}
                subdomain={t.subdomain}
                headline={t.displayCopy.headline}
                status={t.status}
                createdAt={t.createdAt}
              />
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function TenantRow({
  subdomain,
  headline,
  status,
  createdAt,
}: {
  subdomain: string;
  headline: string;
  status: "live" | "paused" | "killed";
  createdAt: number;
}) {
  const [busy, setBusy] = useState<"cancel" | "refund" | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function call(kind: "cancel" | "refund") {
    if (kind === "refund") {
      const ok = window.confirm(
        `Refund every paid order for ${subdomain} and kill the storefront? This cannot be undone.`,
      );
      if (!ok) return;
    }
    setBusy(kind);
    setMsg(null);
    try {
      const path =
        kind === "cancel"
          ? `/api/operator/cancel/${encodeURIComponent(subdomain)}`
          : `/api/operator/force-refund/${encodeURIComponent(subdomain)}`;
      const r = await fetch(path, { method: "POST" });
      const body = await r.json();
      if (!r.ok) {
        setMsg(`Failed: ${body.error ?? r.statusText}`);
      } else if (kind === "refund") {
        setMsg(
          `Refunded ${body.refunded} of ${body.matched} (skipped ${body.skipped}, failed ${body.failed}).`,
        );
      } else {
        setMsg(`Killed.`);
      }
    } catch (err) {
      setMsg(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(null);
    }
  }

  const isLive = status === "live";
  return (
    <tr style={{ borderTop: "1px solid #f1eee9" }}>
      <td style={{ ...cellStyle, fontFamily: "ui-monospace,monospace" }}>
        {subdomain}
      </td>
      <td style={{ ...cellStyle, color: "#444" }}>{headline}</td>
      <td style={cellStyle}>
        <span style={{ color: statusColor(status), fontWeight: 600 }}>
          {status}
        </span>
      </td>
      <td style={{ ...cellStyle, color: "#777" }}>
        {fmtRelativeTime(createdAt)}
      </td>
      <td style={cellStyle}>
        <div
          style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}
        >
          <button
            type="button"
            onClick={() => call("cancel")}
            disabled={!isLive || busy !== null}
            style={btnStyle(!isLive || busy !== null, false)}
          >
            {busy === "cancel" ? "Killing…" : "Kill"}
          </button>
          <button
            type="button"
            onClick={() => call("refund")}
            disabled={busy !== null}
            style={btnStyle(busy !== null, true)}
          >
            {busy === "refund" ? "Refunding…" : "Force-refund all"}
          </button>
          {msg && (
            <span style={{ fontSize: "0.75rem", color: "#555" }}>{msg}</span>
          )}
        </div>
      </td>
    </tr>
  );
}

const cellStyle = {
  padding: "0.45rem 0.6rem 0.45rem 0",
  verticalAlign: "top" as const,
};

function btnStyle(disabled: boolean, danger: boolean): React.CSSProperties {
  return {
    fontSize: "0.78rem",
    padding: "0.3rem 0.7rem",
    borderRadius: 6,
    border: `1px solid ${danger ? "#c53030" : "#d6d3cc"}`,
    background: disabled ? "#eee" : danger ? "#fff5f5" : "#fafaf7",
    color: disabled ? "#999" : danger ? "#c53030" : "#333",
    cursor: disabled ? "default" : "pointer",
    fontWeight: 500,
  };
}

function statusColor(s: "live" | "paused" | "killed"): string {
  if (s === "live") return "#0a7d3b";
  if (s === "paused") return "#a06800";
  return "#7a7a7a";
}
