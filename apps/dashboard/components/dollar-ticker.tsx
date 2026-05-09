"use client";

import { useQuery } from "convex/react";
import { api } from "@autoresearch/convex/api";
import { publicEnv } from "@/lib/env";
import { fmtUsd } from "@/lib/format";

/**
 * The single most important number on the screen. Convex realtime sub —
 * updates the moment a webhook writes a new charge.
 */
export function DollarTicker() {
  const { DASHBOARD_TOKEN } = publicEnv();
  const data = useQuery(api.dashboard.netDollars, { token: DASHBOARD_TOKEN });

  const net = data?.net ?? null;
  const positive = (net ?? 0) >= 0;

  return (
    <section
      style={{
        padding: "1.75rem 2rem",
        borderRadius: 14,
        background: "#0e0e0e",
        color: "#fff",
        boxShadow: "0 1px 0 rgba(255,255,255,0.06) inset",
      }}
    >
      <div
        style={{
          fontSize: "0.85rem",
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "#9aa0a6",
          marginBottom: "0.4rem",
        }}
      >
        Net dollars (Stripe balance, ledger view)
      </div>
      <div
        style={{
          fontSize: "3.4rem",
          fontWeight: 700,
          letterSpacing: "-0.02em",
          color: positive ? "#69f08c" : "#ff8888",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {data ? fmtUsd(net, { sign: true }) : "…"}
      </div>
      {data && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(0,1fr))",
            gap: "0.75rem",
            marginTop: "1.1rem",
            fontSize: "0.95rem",
            color: "#cfd2d6",
          }}
        >
          <Stat label="Charges" value={fmtUsd(data.charges)} positive />
          <Stat label="Refunds" value={fmtUsd(data.refunds)} />
          <Stat label="Ad spend" value={fmtUsd(data.adSpend)} />
        </div>
      )}
    </section>
  );
}

function Stat({
  label,
  value,
  positive,
}: {
  label: string;
  value: string;
  positive?: boolean;
}) {
  return (
    <div>
      <div style={{ color: "#7e848a", fontSize: "0.78rem" }}>{label}</div>
      <div
        style={{
          fontVariantNumeric: "tabular-nums",
          fontWeight: 600,
          color: positive ? "#9be4ad" : "#cfd2d6",
        }}
      >
        {value}
      </div>
    </div>
  );
}
