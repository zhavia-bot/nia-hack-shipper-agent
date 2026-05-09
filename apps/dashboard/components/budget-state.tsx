"use client";

import { useQuery } from "convex/react";
import { api } from "@autoresearch/convex/api";
import { publicEnv } from "@/lib/env";
import { fmtUsd } from "@/lib/format";

export function BudgetState() {
  const { DASHBOARD_TOKEN } = publicEnv();
  const snap = useQuery(api.dashboard.budgetSnapshot, {
    token: DASHBOARD_TOKEN,
  });

  if (snap === undefined) return <Card title="Budget">Loading…</Card>;
  if (snap === null)
    return (
      <Card title="Budget">
        <p style={{ color: "#999" }}>
          Budget singleton not initialized. Run
          <code> system:initBudgetState</code> via the admin token.
        </p>
      </Card>
    );

  const dayCap = snap.caps.perDayUsd;
  const daySpent = snap.today.spentUsd;
  const dayPct = dayCap > 0 ? Math.min(1, daySpent / dayCap) : 0;

  return (
    <Card title="Budget">
      {snap.killSwitch.halt && (
        <div
          style={{
            background: "#fff4f0",
            border: "1px solid #ffb3a1",
            color: "#7d2010",
            padding: "0.6rem 0.8rem",
            borderRadius: 8,
            marginBottom: "1rem",
            fontWeight: 600,
          }}
        >
          KILL SWITCH ENGAGED
          {snap.killSwitch.reason && (
            <span style={{ fontWeight: 400 }}>: {snap.killSwitch.reason}</span>
          )}
        </div>
      )}

      <Row
        label="Today's spend / cap"
        value={`${fmtUsd(daySpent)} / ${fmtUsd(dayCap)}`}
      />
      <Bar pct={dayPct} />

      <Row
        label="Active reservations"
        value={`${fmtUsd(snap.active.spentUsd)} of ${fmtUsd(
          snap.active.reservedUsd
        )} (${snap.active.count})`}
      />
      <Row
        label="Per-experiment cap"
        value={fmtUsd(snap.caps.perExperimentUsd)}
      />
      <Row
        label="Per-generation cap"
        value={fmtUsd(snap.caps.perGenerationUsd)}
      />
    </Card>
  );
}

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
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
        {title}
      </div>
      {children}
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        padding: "0.4rem 0",
        fontVariantNumeric: "tabular-nums",
        fontSize: "0.95rem",
      }}
    >
      <span style={{ color: "#666" }}>{label}</span>
      <span style={{ fontWeight: 600 }}>{value}</span>
    </div>
  );
}

function Bar({ pct }: { pct: number }) {
  const danger = pct >= 0.8;
  return (
    <div
      style={{
        height: 6,
        background: "#eee",
        borderRadius: 3,
        overflow: "hidden",
        margin: "0.25rem 0 0.75rem",
      }}
    >
      <div
        style={{
          width: `${Math.round(pct * 100)}%`,
          height: "100%",
          background: danger ? "#c2282d" : "#0a7d33",
          transition: "width 200ms ease",
        }}
      />
    </div>
  );
}
