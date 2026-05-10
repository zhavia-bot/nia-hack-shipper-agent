"use client";

import { useQuery } from "convex/react";
import { api } from "@autodrop/convex/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { publicEnv } from "@/lib/env";
import { fmtUsd } from "@/lib/format";

export function BudgetState() {
  const { DASHBOARD_TOKEN } = publicEnv();
  const snap = useQuery(api.dashboard.budgetSnapshot, {
    token: DASHBOARD_TOKEN,
  });

  if (snap === undefined) return <Wrap>Loading…</Wrap>;
  if (snap === null)
    return (
      <Wrap>
        <p className="text-sm text-muted-foreground">
          Budget singleton not initialized. Run{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
            system:initBudgetState
          </code>{" "}
          via the admin token.
        </p>
      </Wrap>
    );

  const dayCap = snap.caps.perDayUsd;
  const daySpent = snap.today.spentUsd;
  const dayPct = dayCap > 0 ? Math.min(1, daySpent / dayCap) : 0;

  return (
    <Wrap>
      {snap.killSwitch.halt && (
        <div className="mb-3 rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-900 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200">
          KILL SWITCH ENGAGED
          {snap.killSwitch.reason && (
            <span className="font-normal">: {snap.killSwitch.reason}</span>
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
          snap.active.reservedUsd,
        )} (${snap.active.count})`}
      />
      <Row label="Per-experiment cap" value={fmtUsd(snap.caps.perExperimentUsd)} />
      <Row label="Per-generation cap" value={fmtUsd(snap.caps.perGenerationUsd)} />
    </Wrap>
  );
}

function Wrap({ children }: { children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Budget
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1 text-sm tabular-nums">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}

function Bar({ pct }: { pct: number }) {
  const danger = pct >= 0.8;
  return (
    <div className="my-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
      <div
        className={"h-full transition-all duration-200 " + (danger ? "bg-rose-500" : "bg-emerald-500")}
        style={{ width: `${Math.round(pct * 100)}%` }}
      />
    </div>
  );
}
