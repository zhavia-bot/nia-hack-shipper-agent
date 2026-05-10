"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { motion } from "motion/react";
import { api } from "@autodrop/convex/api";
import { Pause, View } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmModal } from "@/components/confirm-modal";
import { fmtRelativeTime, fmtRoas, fmtUsd } from "@/lib/format";

const STATUSES = ["all", "pending", "keep", "refine", "discard", "crash"] as const;
type StatusFilter = (typeof STATUSES)[number];

interface Props {
  limit?: number;
  showFilter?: boolean;
}

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  pending: { label: "running", cls: "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/30" },
  keep: { label: "keep", cls: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30" },
  refine: { label: "refine", cls: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30" },
  discard: { label: "discard", cls: "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30" },
  crash: { label: "crash", cls: "bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/30" },
};

export function ExperimentsTable({ limit = 50, showFilter = true }: Props) {
  const xs = useQuery(api.experiments.mine);
  const [filter, setFilter] = useState<StatusFilter>("all");

  const filtered = xs
    ?.filter((x) => filter === "all" || x.status === filter)
    .slice(0, limit);

  return (
    <div className="space-y-3">
      {showFilter && (
        <div className="flex flex-wrap items-center gap-1.5">
          {STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setFilter(s)}
              className={
                "rounded-full border px-3 py-1 text-xs transition-colors " +
                (filter === s
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-background text-muted-foreground hover:text-foreground")
              }
            >
              {s}
            </button>
          ))}
        </div>
      )}
      <div className="overflow-hidden rounded-xl border bg-card">
        {xs === undefined && (
          <p className="p-6 text-sm text-muted-foreground">Loading…</p>
        )}
        {xs && filtered && filtered.length === 0 && (
          <p className="p-6 text-sm text-muted-foreground">
            {filter === "all"
              ? "No experiments yet. Start a generation above."
              : `No experiments with status "${filter}".`}
          </p>
        )}
        {xs && filtered && filtered.length > 0 && (
          <table className="w-full text-sm tabular-nums">
            <thead>
              <tr className="border-b bg-muted/30 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Bucket</th>
                <th className="px-4 py-2 font-medium text-right">Spend</th>
                <th className="px-4 py-2 font-medium text-right">Revenue</th>
                <th className="px-4 py-2 font-medium text-right">ROAS</th>
                <th className="px-4 py-2 font-medium text-right">Visitors</th>
                <th className="px-4 py-2 font-medium">Started</th>
                <th className="px-4 py-2 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((x, i) => (
                <motion.tr
                  key={x._id}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.18, delay: i * 0.015 }}
                  className="border-b last:border-b-0 hover:bg-muted/20"
                >
                  <td className="px-4 py-2.5">
                    <StatusBadge status={x.status} />
                  </td>
                  <td className="px-4 py-2.5 text-foreground/80">
                    <span className="font-mono text-xs">
                      {x.bucket.niche}/{x.bucket.category}/{x.bucket.channel}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right">{fmtUsd(x.spendUsd)}</td>
                  <td className="px-4 py-2.5 text-right">{fmtUsd(x.revenueUsd)}</td>
                  <td className="px-4 py-2.5 text-right">{fmtRoas(x.roasMean)}</td>
                  <td className="px-4 py-2.5 text-right">{x.visitors}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {fmtRelativeTime(x.startedAt)}
                  </td>
                  <td className="px-4 py-2.5">
                    <RowActions id={x._id} status={x.status} />
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_BADGE[status] ?? { label: status, cls: "" };
  return (
    <Badge variant="outline" className={meta.cls + " font-medium"}>
      {status === "pending" && (
        <span className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-sky-500" />
      )}
      {meta.label}
    </Badge>
  );
}

function RowActions({ id, status }: { id: string; status: string }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const stop = useMutation(api.experiments.stopByOwner);
  const canStop = status === "pending";

  async function doStop() {
    setBusy(true);
    setErr(null);
    try {
      await stop({ id: id as never });
      setOpen(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center justify-end gap-1.5">
      <Button asChild size="xs" variant="ghost" className="gap-1">
        <Link href={`/console/experiments/${id}`}>
          <View className="h-3 w-3" />
          View
        </Link>
      </Button>
      {canStop && (
        <Button
          size="xs"
          variant="outline"
          className="gap-1 text-rose-600 hover:text-rose-700"
          onClick={() => setOpen(true)}
        >
          <Pause className="h-3 w-3" />
          Stop
        </Button>
      )}
      <ConfirmModal
        open={open}
        title="Stop this experiment?"
        confirmLabel="Stop"
        destructive
        busy={busy}
        onCancel={() => setOpen(false)}
        onConfirm={doStop}
        body={
          <div className="space-y-2">
            <p>
              The experiment will be marked <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">discard</code> and any storefront tied to it will go to <code className="font-mono text-xs">killed</code>. No money moves.
            </p>
            <p className="text-xs">
              For paid orders, use <em>Force-refund all</em> on the tenant.
            </p>
            {err && <p className="text-xs text-destructive">{err}</p>}
          </div>
        }
      />
    </div>
  );
}
