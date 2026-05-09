"use client";

import { useQuery } from "convex/react";
import { useState } from "react";
import { api } from "@autoresearch/convex/api";
import { publicEnv } from "@/lib/env";
import { fmtRelativeTime, fmtRoas, fmtUsd, statusColor } from "@/lib/format";

const STATUSES = ["all", "pending", "keep", "refine", "discard", "crash"] as const;

export function ExperimentsFeed() {
  const { DASHBOARD_TOKEN } = publicEnv();
  const [filter, setFilter] = useState<(typeof STATUSES)[number]>("all");

  const xs = useQuery(api.dashboard.recentExperiments, {
    token: DASHBOARD_TOKEN,
    limit: 100,
  });

  const filtered = xs?.filter((x) => filter === "all" || x.status === filter);

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
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "0.85rem",
          gap: "1rem",
          flexWrap: "wrap",
        }}
      >
        <div
          style={{
            fontSize: "0.78rem",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            color: "#777",
          }}
        >
          Experiments
        </div>
        <div style={{ display: "flex", gap: "0.4rem" }}>
          {STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setFilter(s)}
              style={{
                padding: "0.2rem 0.6rem",
                fontSize: "0.78rem",
                background: filter === s ? "#111" : "transparent",
                color: filter === s ? "#fff" : "#444",
                border: "1px solid #d8d5cf",
                borderRadius: 999,
                cursor: "pointer",
              }}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {filtered === undefined && <p style={{ color: "#999" }}>Loading…</p>}
      {filtered && filtered.length === 0 && (
        <p style={{ color: "#999" }}>No experiments at this filter.</p>
      )}
      {filtered && filtered.length > 0 && (
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
              <th style={cellStyle}>Status</th>
              <th style={cellStyle}>Bucket</th>
              <th style={cellStyle}>Spend</th>
              <th style={cellStyle}>Revenue</th>
              <th style={cellStyle}>ROAS</th>
              <th style={cellStyle}>Visitors</th>
              <th style={cellStyle}>Started</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((x) => (
              <tr key={x._id} style={{ borderTop: "1px solid #f1eee9" }}>
                <td style={cellStyle}>
                  <span
                    style={{
                      color: statusColor(x.status),
                      fontWeight: 600,
                    }}
                  >
                    {x.status}
                  </span>
                </td>
                <td style={{ ...cellStyle, color: "#444" }}>
                  {x.bucket.niche}/{x.bucket.format}/{x.bucket.channel}
                </td>
                <td style={cellStyle}>{fmtUsd(x.spendUsd)}</td>
                <td style={cellStyle}>{fmtUsd(x.revenueUsd)}</td>
                <td style={cellStyle}>{fmtRoas(x.roasMean)}</td>
                <td style={cellStyle}>{x.visitors}</td>
                <td style={{ ...cellStyle, color: "#777" }}>
                  {fmtRelativeTime(x.startedAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

const cellStyle = {
  padding: "0.45rem 0.6rem 0.45rem 0",
  verticalAlign: "top" as const,
};
