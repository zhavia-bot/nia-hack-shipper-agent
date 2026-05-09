"use client";

import { useQuery } from "convex/react";
import { useMemo } from "react";
import { api } from "@autoresearch/convex/api";
import { publicEnv } from "@/lib/env";
import { fmtRoas } from "@/lib/format";

interface Cell {
  niche: string;
  channel: string;
  count: number;
  meanRoas: number | null;
  totalSpend: number;
}

export function BucketHeatmap() {
  const { DASHBOARD_TOKEN } = publicEnv();
  const data = useQuery(api.dashboard.bucketRollup, {
    token: DASHBOARD_TOKEN,
  });

  const { rows, niches, channels } = useMemo(() => {
    if (!data) return { rows: new Map<string, Cell>(), niches: [], channels: [] };
    const map = new Map<string, Cell>();
    const nicheSet = new Set<string>();
    const channelSet = new Set<string>();
    for (const x of data) {
      const key = `${x.bucket.niche}|${x.bucket.channel}`;
      const cur = map.get(key) ?? {
        niche: x.bucket.niche,
        channel: x.bucket.channel,
        count: 0,
        meanRoas: null,
        totalSpend: 0,
      };
      cur.count += 1;
      cur.totalSpend += x.spendUsd;
      // Cumulative average of roas across non-null entries.
      if (x.roasMean != null) {
        const prev = cur.meanRoas ?? 0;
        const n = (cur.meanRoas == null ? 0 : 1) + 1;
        cur.meanRoas = (prev * (n - 1) + x.roasMean) / n;
      }
      map.set(key, cur);
      nicheSet.add(x.bucket.niche);
      channelSet.add(x.bucket.channel);
    }
    return {
      rows: map,
      niches: [...nicheSet].sort(),
      channels: [...channelSet].sort(),
    };
  }, [data]);

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
        Bucket heatmap (niche × channel, mean ROAS)
      </div>
      {data === undefined && <p style={{ color: "#999" }}>Loading…</p>}
      {data && data.length === 0 && (
        <p style={{ color: "#999" }}>No experiments yet.</p>
      )}
      {data && data.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              borderCollapse: "collapse",
              fontVariantNumeric: "tabular-nums",
              fontSize: "0.85rem",
            }}
          >
            <thead>
              <tr>
                <th style={headerCellStyle}></th>
                {channels.map((c) => (
                  <th key={c} style={headerCellStyle}>
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {niches.map((n) => (
                <tr key={n}>
                  <th style={{ ...headerCellStyle, textAlign: "right" }}>
                    {n}
                  </th>
                  {channels.map((c) => {
                    const cell = rows.get(`${n}|${c}`);
                    return (
                      <td
                        key={c}
                        style={{
                          padding: 0,
                          minWidth: 86,
                        }}
                      >
                        <Cell cell={cell} />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Cell({ cell }: { cell: Cell | undefined }) {
  if (!cell) {
    return (
      <div
        style={{
          padding: "0.4rem 0.6rem",
          background: "#fafaf7",
          color: "#bbb",
          textAlign: "center",
          border: "1px solid #f1eee9",
        }}
      >
        —
      </div>
    );
  }
  const r = cell.meanRoas ?? null;
  const bg =
    r == null
      ? "#f4f2ed"
      : r >= 1.0
      ? lerp("#dff5e3", "#0a7d33", Math.min(1, (r - 1) / 2))
      : lerp("#fdecec", "#9e1d1d", Math.min(1, (1 - r) / 1));
  const fg = r == null ? "#666" : r >= 1.0 ? "#062a14" : "#3a0808";
  return (
    <div
      style={{
        padding: "0.4rem 0.6rem",
        background: bg,
        color: fg,
        textAlign: "center",
        border: "1px solid #f1eee9",
      }}
    >
      <div style={{ fontWeight: 600 }}>{fmtRoas(r)}</div>
      <div style={{ fontSize: "0.7rem", opacity: 0.7 }}>
        n={cell.count}
      </div>
    </div>
  );
}

const headerCellStyle = {
  padding: "0.3rem 0.6rem",
  color: "#666",
  fontWeight: 500,
  textTransform: "capitalize" as const,
  fontSize: "0.78rem",
};

function lerp(a: string, b: string, t: number): string {
  const ar = parseInt(a.slice(1, 3), 16);
  const ag = parseInt(a.slice(3, 5), 16);
  const ab = parseInt(a.slice(5, 7), 16);
  const br = parseInt(b.slice(1, 3), 16);
  const bg = parseInt(b.slice(3, 5), 16);
  const bb = parseInt(b.slice(5, 7), 16);
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `#${r.toString(16).padStart(2, "0")}${g
    .toString(16)
    .padStart(2, "0")}${bl.toString(16).padStart(2, "0")}`;
}
