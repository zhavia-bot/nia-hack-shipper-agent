"use client";

import { useQuery } from "convex/react";
import { api } from "@autoresearch/convex/api";
import { publicEnv } from "@/lib/env";
import { fmtRelativeTime, fmtUsd } from "@/lib/format";

export function RecentLedger() {
  const { DASHBOARD_TOKEN } = publicEnv();
  const events = useQuery(api.dashboard.recentLedger, {
    token: DASHBOARD_TOKEN,
    limit: 25,
  });

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
        Recent ledger events
      </div>
      {events === undefined && <p style={{ color: "#999" }}>Loading…</p>}
      {events && events.length === 0 && (
        <p style={{ color: "#999" }}>No events yet.</p>
      )}
      {events && events.length > 0 && (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {events.map((e) => (
            <li
              key={e._id}
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0,1fr) auto auto",
                gap: "0.75rem",
                padding: "0.4rem 0",
                borderBottom: "1px solid #f1eee9",
                alignItems: "baseline",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              <span
                style={{
                  textTransform: "capitalize",
                  color: typeColor(e.type),
                  fontWeight: 600,
                  fontSize: "0.9rem",
                }}
              >
                {e.type.replace("_", " ")}
              </span>
              <span style={{ fontWeight: 600 }}>{fmtUsd(e.amountUsd)}</span>
              <span style={{ color: "#888", fontSize: "0.85rem" }}>
                {fmtRelativeTime(e.timestamp)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function typeColor(t: string): string {
  switch (t) {
    case "charge":
      return "#0a7d33";
    case "refund":
      return "#9e1d1d";
    case "ad_spend":
      return "#a86700";
    default:
      return "#444";
  }
}
