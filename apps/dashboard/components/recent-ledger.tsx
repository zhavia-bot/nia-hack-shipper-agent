"use client";

import { useQuery } from "convex/react";
import { api } from "@autodrop/convex/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { publicEnv } from "@/lib/env";
import { fmtRelativeTime, fmtUsd } from "@/lib/format";

const TYPE_CLS: Record<string, string> = {
  charge: "text-emerald-600 dark:text-emerald-400",
  refund: "text-rose-600 dark:text-rose-400",
  ad_spend: "text-amber-700 dark:text-amber-400",
};

export function RecentLedger() {
  const { DASHBOARD_TOKEN } = publicEnv();
  const events = useQuery(api.dashboard.recentLedger, {
    token: DASHBOARD_TOKEN,
    limit: 25,
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Recent ledger events
        </CardTitle>
      </CardHeader>
      <CardContent>
        {events === undefined && (
          <p className="text-sm text-muted-foreground">Loading…</p>
        )}
        {events && events.length === 0 && (
          <p className="text-sm text-muted-foreground">No events yet.</p>
        )}
        {events && events.length > 0 && (
          <ul className="divide-y divide-border/60">
            {events.map((e) => (
              <li
                key={e._id}
                className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-baseline gap-3 py-2 text-sm tabular-nums"
              >
                <span
                  className={
                    "font-semibold capitalize " + (TYPE_CLS[e.type] ?? "text-foreground")
                  }
                >
                  {e.type.replace("_", " ")}
                </span>
                <span className="font-semibold">{fmtUsd(e.amountUsd)}</span>
                <span className="text-xs text-muted-foreground">
                  {fmtRelativeTime(e.timestamp)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
