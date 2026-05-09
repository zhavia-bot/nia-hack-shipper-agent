"use client";

import { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@autoresearch/convex/api";
import { fmtUsd } from "@/lib/format";

/**
 * P8.14 — anonymized live revenue ticker for the public landing page.
 * Pulls aggregate-only totals from `dashboard:globalAnonStats`; no
 * per-user attribution leaves Convex. The "agent network" framing
 * makes it clear this is the platform total, not the visitor's.
 *
 * Pulse animation fires whenever the gross-charged number ticks up,
 * which happens within a Convex round-trip of every paid Checkout.
 */
export function LiveRevenueTicker() {
  const data = useQuery(api.dashboard.globalAnonStats, {});
  const [flash, setFlash] = useState(false);
  const [prev, setPrev] = useState<number | null>(null);

  useEffect(() => {
    if (!data) return;
    if (prev == null) {
      setPrev(data.grossChargedUsd);
      return;
    }
    if (data.grossChargedUsd > prev) {
      setFlash(true);
      setPrev(data.grossChargedUsd);
      const id = setTimeout(() => setFlash(false), 900);
      return () => clearTimeout(id);
    }
  }, [data, prev]);

  return (
    <section
      style={{
        padding: "1.75rem 2rem",
        borderRadius: 14,
        background: "#0e0e0e",
        color: "#fff",
        boxShadow: flash
          ? "0 0 0 2px #69f08c, 0 1px 0 rgba(255,255,255,0.06) inset"
          : "0 1px 0 rgba(255,255,255,0.06) inset",
        transition: "box-shadow 600ms ease-out",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "1rem",
          marginBottom: "0.4rem",
        }}
      >
        <div
          style={{
            fontSize: "0.85rem",
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: "#9aa0a6",
          }}
        >
          Agent network — gross revenue (anonymized)
        </div>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.4rem",
            fontSize: "0.72rem",
            color: "#9aa0a6",
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: "#26d07c",
              boxShadow: "0 0 6px #26d07c",
              display: "inline-block",
            }}
          />
          live
        </span>
      </div>
      <div
        style={{
          fontSize: "3.4rem",
          fontWeight: 700,
          letterSpacing: "-0.02em",
          color: "#69f08c",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {data ? fmtUsd(data.grossChargedUsd) : "…"}
      </div>
      {data && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, minmax(0,1fr))",
            gap: "0.75rem",
            marginTop: "1.1rem",
            fontSize: "0.95rem",
            color: "#cfd2d6",
          }}
        >
          <Stat label="Transactions" value={data.transactions.toLocaleString()} />
          <Stat label="Refunded" value={fmtUsd(data.refundedUsd)} />
          <Stat label="Net settled" value={fmtUsd(data.netSettledUsd)} />
          <Stat
            label="Live storefronts"
            value={data.liveTenants.toLocaleString()}
          />
        </div>
      )}
      <div
        style={{
          marginTop: "1.1rem",
          fontSize: "0.78rem",
          color: "#7e848a",
        }}
      >
        Aggregate of every operator running on the platform. No individual
        accounts, charges, or storefronts identified.
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ color: "#7e848a", fontSize: "0.78rem" }}>{label}</div>
      <div
        style={{
          fontVariantNumeric: "tabular-nums",
          fontWeight: 600,
          color: "#cfd2d6",
        }}
      >
        {value}
      </div>
    </div>
  );
}
