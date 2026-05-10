"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@autodrop/convex/api";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ForceRefundButton } from "@/components/force-refund-button";
import { AgentLogStream } from "@/components/agent-log-stream";
import { fmtRelativeTime, fmtRoas, fmtUsd, fmtPct } from "@/lib/format";

const STATUS_CLS: Record<string, string> = {
  pending: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  keep: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  refine: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  discard: "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300",
  crash: "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300",
};

export function ExperimentDetail({ id }: { id: string }) {
  const data = useQuery(api.experiments.detailForOwner, { id: id as never });

  if (data === undefined) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }
  if (data === null) {
    return (
      <Card>
        <CardContent className="space-y-2 py-6">
          <h2 className="text-lg font-semibold">Not found</h2>
          <p className="text-sm text-muted-foreground">
            Either this experiment doesn&rsquo;t exist or it&rsquo;s on another tenant.
          </p>
        </CardContent>
      </Card>
    );
  }

  const { experiment: x, tenant } = data;
  const conversionRate = x.visitors > 0 ? x.conversions / x.visitors : null;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
            {x.bucket.niche} · {x.bucket.category} · {x.bucket.priceTier} · {x.bucket.channel}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">
            Generation {x.generation} · {x.hypothesisId}
          </h1>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline" className={STATUS_CLS[x.status]}>
              {x.status === "pending" && (
                <span className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-sky-500" />
              )}
              {x.status}
            </Badge>
            <span>started {fmtRelativeTime(x.startedAt)}</span>
            {x.decidedAt && <span>· decided {fmtRelativeTime(x.decidedAt)}</span>}
            {x.refunded && (
              <Badge variant="outline" className="border-emerald-500/30 text-emerald-700 dark:text-emerald-300">
                refunded
              </Badge>
            )}
            {x.disputed && (
              <Badge variant="outline" className="border-rose-500/30 text-rose-700 dark:text-rose-300">
                disputed
              </Badge>
            )}
          </div>
        </div>
        {tenant && (
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`https://${tenant.subdomain}.team.vercel.app`}
              target="_blank"
              className="inline-flex items-center gap-1 rounded-md border bg-card px-3 py-1.5 text-xs font-mono hover:bg-accent/30"
            >
              {tenant.subdomain}.team.vercel.app
            </Link>
            <ForceRefundButton subdomain={tenant.subdomain} label="Force-refund this storefront" />
          </div>
        )}
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Spend" value={fmtUsd(x.spendUsd)} />
        <Stat label="Revenue" value={fmtUsd(x.revenueUsd)} />
        <Stat label="ROAS" value={fmtRoas(x.roasMean)} />
        <Stat label="Conversion rate" value={fmtPct(conversionRate)} sub={`${x.conversions}/${x.visitors}`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <AgentLogStream experimentId={id} limit={100} maxHeightClass="max-h-[520px]" />
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Rationale
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap text-sm leading-relaxed">
                {x.rationale || "—"}
              </p>
            </CardContent>
          </Card>
          {x.notes && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Notes
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                  {x.notes}
                </p>
              </CardContent>
            </Card>
          )}
          {x.roasLower != null && x.roasUpper != null && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  ROAS interval
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="font-mono text-sm tabular-nums">
                  [{x.roasLower.toFixed(2)}, {x.roasUpper.toFixed(2)}]
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardContent className="py-4">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
        <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
        {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  );
}
